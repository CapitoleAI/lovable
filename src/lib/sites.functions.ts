import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  brandColorsSchema,
  brandIdentitySchema,
  createSiteSchema,
  generatePageSchema,
  pageContentSchema,
  PALETTES,
  suggestKeywordsSchema,
  suggestSitemapSchema,
  type BrandIdentity,
  type PageContent,
  type PaletteId,
  type SitemapPage,
} from "./sites-schema";
import { assembleHomeHtml, renderComponent } from "./theme-components";





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

function normalizePageSlug(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw || raw === "/" || raw.toLowerCase() === "/index" || raw.toLowerCase() === "index") {
    return "index";
  }
  const cleaned = slugify(raw.replace(/^\/+/, "").replace(/\/+$/, ""));
  return cleaned || "index";
}

function flattenSitemap(sitemap: SitemapPage[]): SitemapPage[] {
  const out: SitemapPage[] = [];
  for (const p of sitemap) {
    out.push({ title: p.title, slug: p.slug });
    if (p.children) for (const c of p.children) out.push({ title: c.title, slug: c.slug });
  }
  return out;
}

function buildRandomSeed(randomize: boolean) {
  if (!randomize) return {};
  const sections = ["hero", "services", "about", "trust", "cta", "contact"];
  // Fisher–Yates
  for (let i = sections.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sections[i], sections[j]] = [sections[j], sections[i]];
  }
  return {
    sectionOrder: sections,
    cssPrefix: `x${randomBytes(3).toString("hex")}_`,
    paletteVariant: Math.floor(Math.random() * 4),
  };
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type SiteData = {
  pages: PageContent[];
  site_info?: {
    brand_name?: string;
    tagline?: string;
    story?: string;
    colors?: BrandIdentity["colors"];
    logo_url?: string;
    moodboard_url?: string;
  };
};



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


function fallbackHtml(pageTitle: string, business: string, theme: string, city: string) {
  return `<section class="py-20 bg-gradient-to-br from-slate-50 to-white"><div class="max-w-4xl mx-auto px-6 text-center"><h1 class="text-5xl font-bold tracking-tight mb-6">${pageTitle}</h1><p class="text-lg text-slate-600 mb-8">${business} — ${theme} à ${city}. Service professionnel, rapide et de confiance.</p><a href="/contact" class="inline-block bg-slate-900 text-white px-8 py-3 rounded-lg font-semibold">Nous contacter</a></div></section>`;
}

async function generatePageContentServer(input: {
  theme: string;
  city: string;
  business_name: string;
  main_keyword: string;
  secondary_keywords?: string[];
  sitemap: SitemapPage[];
  page: { title: string; slug: string };
  brand?: BrandIdentity;
}): Promise<PageContent> {
  const normalizedSlug = normalizePageSlug(input.page.slug);
  const navSitemap = flattenSitemap(input.sitemap).map((p) => ({
    title: p.title,
    slug: normalizePageSlug(p.slug),
  }));
  const fallback: PageContent = {
    slug: normalizedSlug,
    seo_title: `${input.page.title} — ${input.business_name}`,
    html_content: fallbackHtml(input.page.title, input.business_name, input.theme, input.city),
  };
  const brandBlock = input.brand
    ? `\nIdentité de marque à respecter STRICTEMENT. Les couleurs sont exposées à Tailwind comme palette \`brand\` — utilise EXCLUSIVEMENT les classes custom \`bg-brand\`, \`text-brand\`, \`border-brand\`, \`ring-brand\`, \`bg-brand-primary\`, \`bg-brand-secondary\`, \`bg-brand-accent\`, \`bg-brand-neutral\`, \`bg-brand-background\` (et équivalents text-/border-/ring-/from-/to-/via-). N'écris JAMAIS de couleur figée type bg-blue-600 / text-emerald-500 ni de hex arbitraire.\n- Nom: ${input.brand.brand_name}\n- Tagline: ${input.brand.tagline}\n- Palette (mappée sur bg-brand-*): primary=${input.brand.colors.primary}, secondary=${input.brand.colors.secondary}, accent=${input.brand.colors.accent}, neutral=${input.brand.colors.neutral}, background=${input.brand.colors.background}\n- Histoire/valeurs: ${input.brand.story}\n- Style global: ${input.brand.design_style}`
    : "";
  // Ossature Theme Builder — sert de design-system pour toutes les pages
  const homeOssature = input.brand?.home_html?.trim();
  const ossatureBlock = homeOssature
    ? `\n\nDESIGN SYSTEM DE RÉFÉRENCE (ossature exacte de la home, sélectionnée visuellement par l'utilisateur — INSPIRE-TOI STRICTEMENT de ce style, cette typographie, ces composants, ces couleurs et cette structure pour rester COHÉRENT sur cette page):\n\`\`\`html\n${homeOssature.slice(0, 30_000)}\n\`\`\`\nRègles: reprends le même header et le même footer à l'identique en haut/bas de cette nouvelle page. Réutilise le vocabulaire visuel (arrondis, ombres, espacements, style de boutons, palette) des sections ci-dessus.`
    : "";
  const parsed = await callAiJson<{ seo_title?: string; html_content?: string }>(
    "Tu es un développeur frontend et rédacteur SEO expert. Tu génères UNE page complète d'un site vitrine en français, en HTML + Tailwind CSS. RÈGLES STRICTES: (1) N'inclus JAMAIS <html>, <head>, <body>, <title> — uniquement le contenu intérieur du <body>. (2) Design moderne, aéré, responsive : utilise exclusivement des classes Tailwind CSS. RÈGLE COULEURS IMPÉRATIVE : n'utilise JAMAIS de classes Tailwind de couleur figées (bg-blue-600, text-emerald-500, bg-slate-900…) ni de hex arbitraires. Utilise EXCLUSIVEMENT la palette de marque via `bg-brand`, `text-brand`, `border-brand`, `ring-brand`, `bg-brand-primary`, `bg-brand-secondary`, `bg-brand-accent`, `bg-brand-neutral`, `bg-brand-background` (et leurs variantes text-/border-/ring-/from-/to-/via-). text-white / bg-white / text-black restent autorisés pour du contraste structurel. Si un DESIGN SYSTEM DE RÉFÉRENCE est fourni, respecte-le STRICTEMENT et reprends le header/footer exacts. (3) Contenu riche : plusieurs sections avec titres (h1/h2/h3), paragraphes détaillés, listes, cartes, CTA, adaptés à la page demandée. (4) Inclus un header avec navigation basée sur l'arborescence fournie (liens vers /slug, ou / pour l'accueil = slug 'index'), un hero adapté, plusieurs sections, et un footer. (5) Contenu orienté SEO local. (6) Réponds UNIQUEMENT en JSON strict {\"seo_title\": string, \"html_content\": string}.",
    `Entreprise: ${input.business_name}\nThématique: ${input.theme}\nVille: ${input.city}\nMot-clé principal: ${input.main_keyword}\nMots-clés secondaires: ${(input.secondary_keywords ?? []).join(", ")}\nArborescence: ${JSON.stringify(navSitemap)}${brandBlock}${ossatureBlock}\n\nPAGE À GÉNÉRER: titre="${input.page.title}", slug="${normalizedSlug}"\n\nRéponds au format JSON.`,
    {},
  );
  const seo_title = parsed.seo_title?.trim();
  const html_content = parsed.html_content?.trim();
  if (!seo_title || !html_content) return fallback;
  return { slug: normalizedSlug, seo_title, html_content };
}


export const generatePageContent = createServerFn({ method: "POST" })
  .inputValidator((input) => generatePageSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const page = await generatePageContentServer({
      theme: data.theme,
      city: data.city,
      business_name: data.business_name,
      main_keyword: data.main_keyword,
      secondary_keywords: data.secondary_keywords,
      sitemap: data.sitemap,
      page: data.page,
      brand: data.brand,
    });
    return { page };
  });


async function generateAllPages(input: {
  theme: string;
  city: string;
  business_name: string;
  main_keyword: string;
  secondary_keywords?: string[];
  sitemap: SitemapPage[];
  brand?: BrandIdentity;
}): Promise<SiteData> {
  const flat = flattenSitemap(input.sitemap);
  const pages: PageContent[] = [];
  const seen = new Set<string>();
  for (const p of flat) {
    const slug = normalizePageSlug(p.slug);
    if (seen.has(slug)) continue;
    seen.add(slug);
    const content = await generatePageContentServer({ ...input, page: p });
    pages.push({ ...content, slug });
  }
  if (!pages.some((p) => p.slug === "index") && pages[0]) {
    pages[0] = { ...pages[0], slug: "index" };
  }
  return { pages };
}


export const suggestKeywords = createServerFn({ method: "POST" })
  .inputValidator((input) => suggestKeywordsSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const parsed = await callAiJson<{ keywords?: string[] }>(
      "Tu es un expert SEO francophone. Génère 12 mots-clés de longue traîne pertinents (3-6 mots), localisés, orientés intention d'achat/service. Réponds UNIQUEMENT en JSON {\"keywords\": string[]}. Pas de doublons.",
      `Thématique: ${data.theme}\nVille: ${data.city}\nEntreprise: ${data.business_name}`,
      { keywords: [] },
    );
    const kws = Array.from(
      new Set((parsed.keywords ?? []).map((k) => k.trim()).filter(Boolean)),
    ).slice(0, 15);
    return { keywords: kws };
  });

export const suggestSitemap = createServerFn({ method: "POST" })
  .inputValidator((input) => suggestSitemapSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const fallback: { sitemap: SitemapPage[] } = {
      sitemap: [
        { title: "Accueil", slug: "/" },
        { title: "Services", slug: "/services", children: [] },
        { title: "À propos", slug: "/a-propos" },
        { title: "Contact", slug: "/contact" },
      ],
    };
    const parsed = await callAiJson<{ sitemap?: SitemapPage[] }>(
      "Tu es un architecte SEO. Propose une arborescence de site cohérente pour référencement local. Racine + 4-7 rubriques, avec 2-4 sous-pages pertinentes par rubrique quand utile (services détaillés, articles blog). Slugs en kebab-case, français, sans accents. Réponds UNIQUEMENT en JSON {\"sitemap\": [{\"title\": string, \"slug\": string, \"children\"?: [{\"title\": string, \"slug\": string}]}]}.",
      `Thématique: ${data.theme}\nVille: ${data.city}\nEntreprise: ${data.business_name}\nMots-clés: ${data.keywords.join(", ")}`,
      fallback,
    );
    const sm = (parsed.sitemap ?? []).slice(0, 15).map((p) => ({
      title: (p.title ?? "").trim() || "Page",
      slug: (p.slug ?? "").trim() || "/page",
      children: Array.isArray(p.children)
        ? p.children.slice(0, 10).map((c) => ({
            title: (c.title ?? "").trim() || "Sous-page",
            slug: (c.slug ?? "").trim() || "/sous-page",
          }))
        : undefined,
    }));
    return { sitemap: sm.length ? sm : fallback.sitemap };
  });

// ---------------- Brand Studio ----------------

const HEX_RE = /^#([0-9a-fA-F]{6})$/;
function ensureHex(v: unknown, fallback: string): string {
  return typeof v === "string" && HEX_RE.test(v.trim()) ? v.trim() : fallback;
}

const DEFAULT_COLORS: BrandIdentity["colors"] = {
  primary: "#0f172a",
  secondary: "#334155",
  accent: "#38bdf8",
  neutral: "#e2e8f0",
  background: "#ffffff",
};

const DESIGN_STYLES = ["minimaliste", "corporate", "ludique", "sombre", "elegant", "brutaliste"] as const;
const HEADER_STYLES = ["classique", "centre"] as const;
const FOOTER_STYLES = ["simple", "complet"] as const;
const CONTENT_SECTIONS = [
  "hero_image",
  "services_grid",
  "testimonials",
  "contact_form",
  "features",
  "pricing",
  "faq",
  "cta_banner",
  "gallery",
  "stats",
] as const;

function ensureIn<T extends readonly string[]>(list: T, v: unknown, fallback: T[number]): T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}
function ensureSections(v: unknown, fallback: BrandIdentity["sections"]): BrandIdentity["sections"] {
  if (!Array.isArray(v)) return fallback;
  const seen = new Set<string>();
  const out: BrandIdentity["sections"] = [];
  for (const item of v) {
    if (typeof item === "string" && (CONTENT_SECTIONS as readonly string[]).includes(item) && !seen.has(item)) {
      seen.add(item);
      out.push(item as BrandIdentity["sections"][number]);
    }
  }
  return out;
}

function pollinationsImageUrl(prompt: string, size = 512): string {
  const words = prompt.trim().split(/\s+/).slice(0, 30).join(" ");
  const encoded = encodeURIComponent(words.slice(0, 400));
  return `https://image.pollinations.ai/prompt/${encoded}?width=${size}&height=${size}&nologo=true`;
}

const generateBrandSchema = z.object({
  brief: z.string().trim().min(1).max(4000),
  hint_colors: z.array(z.string().trim()).max(6).default([]),
  business_name: z.string().trim().max(200).optional().default(""),
  theme: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
});

export const generateBrandIdentity = createServerFn({ method: "POST" })
  .inputValidator((input) => generateBrandSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const parsed = await callAiJson<{
      brand_name?: string;
      tagline?: string;
      story?: string;
      colors?: Partial<BrandIdentity["colors"]>;
      logo_prompt?: string;
      design_style?: string;
      header_style?: string;
      footer_style?: string;
      sections?: string[];
    }>(
      "Tu es un directeur artistique webdesign. À partir d'un brief, propose une identité de marque cohérente et distinctive ET une direction de webdesign. Choisis: (1) 5 couleurs en hex (#RRGGBB) — primary, secondary, accent, neutral, background — qui fonctionnent ensemble. (2) design_style parmi ['minimaliste','corporate','ludique','sombre','elegant','brutaliste']. (3) header_style parmi ['classique','centre']. (4) footer_style parmi ['simple','complet']. (5) sections: 3 à 6 blocs parmi ['hero_image','services_grid','testimonials','contact_form','features','pricing','faq','cta_banner','gallery','stats']. (6) Un prompt LOGO EN ANGLAIS, TRÈS CONCIS (MAX 30 MOTS, mots-clés visuels séparés par des virgules, logo vectoriel minimaliste sur fond blanc). Respecte les suggestions de teintes si fournies. Réponds UNIQUEMENT en JSON strict {\"brand_name\": string, \"tagline\": string, \"story\": string, \"colors\": {...5 clés hex}, \"logo_prompt\": string, \"design_style\": string, \"header_style\": string, \"footer_style\": string, \"sections\": string[]}.",
      `Brief: ${data.brief}\nEntreprise: ${data.business_name}\nThématique: ${data.theme}\nVille: ${data.city}\nSuggestions couleurs: ${data.hint_colors.join(", ") || "aucune"}`,
      {},
    );
    const colors: BrandIdentity["colors"] = {
      primary: ensureHex(parsed.colors?.primary, DEFAULT_COLORS.primary),
      secondary: ensureHex(parsed.colors?.secondary, DEFAULT_COLORS.secondary),
      accent: ensureHex(parsed.colors?.accent, DEFAULT_COLORS.accent),
      neutral: ensureHex(parsed.colors?.neutral, DEFAULT_COLORS.neutral),
      background: ensureHex(parsed.colors?.background, DEFAULT_COLORS.background),
    };
    const brand_name = (parsed.brand_name ?? "").trim() || data.business_name || "Ma Marque";
    const tagline = (parsed.tagline ?? "").trim();
    const story = (parsed.story ?? data.brief).trim();
    const logo_prompt =
      (parsed.logo_prompt ?? "").trim() ||
      `minimal vector logo for "${brand_name}", flat design, on solid white background, iconic, modern`;
    const design_style = ensureIn(DESIGN_STYLES, parsed.design_style, "minimaliste");
    const header_style = ensureIn(HEADER_STYLES, parsed.header_style, "classique");
    const footer_style = ensureIn(FOOTER_STYLES, parsed.footer_style, "simple");
    const sections = ensureSections(parsed.sections, ["hero_image", "services_grid", "contact_form"]);
    return {
      brand: {
        brand_name,
        tagline,
        story,
        colors,
        logo_url: "",
        moodboard_url: "",
        design_style,
        header_style,
        footer_style,
        sections,
        selected_header_id: "",
        selected_hero_id: "",
        selected_section_ids: [],
        selected_footer_id: "",
        component_overrides: {},
        home_html: "",
      } satisfies BrandIdentity,
      logo_prompt,
    };
  });


const generateImageSchema = z.object({
  prompt: z.string().trim().min(1).max(1200),
});

export const generateBrandImage = createServerFn({ method: "POST" })
  .inputValidator((input) => generateImageSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const data_url = pollinationsImageUrl(data.prompt);
    return { data_url };
  });

const refineBrandSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  brand: brandIdentitySchema,
});

export const refineBrandIdentity = createServerFn({ method: "POST" })
  .inputValidator((input) => refineBrandSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const parsed = await callAiJson<{
      brand_name?: string;
      tagline?: string;
      story?: string;
      colors?: Partial<BrandIdentity["colors"]>;
      design_style?: string;
      header_style?: string;
      footer_style?: string;
      sections?: string[];
      regenerate_logo?: boolean;
      logo_prompt?: string;
      note?: string;
    }>(
      "Tu es un directeur artistique webdesign qui ajuste une identité de marque et sa direction de design d'après une demande utilisateur. Comprends l'intention (ex: 'passe en dark mode et ajoute des témoignages' => design_style='sombre', couleurs sombres, ajoute 'testimonials' à sections). Renvoie l'identité MISE À JOUR complète (conserve les valeurs actuelles si non concernées). Champs à renvoyer: brand_name, tagline, story, colors (5 hex), design_style parmi ['minimaliste','corporate','ludique','sombre','elegant','brutaliste'], header_style parmi ['classique','centre'], footer_style parmi ['simple','complet'], sections (sous-ensemble de ['hero_image','services_grid','testimonials','contact_form','features','pricing','faq','cta_banner','gallery','stats']). Indique regenerate_logo (bool) et un nouveau logo_prompt EN ANGLAIS TRÈS CONCIS (MAX 30 MOTS, mots-clés séparés par des virgules) si le logo doit changer. Réponds UNIQUEMENT en JSON strict.",
      `Identité actuelle: ${JSON.stringify({ ...data.brand, logo_url: undefined, moodboard_url: undefined })}\n\nDemande utilisateur: ${data.message}`,
      {},
    );
    const colors: BrandIdentity["colors"] = {
      primary: ensureHex(parsed.colors?.primary, data.brand.colors.primary),
      secondary: ensureHex(parsed.colors?.secondary, data.brand.colors.secondary),
      accent: ensureHex(parsed.colors?.accent, data.brand.colors.accent),
      neutral: ensureHex(parsed.colors?.neutral, data.brand.colors.neutral),
      background: ensureHex(parsed.colors?.background, data.brand.colors.background),
    };
    const updated: BrandIdentity = {
      brand_name: (parsed.brand_name ?? "").trim() || data.brand.brand_name,
      tagline: (parsed.tagline ?? data.brand.tagline).trim(),
      story: (parsed.story ?? data.brand.story).trim(),
      colors,
      logo_url: data.brand.logo_url,
      moodboard_url: data.brand.moodboard_url,
      design_style: ensureIn(DESIGN_STYLES, parsed.design_style, data.brand.design_style),
      header_style: ensureIn(HEADER_STYLES, parsed.header_style, data.brand.header_style),
      footer_style: ensureIn(FOOTER_STYLES, parsed.footer_style, data.brand.footer_style),
      sections: ensureSections(parsed.sections, data.brand.sections),
      selected_header_id: data.brand.selected_header_id,
      selected_hero_id: data.brand.selected_hero_id,
      selected_section_ids: data.brand.selected_section_ids,
      selected_footer_id: data.brand.selected_footer_id,
      component_overrides: data.brand.component_overrides,
      home_html: data.brand.home_html,
    };
    return {
      brand: updated,
      regenerate_logo: Boolean(parsed.regenerate_logo),
      logo_prompt: (parsed.logo_prompt ?? "").trim(),
      note: (parsed.note ?? "").trim(),
    };
  });

// ---------- Theme Builder — modification d'un composant via chat IA ----------

const refineComponentSchema = z.object({
  component_id: z.string().trim().min(1).max(80),
  current_html: z.string().min(1).max(200_000),
  message: z.string().trim().min(1).max(2000),
});

export const refineComponent = createServerFn({ method: "POST" })
  .inputValidator((input) => refineComponentSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const parsed = await callAiJson<{ html?: string; note?: string }>(
      "Tu es un développeur frontend expert Tailwind CSS. On te fournit le HTML d'UN composant de site vitrine et une demande de modification. Renvoie UNIQUEMENT le HTML complet et modifié de ce composant. RÈGLE COULEURS IMPÉRATIVE : n'utilise JAMAIS de couleur figée (bg-blue-600, text-slate-900, hex arbitraire). Utilise EXCLUSIVEMENT les variables CSS de marque via classes arbitraires Tailwind : `bg-[var(--brand-primary)]`, `text-[var(--brand-primary)]`, `bg-[var(--brand-secondary)]`, `text-[var(--brand-secondary)]`, `bg-[var(--brand-accent)]`, `text-[var(--brand-accent)]`, `border-[var(--brand-neutral)]`, `bg-[var(--brand-background)]`, etc. text-white / bg-white restent autorisés pour du contraste. Garde la structure sémantique et la responsivité. Réponds STRICTEMENT en JSON {\"html\": string, \"note\": string (1 phrase)}.",
      `Demande: ${data.message}\n\nHTML actuel du composant (id=${data.component_id}):\n${data.current_html}`,
      {},
    );
    const html = (parsed.html ?? "").trim();
    if (!html) throw new Error("L'IA n'a pas retourné de HTML valide");
    return { html, note: (parsed.note ?? "").trim() || "Composant mis à jour." };
  });

// ---------- Theme Builder — génération à la volée de variantes par projet ----------

const generateThemeVariantsSchema = z.object({
  category: z.enum(["header", "hero", "section", "footer"]),
  count: z.number().int().min(1).max(10).default(3),
  brand: z.object({
    brand_name: z.string().trim().max(200).default(""),
    tagline: z.string().trim().max(300).default(""),
    logo_url: z.string().trim().max(2_000_000).default(""),
    design_style: z.string().trim().max(60).default("minimaliste"),
    colors: brandColorsSchema,
  }),
  theme: z.string().trim().max(200).default(""),
  city: z.string().trim().max(120).default(""),
  brief: z.string().trim().max(4000).default(""),
});

export const generateThemeVariants = createServerFn({ method: "POST" })
  .inputValidator((input) => generateThemeVariantsSchema.parse(input))
  .handler(async ({ data }) => {
    await requireUser();
    const { category, count, brand, theme, city, brief } =
      data as z.output<typeof generateThemeVariantsSchema>;

    const categoryBrief: Record<typeof category, string> = {
      header: "un HEADER de site : LE LOGO EST OBLIGATOIRE et visible (à gauche ou centré selon la variante), navigation (Accueil, Services, À propos, Contact), un CTA optionnel. Responsive.",
      hero: "une section HERO en pleine largeur : gros titre H1 percutant reprenant l'activité et la ville, sous-titre explicatif, 1 à 2 CTA, éventuellement un visuel décoratif (formes, dégradé, illustration SVG inline). Impact visuel fort.",
      section: "une SECTION intermédiaire pertinente pour cette activité (au choix parmi services, valeurs, témoignages, chiffres, tarifs, FAQ, galerie, CTA, contact, processus, équipe, avantages, garanties, étapes, partenaires, réalisations, zones d'intervention, blog, newsletter…). Contenu riche et adapté au métier. Chaque variante DOIT proposer un type de bloc différent.",
      footer: "un FOOTER : LE LOGO EST OBLIGATOIRE et visible en tête du footer, puis identité, liens de navigation, coordonnées, mentions, éventuellement newsletter.",
    };

    const needsLogo = category === "header" || category === "footer";
    const logoInstruction = brand.logo_url
      ? `Le logo est disponible et ${needsLogo ? "DOIT ABSOLUMENT être présent" : "peut être intégré"} via <img src="${brand.logo_url}" alt="${brand.brand_name}" class="h-10 w-auto" /> (ajuste la hauteur selon le contexte).`
      : `Pas de logo image disponible : ${needsLogo ? "affiche IMPÉRATIVEMENT" : "utilise"} un badge textuel avec l'initiale de la marque sur fond bg-[var(--brand-primary)] text-white rounded, suivi du nom "${brand.brand_name}".`;

    const system = `Tu es un directeur artistique web + développeur frontend expert Tailwind CSS. Tu génères ${count} variantes VISUELLEMENT DIFFÉRENTES de ${categoryBrief[category]} pour un projet spécifique.

RÈGLES IMPÉRATIVES :
1. HTML pur avec classes Tailwind uniquement — pas de <html>, <head>, <body>, <script>, <style>.
2. COULEURS : n'utilise JAMAIS de couleur figée (bg-blue-*, text-slate-*, hex arbitraire, rgb()). Utilise EXCLUSIVEMENT les variables CSS de marque via classes arbitraires Tailwind :
   - fond : bg-[var(--brand-primary)] / bg-[var(--brand-secondary)] / bg-[var(--brand-accent)] / bg-[var(--brand-neutral)] / bg-[var(--brand-background)]
   - texte : text-[var(--brand-primary)] / text-[var(--brand-secondary)] / text-[var(--brand-accent)]
   - bordure : border-[var(--brand-neutral)] / border-[var(--brand-primary)]
   - ring/from-/to-/via- suivent la même syntaxe.
   text-white, bg-white, text-black restent autorisés pour du contraste structurel.
3. Style global demandé : "${brand.design_style}" — chaque variante DOIT exprimer visuellement ce style (proportions, typographie, densité, arrondis, ombres).
4. Les ${count} variantes doivent proposer des mises en page DISTINCTES (structure, alignement, densité, décor) — pas juste des changements de nuances.
5. Contenu textuel en français, spécifique à l'activité "${theme}"${city ? ` à ${city}` : ""} — pas de lorem ipsum ni de « ici votre texte ».
6. Responsive (mobile-first) et accessibilité de base (balises sémantiques, alt).
7. ${logoInstruction}

Réponds STRICTEMENT en JSON : {"variants": [{"id": "kebab-case-unique", "label": "Nom court FR", "html": "..."}]} — exactement ${count} entrées.`;

    const user = `Projet :
- Marque : ${brand.brand_name || "(à venir)"}
- Tagline : ${brand.tagline || "(aucune)"}
- Activité / thème : ${theme || "(non précisé)"}
- Ville : ${city || "(non précisé)"}
- Brief : ${brief || "(aucun)"}
- Palette (référence pour les variables) : primary=${brand.colors.primary}, secondary=${brand.colors.secondary}, accent=${brand.colors.accent}, neutral=${brand.colors.neutral}, background=${brand.colors.background}
- Style : ${brand.design_style}

Génère ${count} variantes de la catégorie "${category}".`;

    const parsed = await callAiJson<{
      variants?: Array<{ id?: string; label?: string; html?: string }>;
    }>(system, user, {});

    const raw = Array.isArray(parsed.variants) ? parsed.variants : [];
    const variants = raw
      .map((v, i) => {
        const html = (v.html ?? "").trim();
        if (!html) return null;
        const id = (v.id?.trim() || `${category}_ai_${Date.now()}_${i}`)
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .slice(0, 80);
        const label = (v.label?.trim() || `${category} ${i + 1}`).slice(0, 120);
        return { id, label, html };
      })
      .filter((v): v is { id: string; label: string; html: string } => v !== null);

    if (variants.length === 0) {
      throw new Error("L'IA n'a pas retourné de variantes exploitables");
    }
    return { variants };
  });









async function triggerRunner(siteId: string, siteName: string) {
  const url = process.env.ASTRO_RUNNER_WEBHOOK_URL;
  const secret = process.env.ASTRO_RUNNER_SECRET;
  const callbackBase = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!url || !secret) {
    return { triggered: false, error: "Runner non configuré (ASTRO_RUNNER_WEBHOOK_URL manquant)" };
  }
  if (!callbackBase) {
    return { triggered: false, error: "PUBLIC_APP_URL n'est pas configuré : l'URL de callback ne peut pas être absolue" };
  }
  const callbackUrl = `${callbackBase}/api/public/astro-deploy-callback`;
  const dataUrl = `${callbackBase}/api/public/site-data?site_id=${encodeURIComponent(siteId)}`;
  const payload = JSON.stringify({
    event_type: "build_site",
    client_payload: {
      site_id: siteId,
      site_name: slugify(siteName),
      callback_url: callbackUrl,
      data_url: dataUrl,
      ts: Date.now(),
    },
  });
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  const githubToken = process.env.GITHUB_TOKEN;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Lovable-Astro-Runner",
      "x-astro-signature": signature,
    };
    if (githubToken) headers["Authorization"] = `Bearer ${githubToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payload,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { triggered: false, error: `Runner ${res.status}: ${body.slice(0, 200)}` };
    }
    return { triggered: true, error: null };
  } catch (e) {
    return { triggered: false, error: `Runner injoignable: ${(e as Error).message}` };
  }
}

export const listSites = createServerFn({ method: "GET" }).handler(async () => {
  const email = await requireUser();
  const supabase = await loadAdmin();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("owner_email", email)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { sites: data ?? [] };
});

export const createSite = createServerFn({ method: "POST" })
  .inputValidator((input) => createSiteSchema.parse(input))
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const palette = [...PALETTES[data.palette as PaletteId]];
    const random_seed = { ...buildRandomSeed(data.randomize), sitemap: data.sitemap };
    const businessName = data.business_name || data.name;
    const domain = data.domain || `${slugify(data.name)}.pages.dev`;

    const { data: row, error } = await supabase
      .from("sites")
      .insert({
        owner_email: email,
        name: data.name,
        domain,
        hosting_target: data.hosting_target,
        theme: data.theme,
        city: data.city,
        main_keyword: data.main_keyword,
        secondary_keywords: data.secondary_keywords,
        business_name: businessName,
        phone: data.phone,
        email: data.email,
        address: data.address,
        astro_template: data.astro_template,
        color_palette: { id: data.palette, colors: palette },
        randomize: data.randomize,
        random_seed,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Si des composants Theme Builder sont sélectionnés, on assemble l'ossature réelle
    // et on l'injecte dans le brand + on remplace le HTML de la page 'index' par cette ossature.
    const brand = data.brand;
    let homeHtml = brand?.home_html ?? "";
    if (brand && (brand.selected_header_id || brand.selected_hero_id || brand.selected_footer_id || (brand.selected_section_ids?.length ?? 0) > 0)) {
      homeHtml = assembleHomeHtml(
        {
          header: brand.selected_header_id || undefined,
          hero: brand.selected_hero_id || undefined,
          sections: brand.selected_section_ids ?? [],
          footer: brand.selected_footer_id || undefined,
        },
        {
          brand_name: brand.brand_name,
          tagline: brand.tagline,
          colors: brand.colors,
          logo_url: brand.logo_url,
        },
        brand.component_overrides ?? {},
      );
    }
    const brandForData = brand ? { ...brand, home_html: homeHtml } : undefined;

    const basePages: SiteData = data.pages && data.pages.length > 0
      ? { pages: data.pages.map((p) => ({ ...p, slug: normalizePageSlug(p.slug) })) }
      : await generateAllPages({
          theme: data.theme,
          city: data.city,
          business_name: businessName,
          main_keyword: data.main_keyword,
          sitemap: data.sitemap,
          secondary_keywords: data.secondary_keywords,
          brand: brandForData,
        });
    // Remplace la page d'accueil par l'ossature Theme Builder si dispo
    const finalPages = homeHtml
      ? basePages.pages.map((p) =>
          p.slug === "index"
            ? { ...p, html_content: homeHtml, seo_title: p.seo_title || `${brand?.brand_name ?? businessName} — ${data.theme}` }
            : p,
        )
      : basePages.pages;

    const siteData: SiteData = brandForData
      ? {
          pages: finalPages,
          site_info: {
            brand_name: brandForData.brand_name,
            tagline: brandForData.tagline,
            story: brandForData.story,
            colors: brandForData.colors,
            logo_url: brandForData.logo_url,
            moodboard_url: brandForData.moodboard_url,
          },
        }
      : { pages: finalPages };


    await supabase.from("sites").update({ site_data: siteData }).eq("id", row.id);

    const trig = await triggerRunner(row.id, row.name);
    if (!trig.triggered) {
      await supabase
        .from("sites")
        .update({ status: "failed", last_error: trig.error })
        .eq("id", row.id);
      return { site: { ...row, status: "failed", last_error: trig.error } };
    }
    await supabase.from("sites").update({ status: "generating" }).eq("id", row.id);
    return { site: { ...row, status: "generating" } };
  });

export const retrySite = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: row, error } = await supabase
      .from("sites")
      .select("id, owner_email, name, theme, city, business_name, main_keyword, secondary_keywords, random_seed")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.owner_email !== email) throw new Error("Not found");

    await supabase
      .from("sites")
      .update({ status: "pending", last_error: null })
      .eq("id", data.id);
    const seed = (row.random_seed ?? {}) as { sitemap?: SitemapPage[] };
    const sitemap = seed.sitemap ?? [{ title: "Accueil", slug: "index" }];
    const siteData = await generateAllPages({
      theme: row.theme,
      city: row.city,
      business_name: row.business_name,
      main_keyword: row.main_keyword,
      sitemap,
      secondary_keywords: row.secondary_keywords ?? [],
    });

    await supabase.from("sites").update({ site_data: siteData }).eq("id", data.id);
    const trig = await triggerRunner(data.id, row.name);
    if (!trig.triggered) {
      await supabase
        .from("sites")
        .update({ status: "failed", last_error: trig.error })
        .eq("id", data.id);
      return { ok: false, error: trig.error };
    }
    await supabase.from("sites").update({ status: "generating" }).eq("id", data.id);
    return { ok: true };
  });

async function cfFetch(path: string, init: RequestInit = {}) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) {
    throw new Error("CF_ACCOUNT_ID ou CF_API_TOKEN manquant");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  return res;
}

export const syncCloudflareStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: row, error } = await supabase
      .from("sites")
      .select("id, owner_email, name, status, deploy_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.owner_email !== email) throw new Error("Not found");

    const projectName = slugify(row.name);
    const res = await cfFetch(`/pages/projects/${projectName}/deployments`);
    if (res.status === 404) {
      return { ok: false, error: "Projet Cloudflare introuvable", status: row.status };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Cloudflare ${res.status}: ${body.slice(0, 200)}`, status: row.status };
    }
    const json = (await res.json()) as {
      result?: Array<{
        latest_stage?: { name?: string; status?: string };
        url?: string;
        aliases?: string[] | null;
      }>;
    };
    const latest = json.result?.[0];
    if (!latest) {
      return { ok: false, error: "Aucun déploiement trouvé", status: row.status };
    }
    const stageStatus = latest.latest_stage?.status;
    const stageName = latest.latest_stage?.name;

    let newStatus = row.status;
    if (stageStatus === "success" && stageName === "deploy") newStatus = "deployed";
    else if (stageStatus === "failure") newStatus = "failed";
    else if (stageStatus === "active" || stageStatus === "idle") {
      if (stageName === "build") newStatus = "building";
      else if (stageName === "deploy") newStatus = "deploying";
    }

    const canonicalUrl =
      (latest.aliases && latest.aliases[0]) ||
      `https://${projectName}.pages.dev`;
    const deployUrl = newStatus === "deployed" ? canonicalUrl : row.deploy_url;

    const update: { status: string; deploy_url?: string } = { status: newStatus };
    if (deployUrl && deployUrl !== row.deploy_url) update.deploy_url = deployUrl;
    if (newStatus !== row.status || update.deploy_url) {
      await supabase.from("sites").update(update).eq("id", data.id);
    }
    return { ok: true, status: newStatus, deploy_url: deployUrl };
  });


const updateSiteSchema = z.object({
  id: z.string().uuid(),
  pages: z.array(pageContentSchema).min(1).max(60),
  brand: brandIdentitySchema.optional(),
});

export const updateSite = createServerFn({ method: "POST" })
  .inputValidator((input) => updateSiteSchema.parse(input))
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: row, error } = await supabase
      .from("sites")
      .select("id, owner_email, name, random_seed, site_data")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.owner_email !== email) throw new Error("Not found");

    const pages = data.pages.map((p) => ({ ...p, slug: normalizePageSlug(p.slug) }));
    const sitemap: SitemapPage[] = pages.map((p) => ({
      title: p.seo_title.split("—")[0].trim() || p.slug,
      slug: p.slug === "index" ? "/" : `/${p.slug}`,
    }));
    const seed = (row.random_seed ?? {}) as Record<string, unknown>;
    const newSeed = { ...seed, sitemap };

    const prevData = (row.site_data ?? {}) as SiteData;
    const nextData: SiteData = { pages };
    if (data.brand) {
      nextData.site_info = {
        brand_name: data.brand.brand_name,
        tagline: data.brand.tagline,
        story: data.brand.story,
        colors: data.brand.colors,
        logo_url: data.brand.logo_url,
        moodboard_url: data.brand.moodboard_url,
      };
    } else if (prevData.site_info) {
      nextData.site_info = prevData.site_info;
    }

    await supabase
      .from("sites")
      .update({
        site_data: nextData,
        random_seed: newSeed,
        status: "pending",
        last_error: null,
      })
      .eq("id", data.id);

    const trig = await triggerRunner(data.id, row.name);
    if (!trig.triggered) {
      await supabase
        .from("sites")
        .update({ status: "failed", last_error: trig.error })
        .eq("id", data.id);
      return { ok: false, error: trig.error };
    }
    await supabase.from("sites").update({ status: "generating" }).eq("id", data.id);
    return { ok: true };
  });

export const generatePageForSite = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      slug: z.string().trim().min(1).max(120),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: row, error } = await supabase
      .from("sites")
      .select("id, owner_email, theme, city, business_name, main_keyword, secondary_keywords, random_seed, site_data")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.owner_email !== email) throw new Error("Not found");
    const seed = (row.random_seed ?? {}) as { sitemap?: SitemapPage[] };
    const sitemap = seed.sitemap ?? [];
    const page = await generatePageContentServer({
      theme: row.theme,
      city: row.city,
      business_name: row.business_name,
      main_keyword: row.main_keyword,
      secondary_keywords: row.secondary_keywords ?? [],
      sitemap,
      page: { title: data.title, slug: data.slug },
    });
    return { page };
  });



export const deleteSite = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: row, error: selErr } = await supabase
      .from("sites")
      .select("id, owner_email, name")
      .eq("id", data.id)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!row || row.owner_email !== email) throw new Error("Not found");

    const projectName = slugify(row.name);
    try {
      const res = await cfFetch(`/pages/projects/${projectName}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => "");
        throw new Error(`Cloudflare ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (!/manquant/.test(msg) && !/404/.test(msg)) {
        throw new Error(`Suppression Cloudflare échouée: ${msg}`);
      }
      if (/manquant/.test(msg)) throw e;
    }

    const { error } = await supabase
      .from("sites")
      .delete()
      .eq("id", data.id)
      .eq("owner_email", email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

