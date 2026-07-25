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
    type: z.literal("regenerate_logo"),
    prompt: z.string().min(1).max(500),
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

const AUTONOMY_RE =
  /\b(peu importe|peut importe|n['’]?importe|toi[-\s]?même|tout toi|comme tu veux|choisis|propose|carte blanche|fais au mieux|crée?r? tout)\b/i;

const COLOR_WORDS: Record<string, string> = {
  bleu: "#1d4ed8",
  marine: "#0f172a",
  rouge: "#dc2626",
  vert: "#16a34a",
  jaune: "#f59e0b",
  orange: "#ea580c",
  rose: "#db2777",
  violet: "#7c3aed",
  noir: "#111827",
  blanc: "#ffffff",
  sombre: "#111827",
  premium: "#0f172a",
};

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toLocaleUpperCase("fr-FR") + word.slice(1))
    .join(" ");
}

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

function inferCreationIntent(data: z.infer<typeof orchestrateSchema>) {
  const cctx = data.creation_context;
  const userTexts = [
    ...data.history.filter((m) => m.role === "user").map((m) => m.content),
    data.message,
  ];
  const meaningfulTexts = userTexts.filter((text) => !AUTONOMY_RE.test(text));
  const firstProjectText = meaningfulTexts[0] ?? data.message;
  const joined = userTexts.join(". ");

  const cityMatch = firstProjectText.match(
    /(?:\bà\b|\ba\b|\bsur\b|près de|proche de|dans)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{1,38}?)(?=\s+(?:premium|haut|luxe|minimal|moderne|urgent|pas\s+cher|corporate|élégant|elegant)|[,.!?;]|$)/i,
  );
  const city = (cctx?.city || cityMatch?.[1] || "").trim();

  const beforeCity = firstProjectText.match(/^(.*?)\s+(?:\bà\b|\ba\b|\bsur\b|près de|proche de|dans)\s+/i)?.[1];
  const themeSeed = (cctx?.theme || beforeCity || firstProjectText).replace(AUTONOMY_RE, "").trim();
  const theme = themeSeed.split(/[,.!?;]/)[0]?.trim() || cctx?.theme || "Site vitrine";

  const briefParts = meaningfulTexts.length > 0 ? meaningfulTexts : [data.message];
  const brief =
    cctx?.brief ||
    briefParts.join(". ").trim() ||
    `Créer un site professionnel ${theme}${city ? ` à ${city}` : ""}, avec une direction artistique cohérente et premium.`;

  const hasAutonomy = AUTONOMY_RE.test(joined);
  const name =
    cctx?.name ||
    (hasAutonomy || !meaningfulTexts.some((text) => /nom|soci[eé]t[eé]|entreprise|marque/i.test(text))
      ? toTitleCase(`${theme}${city ? ` ${city}` : ""}`)
      : "");

  return {
    name: name || undefined,
    theme: theme || undefined,
    city: city || undefined,
    brief: brief || undefined,
    hint_colors: cctx?.hint_colors,
  };
}

function inferCreateFallbackAction(data: z.infer<typeof orchestrateSchema>): OrchestratorAction | null {
  const msg = data.message.trim();
  const lower = msg.toLocaleLowerCase("fr-FR");
  const cctx = data.creation_context;

  if (/\b(publie|publier|lance|build|finalise|cr[eé]e le site)\b/i.test(msg) && (cctx?.step ?? 1) >= 4) {
    return { type: "finalize_and_build" };
  }

  if (/\b(seo|mots?[-\s]?cl[eé]s?|arborescence|sitemap|pages?|continue|suivant|avance)\b/i.test(msg) && (cctx?.step ?? 1) >= 2) {
    return { type: "generate_seo_and_tree" };
  }

  if (/\b(logo|image|ic[oô]ne)\b/i.test(msg) && /\b(change|modifie|refais|r[eé]g[eé]n[eè]re|devien|remplace|nouveau|nouvelle)\b/i.test(msg)) {
    return { type: "regenerate_logo", prompt: `logo ${msg}`.slice(0, 500) };
  }

  // Rename brand: "appelle-la X", "renomme la marque X", "le nom devient X", "marque: X"
  {
    const renameRe =
      /(?:(?:renomme(?:r)?|appelle(?:-la|s)?|nomme(?:r)?|rebaptise|le\s+nom\s+(?:devient|est|sera)|nom\s+de\s+(?:la\s+)?marque\s*[:=]?|marque\s*[:=])\s+["«]?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 '&.\-]{1,60}?)["»]?)(?:[.,;!?]|$)/i;
    const m = msg.match(renameRe);
    if (m && m[1]) {
      const brand_name = m[1].trim().replace(/\s+/g, " ");
      if (brand_name) return { type: "update_creation_theme", brand_name };
    }
  }


  if ((cctx?.step ?? 1) >= 2) {
    const hexes = Array.from(msg.matchAll(/#([0-9a-fA-F]{6})/g)).map((m) => `#${m[1]}`);
    const colorFromWord = Object.entries(COLOR_WORDS).find(([word]) => lower.includes(word))?.[1];
    const primary = hexes[0] ?? colorFromWord;
    if (primary || /\b(minimaliste|corporate|ludique|sombre|elegant|élégant|brutaliste)\b/i.test(msg)) {
      const design = lower.includes("corporate")
        ? "corporate"
        : lower.includes("ludique")
          ? "ludique"
          : lower.includes("sombre") || lower.includes("dark")
            ? "sombre"
            : lower.includes("brutal")
              ? "brutaliste"
              : lower.includes("elegant") || lower.includes("élégant")
                ? "elegant"
                : lower.includes("minimal")
                  ? "minimaliste"
                  : undefined;
      return {
        type: "update_creation_theme",
        ...(primary ? { colors: { primary } } : {}),
        ...(design ? { design_style: design } : {}),
      };
    }
  }

  const inferred = inferCreationIntent(data);
  const hasProjectSignal =
    Boolean(inferred.theme && inferred.theme !== "Site vitrine") ||
    Boolean(inferred.city) ||
    AUTONOMY_RE.test(msg) ||
    /\b(site|entreprise|marque|premium|vitrine|local|agence|restaurant|plombier|artisan|coach|avocat|dentiste|immobilier)\b/i.test(msg);
  if (hasProjectSignal && (cctx?.step ?? 1) === 1) {
    return { type: "advance_to_brand_studio", ...inferred };
  }

  return null;
}

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

    const systemEmpty = `Tu es un assistant IA d'un éditeur de sites web. Aucun site n'est actif. Guide l'utilisateur pour créer son premier site. Action disponible: open_create_wizard() pour ouvrir l'assistant de création. Réponds toujours en JSON strict au format {"reply": string, "actions": Action[]}.`;

    const systemCreate = `Tu es DIRECTEUR D'AGENCE dans un studio de création de sites web. Tu interviewes l'utilisateur pour concevoir son site étape par étape et tu pilotes l'interface via des actions structurées. Toutes tes réponses sont retournées en JSON.

Étapes:
1 = Brief créatif (nom, thème, ville, brief, couleurs indices)
2 = Studio de marque (logo + palette + composants)
3 = SEO & mots-clés
4 = Arborescence (sitemap)
5 = Lancement / build

Actions disponibles (mode CRÉATION):
- advance_to_brand_studio({ name?, theme?, city?, brief?, hint_colors? }) — remplit les champs manquants du brief PUIS passe à l'étape 2 et génère automatiquement la marque + le logo
- update_creation_theme({ colors?, selected_header_id?, selected_hero_id?, selected_footer_id?, selected_section_ids?, design_style?, brand_name?, tagline? }) — ajuste les choix du Theme Builder à l'étape 2 (couleurs en hex #RRGGBB)
- regenerate_logo({ prompt }) — régénère le logo à l'étape 2 avec un nouveau prompt d'image (ex: "logo minimaliste en forme de casquette bleue sur fond blanc"). Utilise cette action dès que l'utilisateur demande de changer, modifier ou refaire le logo.
- generate_seo_and_tree({ main_keyword?, keywords?, sitemap? }) — passe aux étapes 3 puis 4 ; si vides, l'app suggère automatiquement
- finalize_and_build() — clôture la création et lance le build

Règles:
- Pose UNE seule question courte à la fois pour compléter les infos manquantes.
- Dès que tu as (nom + thème + ville + brief), appelle advance_to_brand_studio.
- À l'étape 2, propose spontanément des ajustements de couleurs, de style ou de logo.
- Ne réclame pas au user des infos déjà présentes dans le CONTEXTE CRÉATION.
- Réponses courtes, en français, ton pro et chaleureux.

Renvoie STRICTEMENT un objet JSON valide au format {"reply": string, "actions": Action[]}. reply = message humain court. actions = liste (souvent vide) des actions à appliquer.`;


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
      const res = actionSchema.safeParse(normalizeRawAction(a));
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
        } else if (res.data.type === "advance_to_brand_studio" && data.mode === "create") {
          const inferred = inferCreationIntent(data);
          actions.push({ ...inferred, ...res.data, hint_colors: res.data.hint_colors ?? inferred.hint_colors });
        } else {
          actions.push(res.data);
        }
      }
    }
    if (actions.length === 0 && data.mode === "create") {
      const fallbackAction = inferCreateFallbackAction(data);
      if (fallbackAction) actions.push(fallbackAction);
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
