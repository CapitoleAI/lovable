import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

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

const REPO = process.env.GITHUB_RUNNER_REPO ?? "CapitoleAI/astro";

async function ghFetch(path: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN missing");
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Lovable-Astro-Runner",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

type StepDTO = {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string | null;
  completed_at: string | null;
};
type JobDTO = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps: StepDTO[];
};
type ProgressDTO = {
  run: {
    id: number;
    status: string;
    conclusion: string | null;
    html_url: string;
    created_at: string;
    updated_at: string;
  } | null;
  jobs: JobDTO[];
};

export const getSiteBuildProgress = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<ProgressDTO> => {
    const email = await requireUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: site, error } = await supabaseAdmin
      .from("sites")
      .select("id, owner_email, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!site || site.owner_email !== email) throw new Error("Not found");

    const runs = await ghFetch(
      `/repos/${REPO}/actions/runs?event=repository_dispatch&per_page=30`,
    );
    const siteCreated = new Date(site.created_at).getTime();
    type Run = {
      id: number;
      status: string;
      conclusion: string | null;
      html_url: string;
      created_at: string;
      updated_at: string;
    };
    const candidates: Run[] = (runs.workflow_runs ?? [])
      .map((r: Run) => r)
      .filter((r: Run) => new Date(r.created_at).getTime() >= siteCreated - 30_000)
      .sort(
        (a: Run, b: Run) =>
          Math.abs(new Date(a.created_at).getTime() - siteCreated) -
          Math.abs(new Date(b.created_at).getTime() - siteCreated),
      );
    const run = candidates[0] ?? null;
    if (!run) return { run: null, jobs: [] };

    const jobsRes = await ghFetch(`/repos/${REPO}/actions/runs/${run.id}/jobs`);
    type JobIn = {
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
      steps?: StepDTO[];
    };
    const jobs: JobDTO[] = (jobsRes.jobs ?? []).map((j: JobIn) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      steps: (j.steps ?? []).map((s) => ({
        name: s.name,
        status: s.status,
        conclusion: s.conclusion,
        number: s.number,
        started_at: s.started_at,
        completed_at: s.completed_at,
      })),
    }));

    return {
      run: {
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        html_url: run.html_url,
        created_at: run.created_at,
        updated_at: run.updated_at,
      },
      jobs,
    };
  });

// Reconcile site status from a completed GitHub run when the callback missed.
async function reconcileFromRun(
  siteId: string,
  run: { status: string; conclusion: string | null; html_url: string },
  currentStatus: string,
) {
  if (run.status !== "completed") return;
  if (!["pending", "generating", "building", "deploying"].includes(currentStatus)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (run.conclusion === "success") {
    await supabaseAdmin
      .from("sites")
      .update({ status: "deployed", build_log_url: run.html_url, last_error: null })
      .eq("id", siteId);
  } else {
    await supabaseAdmin
      .from("sites")
      .update({
        status: "failed",
        build_log_url: run.html_url,
        last_error: `Workflow ${run.conclusion ?? "failed"}`,
      })
      .eq("id", siteId);
  }
}
