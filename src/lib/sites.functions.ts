import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { createSiteSchema, PALETTES, type PaletteId } from "./sites-schema";

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
    .replace(/\s+/g, "-");
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
  const payload = JSON.stringify({
    event_type: "build_site",
    client_payload: {
      site_id: siteId,
      site_name: slugify(siteName),
      callback_url: callbackUrl,
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
    const random_seed = buildRandomSeed(data.randomize);

    const { data: row, error } = await supabase
      .from("sites")
      .insert({
        owner_email: email,
        name: data.name,
        domain: data.domain,
        hosting_target: data.hosting_target,
        theme: data.theme,
        city: data.city,
        main_keyword: data.main_keyword,
        secondary_keywords: data.secondary_keywords,
        business_name: data.business_name,
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
      .select("id, owner_email, name")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.owner_email !== email) throw new Error("Not found");

    await supabase
      .from("sites")
      .update({ status: "pending", last_error: null })
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

    const update: Record<string, unknown> = { status: newStatus };
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

