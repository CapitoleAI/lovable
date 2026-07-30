import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { brandIdentitySchema, pageContentSchema, sitemapPageSchema } from "./sites-schema";
import { getPromptContent, PROMPT_DEFAULTS, type PromptKey } from "./prompts.functions";

// Backwards-compatible export used by old chat clients before the DB-backed
// editor landed. Now serves as a quick fallback to defaults.
export const getSystemPrompts = createServerFn({ method: "GET" }).handler(async () => {
  return {
    edit: PROMPT_DEFAULTS["orchestrator.edit"].content,
    empty: PROMPT_DEFAULTS["orchestrator.empty"].content,
    create: PROMPT_DEFAULTS["orchestrator.create.step1"].content,
  };
});




type AuthSession = { authenticated?: boolean; email?: string };

function sessionCfg() {
  const password = process.env.SESSION_SECRET;
  if (!password) throw new Error("SESSION_SECRET is not set");
  return {
    password,
    name: "auth-session",
    maxAge: 60 * 60 * 24 * 7,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
      partitioned: true,
    },
  };
}

async function requireUser(): Promise<string> {
  const session = await useSession<AuthSession>(sessionCfg());
  if (!session.data.authenticated || !session.data.email) {
    throw new Error("Not authenticated");
  }
  return session.data.email;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function callAiJson<T>(system: string, user: string, fallback: T): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}


type OpenAiTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type ChatMsg =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };

async function callAiWithTools(
  system: string,
  user: string,
  tools: OpenAiTool[],
): Promise<{ reply: string; rawCalls: Array<{ name: string; arguments: unknown }> }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { reply: "", rawCalls: [] };
  const messages: ChatMsg[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: true,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  };
  const msg = json.choices?.[0]?.message;
  let reply = (msg?.content ?? "").trim();
  const rawCalls: Array<{ name: string; arguments: unknown }> = [];
  for (const c of msg?.tool_calls ?? []) {
    const name = c.function?.name;
    if (!name) continue;
    let args: unknown = {};
    try {
      args = c.function?.arguments ? JSON.parse(c.function.arguments) : {};
    } catch {
      args = {};
    }
    rawCalls.push({ name, arguments: args });
  }
  // gpt-4o-mini often returns empty content when it fires tool_calls.
  // Do a lightweight follow-up (no tools) to get a natural French reply
  // that reflects what was just decided/asked.
  if (!reply) {
    try {
      const followupMessages = [
        { role: "system", content: system },
        { role: "user", content: user },
        {
          role: "assistant",
          content:
            rawCalls.length > 0
              ? `J'ai décidé d'appliquer ces actions: ${JSON.stringify(rawCalls)}`
              : "(pas d'action)",
        },
        {
          role: "user",
          content:
            "Réponds maintenant en français, 1 à 3 phrases max, en confirmant ce que tu viens de faire ET en posant la prochaine question utile pour avancer. Ne répète pas juste 'OK'.",
        },
      ];
      const r2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini", messages: followupMessages }),
      });
      if (r2.ok) {
        const j2 = (await r2.json()) as { choices?: Array<{ message?: { content?: string } }> };
        reply = (j2.choices?.[0]?.message?.content ?? "").trim();
      }
    } catch {
      /* keep reply empty; caller falls back */
    }
  }
  return { reply, rawCalls };
}



// -------------------- Chat Orchestrator --------------------

const actionSchema = z.discriminatedUnion("type", [
  // Edit-mode actions
  z.object({
    type: z.literal("update_colors"),
    colors: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
      neutral: z.string().optional(),
      background: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("update_page_content"),
    slug: z.string(),
    seo_title: z.string().optional(),
    instruction: z.string().min(1),
  }),
  z.object({
    type: z.literal("add_page"),
    title: z.string().min(1),
    slug: z.string().optional(),
    instruction: z.string().optional(),
  }),
  z.object({
    type: z.literal("remove_page"),
    slug: z.string().min(1),
  }),
  z.object({
    type: z.literal("open_create_wizard"),
  }),
  // Create-mode actions
  z.object({
    type: z.literal("advance_to_brand_studio"),
    name: z.string().optional(),
    theme: z.string().optional(),
    city: z.string().optional(),
    brief: z.string().optional(),
    hint_colors: z.array(z.string()).max(6).optional(),
  }),
  z.object({
    type: z.literal("update_creation_brief"),
    name: z.string().optional(),
    theme: z.string().optional(),
    city: z.string().optional(),
    brief: z.string().optional(),
    hint_colors: z.array(z.string()).max(6).optional(),
  }),
  z.object({
    type: z.literal("update_creation_theme"),
    colors: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
      neutral: z.string().optional(),
      background: z.string().optional(),
    }).optional(),
    selected_header_id: z.string().optional(),
    selected_hero_id: z.string().optional(),
    selected_footer_id: z.string().optional(),
    selected_section_ids: z.array(z.string()).optional(),
    design_style: z.string().optional(),
    brand_name: z.string().optional(),
    tagline: z.string().optional(),
  }),
  z.object({
    type: z.literal("generate_seo_and_tree"),
    main_keyword: z.string().optional(),
    keywords: z.array(z.string()).max(30).optional(),
    sitemap: z.array(sitemapPageSchema).max(30).optional(),
  }),
  z.object({
    type: z.literal("regenerate_logo"),
    prompt: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("finalize_and_build"),
  }),
  // Phase 3 — Aiguillage / mode application complète
  z.object({
    type: z.literal("select_project_type"),
    project_type: z.enum(["astro_site", "full_app"]),
  }),
  z.object({
    type: z.literal("update_app_architecture"),
    name: z.string().optional(),
    brief: z.string().optional(),
    stack: z.enum(["react_vite", "react_node_express", "nextjs", "node_api"]).optional(),
    features: z.array(z.string()).max(30).optional(),
  }),

]);
export type OrchestratorAction = z.infer<typeof actionSchema>;

const creationContextSchema = z
  .object({
    step: z.number().int().min(1).max(5).optional(),
    name: z.string().optional(),
    theme: z.string().optional(),
    city: z.string().optional(),
    brief: z.string().optional(),
    hint_colors: z.array(z.string()).optional(),
    brand: brandIdentitySchema.partial().nullable().optional(),
    main_keyword: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    sitemap: z.array(z.object({ title: z.string(), slug: z.string() })).optional(),
    // Phase 3
    project_type: z.enum(["astro_site", "full_app"]).nullable().optional(),
    app: z
      .object({
        step: z.number().int().min(1).max(3).optional(),
        name: z.string().optional(),
        brief: z.string().optional(),
        stack: z.string().nullable().optional(),
        features: z.array(z.string()).optional(),
        files: z.array(z.object({ path: z.string() })).optional(),
      })
      .partial()
      .optional(),
  })
  .partial();


const orchestrateSchema = z.object({
  mode: z.enum(["edit", "empty", "create"]),
  message: z.string().trim().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(30)
    .default([]),
  site_context: z
    .object({
      name: z.string().optional(),
      brand: brandIdentitySchema.partial().optional(),
      pages: z
        .array(z.object({ slug: z.string(), seo_title: z.string() }))
        .max(60)
        .default([]),
    })
    .optional(),
  creation_context: creationContextSchema.optional(),
  
});


const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function normalizeRawAction(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const record = raw as Record<string, unknown>;
  if (typeof record.type === "string") return raw;
  const name =
    typeof record.name === "string"
      ? record.name
      : typeof record.action === "string"
        ? record.action
        : typeof (record.function as { name?: unknown } | undefined)?.name === "string"
          ? ((record.function as { name: string }).name)
          : "";
  if (!name) return raw;
  const args =
    record.arguments && typeof record.arguments === "object"
      ? (record.arguments as Record<string, unknown>)
      : record.args && typeof record.args === "object"
        ? (record.args as Record<string, unknown>)
        : {};
  return { ...args, type: name };
}

// ---------- Tool definitions (OpenAI function calling) ----------

const colorsProp = {
  type: "object",
  properties: {
    primary: { type: "string", description: "Hex #RRGGBB" },
    secondary: { type: "string", description: "Hex #RRGGBB" },
    accent: { type: "string", description: "Hex #RRGGBB" },
    neutral: { type: "string", description: "Hex #RRGGBB" },
    background: { type: "string", description: "Hex #RRGGBB" },
  },
  additionalProperties: false,
} as const;

const editTools: OpenAiTool[] = [
  {
    type: "function",
    function: {
      name: "update_colors",
      description: "Met à jour la palette de couleurs du site actif.",
      parameters: {
        type: "object",
        properties: { colors: colorsProp },
        required: ["colors"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_page_content",
      description: "Régénère le contenu HTML d'une page existante à partir d'une instruction.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string" },
          seo_title: { type: "string" },
          instruction: { type: "string", description: "Ce que l'IA doit changer" },
        },
        required: ["slug", "instruction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_page",
      description: "Ajoute une nouvelle page au site (slug déduit si absent).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          slug: { type: "string" },
          instruction: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_page",
      description: "Supprime une page (jamais 'index').",
      parameters: {
        type: "object",
        properties: { slug: { type: "string" } },
        required: ["slug"],
      },
    },
  },
];

const emptyTools: OpenAiTool[] = [
  {
    type: "function",
    function: {
      name: "open_create_wizard",
      description: "Ouvre l'assistant de création de site.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const createTools: OpenAiTool[] = [
  {
    type: "function",
    function: {
      name: "update_creation_brief",
      description:
        "Remplit ou MODIFIE un ou plusieurs champs de l'étape 1 (brief) SANS changer d'étape. À utiliser seulement pour le brief, pas pour changer le nom/tagline affichés dans le Studio de marque à l'étape 2.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          theme: { type: "string" },
          city: { type: "string" },
          brief: { type: "string" },
          hint_colors: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "advance_to_brand_studio",
      description:
        "Passe à l'étape 2 et génère la marque + logo. À n'appeler QUE quand nom + thème + brief sont présents ET l'utilisateur confirme vouloir avancer.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          theme: { type: "string" },
          city: { type: "string" },
          brief: { type: "string" },
          hint_colors: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_creation_theme",
      description:
        "Ajuste à l'étape 2 : couleurs, sélection Header/Hero/Sections/Footer, style de design, nom de marque affiché, tagline/description courte. Utilise cet outil pour tout changement de nom ou description demandé dans le Studio de marque. N'inclus que les champs à changer.",
      parameters: {
        type: "object",
        properties: {
          colors: colorsProp,
          selected_header_id: { type: "string" },
          selected_hero_id: { type: "string" },
          selected_footer_id: { type: "string" },
          selected_section_ids: { type: "array", items: { type: "string" } },
          design_style: { type: "string" },
          brand_name: { type: "string", description: "Nouveau nom de la marque" },
          tagline: { type: "string", description: "Nouvelle tagline / description courte" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "regenerate_logo",
      description: "Régénère le logo à l'étape 2 avec un nouveau prompt d'image détaillé.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_seo_and_tree",
      description: "Passe aux étapes 3 puis 4 (SEO + arborescence). Champs optionnels.",
      parameters: {
        type: "object",
        properties: {
          main_keyword: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          sitemap: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" }, slug: { type: "string" } },
              required: ["title", "slug"],
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "finalize_and_build",
      description: "Lance la génération finale et le build (étape 5).",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---- Phase 3 : aiguillage du type de projet ----
const projectTypeTool: OpenAiTool = {
  type: "function",
  function: {
    name: "select_project_type",
    description:
      "Choisit le type de projet à créer : 'astro_site' pour un site vitrine statique (design, SEO, pages), 'full_app' pour une application web React/Node (architecture de fichiers, GitHub).",
    parameters: {
      type: "object",
      properties: {
        project_type: { type: "string", enum: ["astro_site", "full_app"] },
      },
      required: ["project_type"],
    },
  },
};

const appTools: OpenAiTool[] = [
  {
    type: "function",
    function: {
      name: "update_app_architecture",
      description:
        "Met à jour l'architecture de l'application : nom, brief technique, stack et liste de fonctionnalités. N'inclus que les champs à changer.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          brief: { type: "string" },
          stack: {
            type: "string",
            enum: ["react_vite", "react_node_express", "nextjs", "node_api"],
          },
          features: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  projectTypeTool,
];


export const orchestrateChat = createServerFn({ method: "POST" })
  .inputValidator((input) => orchestrateSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();

    const historyBlock = data.history
      .slice(-10)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const ctx = data.site_context;
    const ctxBlock = ctx
      ? `\nCONTEXTE DU SITE ACTIF:\n- Nom: ${ctx.name ?? "(sans nom)"}\n- Marque: ${JSON.stringify(ctx.brand ?? {})}\n- Pages: ${JSON.stringify(ctx.pages)}`
      : "\nAUCUN SITE SÉLECTIONNÉ.";

    const cctx = data.creation_context;
    const creationBlock = cctx
      ? `\nTYPE DE PROJET: ${cctx.project_type ?? "non choisi"}${cctx.project_type === "full_app" ? `\nAPP: ${JSON.stringify(cctx.app ?? {})}` : ""}\nCONTEXTE CRÉATION (étape ${cctx.step ?? 1}/5):\n- Nom brief: ${cctx.name || "-"}\n- Thème: ${cctx.theme || "-"}\n- Ville: ${cctx.city || "-"}\n- Brief: ${cctx.brief || "-"}\n- Couleurs indices: ${(cctx.hint_colors ?? []).join(", ") || "-"}\n- Marque affichée: ${cctx.brand ? JSON.stringify({ brand_name: cctx.brand.brand_name, tagline: cctx.brand.tagline, colors: cctx.brand.colors, design_style: cctx.brand.design_style, logo_url: cctx.brand.logo_url ? "présent" : "absent" }) : "-"}\n- Mot-clé principal: ${cctx.main_keyword || "-"}\n- Mots-clés: ${(cctx.keywords ?? []).join(", ") || "-"}\n- Sitemap: ${(cctx.sitemap ?? []).map((p) => p.title).join(", ") || "-"}`
      : "";

    const projectType = cctx?.project_type ?? null;
    let promptKey: PromptKey;
    let tools: OpenAiTool[];
    if (data.mode === "edit") {
      promptKey = "orchestrator.edit";
      tools = editTools;
    } else if (data.mode === "create") {
      if (!projectType) {
        // Étape 0 : aiguillage
        promptKey = "orchestrator.create.project_type";
        tools = [projectTypeTool];
      } else if (projectType === "full_app") {
        promptKey = "orchestrator.app.architecture";
        tools = appTools;
      } else {
        const step = Math.min(5, Math.max(1, cctx?.step ?? 1));
        promptKey = `orchestrator.create.step${step}` as PromptKey;
        tools = createTools;
      }
    } else {
      promptKey = "orchestrator.empty";
      tools = emptyTools;
    }
    const system = await getPromptContent(promptKey);


    let reply = "OK.";
    const actions: OrchestratorAction[] = [];
    try {
      const { reply: r, rawCalls } = await callAiWithTools(
        system,
        `${ctxBlock}${creationBlock}\n\nHISTORIQUE:\n${historyBlock}\n\nUSER: ${data.message}`,
        tools,
      );
      if (r) reply = r;
      for (const call of rawCalls) {
        const args =
          call.arguments && typeof call.arguments === "object"
            ? (call.arguments as Record<string, unknown>)
            : {};
        const parsed = actionSchema.safeParse(normalizeRawAction({ ...args, type: call.name }));
        if (!parsed.success) continue;
        const act = parsed.data;
        if (act.type === "update_colors" || act.type === "update_creation_theme") {
          if (act.colors) {
            const clean: Record<string, string> = {};
            for (const [k, v] of Object.entries(act.colors)) {
              if (typeof v === "string" && HEX_RE.test(v.trim())) clean[k] = v.trim();
            }
            if (act.type === "update_colors") {
              if (Object.keys(clean).length > 0) actions.push({ type: "update_colors", colors: clean });
            } else {
              actions.push({ ...act, colors: clean });
            }
          } else {
            actions.push(act);
          }
        } else {
          actions.push(act);
        }
      }
    } catch (e) {
      reply = `Désolé, l'IA a rencontré une erreur: ${(e as Error).message}`;
    }
    return { reply, actions };
  });



// -------------------- Regenerate page content --------------------

const regenPageSchema = z.object({
  instruction: z.string().min(1).max(2000),
  current_html: z.string().min(1).max(200_000),
  page_title: z.string().min(1).max(200),
  slug: z.string().min(1).max(120),
  brand: brandIdentitySchema.partial().optional(),
});

export const regeneratePageContent = createServerFn({ method: "POST" })
  .inputValidator((input) => regenPageSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const brandBlock = data.brand
      ? `\nMarque: ${JSON.stringify({
          brand_name: data.brand.brand_name,
          colors: data.brand.colors,
          design_style: data.brand.design_style,
        })}`
      : "";
    const systemPrompt = await getPromptContent("orchestrator.regen_page");
    const parsed = await callAiJson<{ html_content?: string; seo_title?: string }>(
      systemPrompt,
      `Page: "${data.page_title}" (slug=${data.slug})${brandBlock}\n\nINSTRUCTION UTILISATEUR: ${data.instruction}\n\nHTML ACTUEL:\n${data.current_html.slice(0, 40_000)}`,
      {},
    );
    const html_content = (parsed.html_content ?? "").trim();
    if (!html_content) throw new Error("L'IA n'a pas retourné de HTML valide");
    return {
      html_content,
      seo_title: (parsed.seo_title ?? data.page_title).trim(),
    };
  });

// -------------------- Generate a new page from instruction --------------------

const newPageSchema = z.object({
  title: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  instruction: z.string().max(2000).default(""),
  brand: brandIdentitySchema.partial().optional(),
  site_context: z
    .object({
      name: z.string().optional(),
      pages: z.array(z.object({ slug: z.string(), seo_title: z.string() })).default([]),
    })
    .optional(),
});

export const generateNewPage = createServerFn({ method: "POST" })
  .inputValidator((input) => newPageSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const brandBlock = data.brand
      ? `\nMarque: ${JSON.stringify({
          brand_name: data.brand.brand_name,
          colors: data.brand.colors,
          design_style: data.brand.design_style,
        })}`
      : "";
    const nav = data.site_context?.pages ?? [];
    const navBlock = `\nNavigation existante: ${JSON.stringify(nav)}`;
    const systemPrompt = await getPromptContent("orchestrator.new_page");
    const parsed = await callAiJson<{ html_content?: string; seo_title?: string }>(
      systemPrompt,
      `Page à créer: "${data.title}" (slug=${data.slug})${brandBlock}${navBlock}\n\nINSTRUCTION: ${data.instruction || `Génère une page "${data.title}" moderne, riche et professionnelle.`}`,
      {},
    );
    const html_content = (parsed.html_content ?? "").trim();
    if (!html_content) throw new Error("L'IA n'a pas retourné de HTML valide");
    return {
      slug: data.slug,
      seo_title: (parsed.seo_title ?? data.title).trim(),
      html_content,
    };
  });

// -------------------- Cloudflare Analytics --------------------

async function cfFetch(path: string, init: RequestInit = {}) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) throw new Error("CF_ACCOUNT_ID ou CF_API_TOKEN manquant");
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function cfGraphQL<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const token = process.env.CF_API_TOKEN;
  if (!token) return null;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: T; errors?: unknown };
  return (json.data as T) ?? null;
}

type AnalyticsResult = {
  ok: boolean;
  error?: string;
  requests_24h: number;
  requests_7d: number;
  bandwidth_bytes_7d: number;
  deployments_count: number;
  deployments_success: number;
  last_deployed_at: string | null;
  top_paths: Array<{ path: string; count: number }>;
};

pageContentSchema; // silence unused import in some tree-shakers

export const getCloudflareAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: row, error } = await supabase
      .from("sites")
      .select("id, owner_email, name")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.owner_email !== email) throw new Error("Not found");

    const projectName = slugify(row.name);
    const result: AnalyticsResult = {
      ok: true,
      requests_24h: 0,
      requests_7d: 0,
      bandwidth_bytes_7d: 0,
      deployments_count: 0,
      deployments_success: 0,
      last_deployed_at: null,
      top_paths: [],
    };

    // 1. Deployments (REST — always works)
    try {
      const res = await cfFetch(`/pages/projects/${projectName}/deployments?per_page=25`);
      if (res.ok) {
        const json = (await res.json()) as {
          result?: Array<{ created_on?: string; latest_stage?: { status?: string; name?: string } }>;
        };
        const deps = json.result ?? [];
        result.deployments_count = deps.length;
        result.deployments_success = deps.filter(
          (d) => d.latest_stage?.status === "success" && d.latest_stage?.name === "deploy",
        ).length;
        result.last_deployed_at = deps[0]?.created_on ?? null;
      }
    } catch {
      /* ignore */
    }

    // 2. Analytics GraphQL (Pages Functions dataset — free tier)
    const now = new Date();
    const d24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const accountId = process.env.CF_ACCOUNT_ID;
    if (accountId) {
      const gql = await cfGraphQL<{
        viewer?: {
          accounts?: Array<{
            d24?: Array<{ sum?: { requests?: number } }>;
            d7?: Array<{ sum?: { requests?: number; responseBodySize?: number } }>;
          }>;
        };
      }>(
        `query($accountTag: String!, $projectName: String!, $since24: Time!, $since7: Time!, $now: Time!) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              d24: pagesFunctionsInvocationsAdaptiveGroups(
                limit: 1,
                filter: { scriptName: $projectName, datetime_geq: $since24, datetime_lt: $now }
              ) { sum { requests } }
              d7: pagesFunctionsInvocationsAdaptiveGroups(
                limit: 1,
                filter: { scriptName: $projectName, datetime_geq: $since7, datetime_lt: $now }
              ) { sum { requests responseBodySize } }
            }
          }
        }`,
        { accountTag: accountId, projectName, since24: d24, since7: d7, now: now.toISOString() },
      );
      const acc = gql?.viewer?.accounts?.[0];
      if (acc) {
        result.requests_24h = acc.d24?.[0]?.sum?.requests ?? 0;
        result.requests_7d = acc.d7?.[0]?.sum?.requests ?? 0;
        result.bandwidth_bytes_7d = acc.d7?.[0]?.sum?.responseBodySize ?? 0;
      } else {
        // Not fatal — free static Pages sites have no Functions invocation data
        result.ok = true;
        result.error =
          "Métriques de trafic non disponibles pour ce site (Cloudflare Web Analytics requiert un tag RUM injecté sur la page).";
      }
    }

    return result;
  });
