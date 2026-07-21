import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  createSiteSchema,
  generatePageSchema,
  PALETTES,
  suggestKeywordsSchema,
  suggestSitemapSchema,
  type PageContent,
  type PaletteId,
  type SitemapPage,
} from "./sites-schema";


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
};

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
  const parsed = await callAiJson<{ seo_title?: string; html_content?: string }>(
    "Tu es un développeur frontend et rédacteur SEO expert. Tu génères UNE page complète d'un site vitrine en français, en HTML + Tailwind CSS. RÈGLES STRICTES: (1) N'inclus JAMAIS <html>, <head>, <body>, <title> — uniquement le contenu intérieur du <body>. (2) Design moderne, aéré, responsive : utilise exclusivement des classes Tailwind CSS pour la mise en page, la typographie, les couleurs, les espacements, les grilles. (3) Contenu riche : plusieurs sections avec titres (h1/h2/h3), paragraphes détaillés, listes à puces, cartes, CTA, adaptés à la page demandée. (4) Inclus un header avec la navigation basée sur l'arborescence fournie (les liens pointent vers /slug ou / pour l'accueil = slug 'index'), un hero adapté à la page, plusieurs sections de contenu, et un footer. (5) Contenu orienté SEO local. (6) Réponds UNIQUEMENT en JSON strict {\"seo_title\": string, \"html_content\": string}.",
    `Entreprise: ${input.business_name}\nThématique: ${input.theme}\nVille: ${input.city}\nMot-clé principal: ${input.main_keyword}\nMots-clés secondaires: ${(input.secondary_keywords ?? []).join(", ")}\nArborescence du site: ${JSON.stringify(navSitemap)}\n\nPAGE À GÉNÉRER: titre="${input.page.title}", slug="${normalizedSlug}"\n\nRéponds au format JSON.`,
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

    const siteData: SiteData = data.pages && data.pages.length > 0
      ? { pages: data.pages.map((p) => ({ ...p, slug: normalizePageSlug(p.slug) })) }
      : await generateAllPages({
          theme: data.theme,
          city: data.city,
          business_name: businessName,
          main_keyword: data.main_keyword,
          sitemap: data.sitemap,
          secondary_keywords: data.secondary_keywords,
        });

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

