import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import { brandIdentitySchema, pageContentSchema, sitemapPageSchema } from "./sites-schema";

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
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return fallback;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        reasoning_effort: "none",
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
    type: z.literal("finalize_and_build"),
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
      ? `\nCONTEXTE CRÉATION (étape ${cctx.step ?? 1}/5):\n- Nom: ${cctx.name || "-"}\n- Thème: ${cctx.theme || "-"}\n- Ville: ${cctx.city || "-"}\n- Brief: ${cctx.brief || "-"}\n- Couleurs indices: ${(cctx.hint_colors ?? []).join(", ") || "-"}\n- Marque: ${cctx.brand ? JSON.stringify({ brand_name: cctx.brand.brand_name, colors: cctx.brand.colors, design_style: cctx.brand.design_style }) : "-"}\n- Mot-clé principal: ${cctx.main_keyword || "-"}\n- Mots-clés: ${(cctx.keywords ?? []).join(", ") || "-"}\n- Sitemap: ${(cctx.sitemap ?? []).map((p) => p.title).join(", ") || "-"}`
      : "";

    const systemEdit = `Tu es un assistant IA intégré à un éditeur de sites web. L'utilisateur discute avec toi pour MODIFIER son site actif. Tu peux répondre en langage naturel ET/OU appeler des actions structurées.

Actions disponibles (mode ÉDITION):
- update_colors({ colors: { primary?, secondary?, accent?, neutral?, background? } }) — met à jour la palette (hex #RRGGBB)
- update_page_content({ slug, seo_title?, instruction }) — régénère le contenu HTML d'une page ; slug obligatoire
- add_page({ title, slug?, instruction? }) — ajoute une nouvelle page ; slug déduit du titre si absent
- remove_page({ slug }) — supprime la page (jamais 'index')

Renvoie STRICTEMENT le JSON {"reply": string, "actions": Action[]}. reply = ta réponse humaine courte en français. actions = liste (souvent vide) d'actions à appliquer. Toujours confirmer ce que tu vas faire dans reply.`;

    const systemEmpty = `Tu es un assistant IA d'un éditeur de sites web. Aucun site n'est actif. Guide l'utilisateur pour créer son premier site. Action disponible: open_create_wizard() pour ouvrir l'assistant de création. Renvoie STRICTEMENT {"reply": string, "actions": Action[]}.`;

    const systemCreate = `Tu es DIRECTEUR D'AGENCE dans un studio de création de sites web. Tu interviewes l'utilisateur pour concevoir son site étape par étape et tu pilotes l'interface via des actions structurées.

Étapes:
1 = Brief créatif (nom, thème, ville, brief, couleurs indices)
2 = Studio de marque (logo + palette + composants)
3 = SEO & mots-clés
4 = Arborescence (sitemap)
5 = Lancement / build

Actions disponibles (mode CRÉATION):
- advance_to_brand_studio({ name?, theme?, city?, brief?, hint_colors? }) — remplit les champs manquants du brief PUIS passe à l'étape 2 et génère automatiquement la marque + le logo
- update_creation_theme({ colors?, selected_header_id?, selected_hero_id?, selected_footer_id?, selected_section_ids?, design_style?, brand_name?, tagline? }) — ajuste les choix du Theme Builder à l'étape 2
- generate_seo_and_tree({ main_keyword?, keywords?, sitemap? }) — passe aux étapes 3 puis 4 ; si vides, l'app suggère automatiquement
- finalize_and_build() — clôture la création et lance le build

Règles:
- Pose UNE seule question courte à la fois pour compléter les infos manquantes.
- Dès que tu as (nom + thème + ville + brief), appelle advance_to_brand_studio.
- À l'étape 2, propose spontanément des ajustements de couleurs ou de style.
- Ne réclame pas au user des infos déjà présentes dans le CONTEXTE CRÉATION.
- Réponses courtes, en français, ton pro et chaleureux.

Renvoie STRICTEMENT {"reply": string, "actions": Action[]}.`;

    const system =
      data.mode === "edit" ? systemEdit : data.mode === "create" ? systemCreate : systemEmpty;

    const parsed = await callAiJson<{ reply?: string; actions?: unknown[] }>(
      system,
      `${ctxBlock}${creationBlock}\n\nHISTORIQUE:\n${historyBlock}\n\nUSER: ${data.message}`,
      {},
    );

    const reply = (parsed.reply ?? "").trim() || "OK.";
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];
    const actions: OrchestratorAction[] = [];
    for (const a of rawActions) {
      const res = actionSchema.safeParse(a);
      if (res.success) {
        if (res.data.type === "update_colors" || res.data.type === "update_creation_theme") {
          if (res.data.colors) {
            const clean: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.data.colors)) {
              if (typeof v === "string" && HEX_RE.test(v.trim())) clean[k] = v.trim();
            }
            if (res.data.type === "update_colors") {
              if (Object.keys(clean).length > 0) {
                actions.push({ type: "update_colors", colors: clean });
              }
            } else {
              actions.push({ ...res.data, colors: clean });
            }
          } else {
            actions.push(res.data);
          }
        } else {
          actions.push(res.data);
        }
      }
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
    const parsed = await callAiJson<{ html_content?: string; seo_title?: string }>(
      "Tu es un développeur frontend et rédacteur SEO expert. Tu modifies UNE page d'un site vitrine (HTML + Tailwind CSS). Réponds STRICTEMENT en JSON {\"seo_title\": string, \"html_content\": string}. Le html_content ne contient AUCUN <html>/<head>/<body> — uniquement le contenu du body. RÈGLE COULEURS IMPÉRATIVE : n'utilise JAMAIS de classes Tailwind de couleur figées (bg-blue-600, text-emerald-500, bg-slate-900, etc.) ni de couleurs hex arbitraires. Utilise EXCLUSIVEMENT la palette de marque via les classes custom `bg-brand`, `text-brand`, `border-brand`, `ring-brand`, `bg-brand-primary`, `bg-brand-secondary`, `bg-brand-accent`, `bg-brand-neutral`, `bg-brand-background` (et leurs équivalents text-/border-/ring-/from-/to-/via-). Le noir/blanc et les nuances neutres purement structurelles (text-white, bg-white, text-black) restent autorisés. Conserve la structure sémantique et les liens existants sauf si l'instruction dit le contraire.",
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
    const parsed = await callAiJson<{ html_content?: string; seo_title?: string }>(
      "Tu es un développeur frontend et rédacteur SEO expert. Génère UNE nouvelle page (HTML + Tailwind CSS). Réponds STRICTEMENT en JSON {\"seo_title\": string, \"html_content\": string}. Pas de <html>/<head>/<body>. RÈGLE COULEURS IMPÉRATIVE : n'utilise JAMAIS de classes Tailwind de couleur figées (bg-blue-600, text-emerald-500, bg-slate-900, etc.) ni de couleurs hex arbitraires. Utilise EXCLUSIVEMENT la palette de marque via les classes custom `bg-brand`, `text-brand`, `border-brand`, `ring-brand`, `bg-brand-primary`, `bg-brand-secondary`, `bg-brand-accent`, `bg-brand-neutral`, `bg-brand-background` (et leurs équivalents text-/border-/ring-/from-/to-/via-). Le noir/blanc et les nuances neutres purement structurelles (text-white, bg-white, text-black) restent autorisés. Inclus un header cohérent (avec les liens de la navigation existante) et un footer. Contenu riche et adapté au titre demandé.",
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
