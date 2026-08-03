import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";

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

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type VfsFileDTO = { path: string; content: string };
export type ProjectMessageDTO = {
  role: "user" | "assistant";
  content: string;
  versionId?: string;
  hasFileChanges?: boolean;
};
export type ProjectVersionDTO = {
  id: string;
  files: VfsFileDTO[];
  timestamp: number;
  message: string;
};

/** Liste des projets de l'utilisateur (sans les fichiers). */
export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const email = await requireUser();
  const supabase = await loadAdmin();
  const { data, error } = await supabase
    .from("app_projects")
    .select("id, name, updated_at")
    .eq("owner_email", email)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return {
    projects: (data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      updatedAt: new Date(p.updated_at as string).getTime(),
    })),
  };
});

/** Charge un projet complet : fichiers, messages, versions. */
export const getProject = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: project, error } = await supabase
      .from("app_projects")
      .select("id, name, files, updated_at")
      .eq("id", data.id)
      .eq("owner_email", email)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Projet introuvable");

    const { data: msgs } = await supabase
      .from("app_project_messages")
      .select("role, content, version_id, has_file_changes")
      .eq("project_id", data.id)
      .order("created_at", { ascending: true })
      .limit(200);

    const { data: versions } = await supabase
      .from("app_project_versions")
      .select("id, files, message, created_at")
      .eq("project_id", data.id)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      id: project.id as string,
      name: project.name as string,
      files: (project.files ?? []) as VfsFileDTO[],
      messages: (msgs ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
        versionId: (m.version_id as string | null) ?? undefined,
        hasFileChanges: Boolean(m.has_file_changes),
      })) as ProjectMessageDTO[],
      versions: (versions ?? []).map((v) => ({
        id: v.id as string,
        files: (v.files ?? []) as VfsFileDTO[],
        timestamp: new Date(v.created_at as string).getTime(),
        message: v.message as string,
      })) as ProjectVersionDTO[],
    };
  });

/** Crée ou met à jour un projet (nom + fichiers). Retourne l'id serveur. */
export const saveProject = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string | null; name: string; files: VfsFileDTO[] }) => data)
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();

    if (data.id) {
      const { data: row, error } = await supabase
        .from("app_projects")
        .update({ name: data.name, files: data.files })
        .eq("id", data.id)
        .eq("owner_email", email)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (row) return { id: row.id as string };
    }

    const { data: created, error: insertError } = await supabase
      .from("app_projects")
      .insert({ owner_email: email, name: data.name, files: data.files })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    return { id: created.id as string };
  });

/** Remplace l'historique de chat d'un projet. */
export const saveProjectMessages = createServerFn({ method: "POST" })
  .inputValidator((data: { projectId: string; messages: ProjectMessageDTO[] }) => data)
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: owned } = await supabase
      .from("app_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("owner_email", email)
      .maybeSingle();
    if (!owned) throw new Error("Projet introuvable");

    await supabase.from("app_project_messages").delete().eq("project_id", data.projectId);
    const rows = data.messages.slice(-100).map((m, i) => ({
      project_id: data.projectId,
      role: m.role,
      content: m.content,
      version_id: m.versionId ?? null,
      has_file_changes: Boolean(m.hasFileChanges),
      created_at: new Date(Date.now() + i).toISOString(),
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("app_project_messages").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

/** Ajoute une version (snapshot) au projet. */
export const saveProjectVersion = createServerFn({ method: "POST" })
  .inputValidator((data: { projectId: string; id?: string; message: string; files: VfsFileDTO[] }) => data)
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { data: owned } = await supabase
      .from("app_projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("owner_email", email)
      .maybeSingle();
    if (!owned) throw new Error("Projet introuvable");

    const payload: Record<string, unknown> = {
      project_id: data.projectId,
      message: data.message,
      files: data.files,
    };
    if (data.id && /^[0-9a-f-]{36}$/i.test(data.id)) payload.id = data.id;

    const { data: row, error } = await supabase
      .from("app_project_versions")
      .insert(payload)
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, timestamp: new Date(row.created_at as string).getTime() };
  });

/** Supprime un projet et toutes ses données. */
export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const email = await requireUser();
    const supabase = await loadAdmin();
    const { error } = await supabase
      .from("app_projects")
      .delete()
      .eq("id", data.id)
      .eq("owner_email", email);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
