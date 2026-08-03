import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileCode2,
  Globe,
  LayoutDashboard,
  Loader2,
  LogOut,
  Monitor,
  Network,
  MessageSquare,
  Plus,
  RefreshCw,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import logoAsset from "@/assets/capitoleai-flower.webp.asset.json";
import { getAuthStatus, signOut } from "@/lib/auth.functions";
import {
  listSites,
  updateSite,
  deleteSite,
  syncCloudflareStatus,
} from "@/lib/sites.functions";
import { regeneratePageContent, generateNewPage } from "@/lib/orchestrator.functions";
import { getSiteBuildProgress } from "@/lib/github-runs.functions";
import { commitAppVfs } from "@/lib/github-vfs.functions";
import type { OrchestratorAction } from "@/lib/orchestrator.functions";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";
import type { VfsFile } from "@/lib/vfs";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { WorkspaceChat } from "@/components/workspace-chat";
import { WorkspacePreview } from "@/components/workspace-preview";
import { WorkspaceCode } from "@/components/workspace-code";
import { WorkspaceSitemap } from "@/components/workspace-sitemap";
import { WorkspaceAnalytics } from "@/components/workspace-analytics";
import { SiteBuildProgress } from "@/components/site-build-progress";


// ---------------- Route ----------------

const sitesQueryOptions = queryOptions({
  queryKey: ["sites"],
  queryFn: () => listSites(),
  staleTime: 10_000,
});

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Espace privé" },
      { name: "description", content: "Éditeur de sites CapitoleAI." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const status = await getAuthStatus();
    if (!status.authenticated) throw redirect({ to: "/login" });
    return { email: status.email };
  },
  loader: async ({ context }) => {
    const qc = (context as { queryClient: import("@tanstack/react-query").QueryClient }).queryClient;
    const sites = await qc
      .ensureQueryData(sitesQueryOptions)
      .catch(() => ({ sites: [] as SiteRow[] }));
    return { email: (context as { email: string | null }).email, sites };
  },
  component: DashboardPage,
});

// ---------------- Types ----------------

type SitemapNode = { title: string; slug: string; children?: SitemapNode[] };
type SiteRow = {
  id: string;
  name: string;
  domain: string;
  hosting_target: string;
  status: "pending" | "generating" | "building" | "deploying" | "deployed" | "failed";
  deploy_url: string | null;
  build_log_url: string | null;
  last_error: string | null;
  created_at: string;
  site_data?: {
    pages?: PageContent[];
    site_info?: {
      brand_name?: string;
      colors?: BrandIdentity["colors"];
      logo_url?: string;
    };
  } | null;
  random_seed?: { sitemap?: SitemapNode[] } | null;
};

const STATUS_LABEL: Record<SiteRow["status"], string> = {
  pending: "En attente",
  generating: "Génération",
  building: "Build",
  deploying: "Déploiement",
  deployed: "En ligne",
  failed: "Échec",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function StatusDot({ up, title }: { up: boolean; title: string }) {
  const color = up ? "bg-emerald-500" : "bg-red-500";
  const soft = up ? "bg-emerald-500/40" : "bg-red-500/40";
  return (
    <span
      role="status"
      aria-label={title}
      title={title}
      className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center"
    >
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${soft}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function getFileLabel(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html": return "HTML";
    case "css": return "CSS";
    case "js": return "JS";
    case "jsx": return "React";
    case "ts": return "TS";
    case "tsx": return "React TS";
    case "json": return "JSON";
    case "md": return "MD";
    default: return ext?.toUpperCase() ?? "Fichier";
  }
}

// ---------------- Create mode preview component ----------------

function CreatePreview({ files, nonce }: { files: VfsFile[]; nonce: number }) {
  const htmlFile = files.find(f => f.path.endsWith(".html") || f.path === "index.html");
  if (!htmlFile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Aucun fichier HTML. L'IA va générer l'application.
      </div>
    );
  }
  const cssFiles = files.filter(f => f.path.endsWith(".css"));
  const jsFiles = files.filter(f => f.path.endsWith(".js") || f.path.endsWith(".mjs"));
  const styles = cssFiles.map(f => `<style>${f.content}</style>`).join("\n");
  const scripts = jsFiles.map(f => `<script>${f.content}</script>`).join("\n");
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body>${htmlFile.content}${scripts}</body></html>`;
  return (
    <iframe
      key={`create-preview-${nonce}`}
      title="Aperçu"
      sandbox="allow-scripts allow-forms allow-modals"
      srcDoc={doc}
      className="h-full w-full bg-white rounded-lg border border-[#272726]"
    />
  );
}

// ---------------- Create mode file tree component ----------------

function CreateFileTree({ files, selectedPath, onSelect }: {
  files: VfsFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const dirs = new Map<string, VfsFile[]>();
  for (const f of files) {
    const parts = f.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "(racine)";
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir)!.push(f);
  }
  return (
    <div className="space-y-1 p-2">
      {Array.from(dirs.entries()).map(([dir, dirFiles]) => (
        <div key={dir}>
          {dir !== "(racine)" && (
            <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-neutral-400">
              <ChevronDown className="h-3 w-3 opacity-50" />
              {dir}
            </div>
          )}
          {dirFiles.map(f => (
            <button
              key={f.path}
              type="button"
              onClick={() => onSelect(f.path)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition ${
                selectedPath === f.path
                  ? "bg-[#272726] text-white"
                  : "text-neutral-300 hover:bg-[#2a2a29]"
              }`}
            >
              <span className="rounded bg-[#3a3a38] px-1 py-0.5 text-[10px] font-medium text-neutral-400">
                {getFileLabel(f.path)}
              </span>
              <span className="flex-1 truncate font-mono">{f.path}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------- Component ----------------

function DashboardPage() {
  const { sites: initialSites } = Route.useLoaderData();
  const router = useRouter();
  const logout = useServerFn(signOut);
  const list = useServerFn(listSites);
  const del = useServerFn(deleteSite);
  const syncCf = useServerFn(syncCloudflareStatus);
  const save = useServerFn(updateSite);
  const regen = useServerFn(regeneratePageContent);
  const genPage = useServerFn(generateNewPage);
  const buildProgress = useServerFn(getSiteBuildProgress);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "create" | "empty">("empty");

  // VFS state for create mode
  const [vfsFiles, setVfsFiles] = useState<VfsFile[]>([]);
  const [vfsPreviewNonce, setVfsPreviewNonce] = useState(0);
  
  // Project persistence
  const [createProjectId, setCreateProjectId] = useState<string | null>(null);
  const [createProjectName, setCreateProjectName] = useState<string>("Nouveau projet");
  const [chatMessages, setChatMessages] = useState<Array<{role: string; content: string}>>([]);
  const [savedChats, setSavedChats] = useState<Record<string, Array<{role: string; content: string}>>>({});
  
  // Version history
  const [versionHistory, setVersionHistory] = useState<Array<{
    files: VfsFile[];
    timestamp: number;
    message: string;
  }>>([]);

  // Local draft state per active site
  const [draftPages, setDraftPages] = useState<PageContent[] | null>(null);
  const [draftBrand, setDraftBrand] = useState<Partial<BrandIdentity> | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Workspace UI state
  const [tab, setTab] = useState<"preview" | "code" | "sitemap" | "analytics">("preview");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewSlug, setPreviewSlug] = useState<string>("index");
  const [previewNonce, setPreviewNonce] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);


  const sitesQuery = useQuery({
    ...sitesQueryOptions,
    queryFn: () => list(),
    initialData: initialSites as never,
    refetchInterval: (q) => {
      const data = q.state.data as { sites: SiteRow[] } | undefined;
      const inProgress = data?.sites.some((s) =>
        ["pending", "generating", "building", "deploying"].includes(s.status),
      );
      return inProgress ? 5000 : false;
    },
  });

  const sites = ((sitesQuery.data?.sites as SiteRow[] | undefined) ?? []);
  const activeSite = useMemo(
    () => sites.find((s) => s.id === activeId) ?? null,
    [sites, activeId],
  );

  useEffect(() => {
    if (activeSite) {
      const pages = activeSite.site_data?.pages ?? null;
      setDraftPages(pages);
      setPreviewSlug(pages?.[0]?.slug ?? "index");
      setTab("preview");
      const info = activeSite.site_data?.site_info;
      setDraftBrand(
        info
          ? ({
              brand_name: info.brand_name ?? activeSite.name,
              colors: info.colors,
              logo_url: info.logo_url ?? "",
            } as Partial<BrandIdentity>)
          : null,
      );
    } else {
      setDraftPages(null);
      setDraftBrand(null);
    }
  }, [activeSite?.id]);

  useEffect(() => {
    if (!activeId && mode !== "create" && sites.length > 0) {
      const firstDeployed = sites.find((s) => s.status === "deployed") ?? sites[0];
      setActiveId(firstDeployed.id);
      setMode("edit");
    }
  }, [sites.length]);

  useEffect(() => {
    if (mode === "create") return;
    setMode(activeId ? "edit" : "empty");
  }, [activeId, mode]);

  const [savedProjects, setSavedProjects] = useState<Array<{id: string; name: string; files: VfsFile[]; updatedAt: number}>>([]);
  useEffect(() => {
    try { 
      const raw = localStorage.getItem("capitoleai_projects"); 
      if (raw) setSavedProjects(JSON.parse(raw)); 
      const chats = localStorage.getItem("capitoleai_chats"); 
      if (chats) setSavedChats(JSON.parse(chats));
    } catch {}
  }, []);

  function saveProject() {
    if (vfsFiles.length === 0) return;
    const now = Date.now();
    const id = createProjectId ?? crypto.randomUUID();
    if (!createProjectId) setCreateProjectId(id);
    const existing = savedProjects.filter(p => p.id !== id);
    const project = { id, name: createProjectName, files: vfsFiles, updatedAt: now };
    const all = [project, ...existing].slice(0, 50);
    setSavedProjects(all);
    localStorage.setItem("capitoleai_projects", JSON.stringify(all));
  }

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode !== "create" || vfsFiles.length === 0) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveProject(), 2000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [vfsFiles]);

  function updateChatMessages(msgs: Array<{role: string; content: string}>) {
    if (!createProjectId || msgs.length === 0) return;
    setChatMessages(msgs);
    const updated = { ...savedChats, [createProjectId]: msgs.slice(-100) };
    setSavedChats(updated);
    localStorage.setItem("capitoleai_chats", JSON.stringify(updated));
  }

  function loadProject(id: string) {
    const p = savedProjects.find(x => x.id === id);
    if (!p) return;
    setMode("create");
    setActiveId(null);
    setCreateProjectId(p.id);
    setCreateProjectName(p.name);
    setVfsFiles(p.files);
    setChatMessages(savedChats[p.id] ?? []);
    setSelectedPath(null);
    setTab("preview");
    setVersionHistory([{files:JSON.parse(JSON.stringify(p.files)),timestamp:Date.now(),message:"Chargé"}]);
    setVfsPreviewNonce(n=>n+1);
  }

  function revertToVersion(v: {files:VfsFile[];timestamp:number;message:string}) {
    setVfsFiles(JSON.parse(JSON.stringify(v.files)));
    setVfsPreviewNonce(n=>n+1);
    toast.success("Version restaurée");
  }

  function openCreate(projectId?: string) {
    if (projectId) { loadProject(projectId); return; }
    setActiveId(null);
    setMode("create");
    setCreateProjectId(null);
    setCreateProjectName("Nouveau projet");
    setVfsFiles([]);
    setChatMessages([]);
    setVersionHistory([]);
    setSelectedPath(null);
    setTab("preview");
  }

  function exitCreate() {
    saveProject();
    setMode(sites.length > 0 ? "edit" : "empty");
    if (sites.length > 0 && !activeId) setActiveId(sites[0].id);
    setVfsFiles([]);
    setSelectedPath(null);
    setCreateProjectId(null);
    setChatMessages([]);
    setVersionHistory([]);
  }


  // Background Cloudflare sync
  useEffect(() => {
    const ids = sites
      .filter((s) => s.status === "deployed" || s.status === "failed")
      .map((s) => s.id);
    if (ids.length === 0) return;
    let cancelled = false;
    async function tick() {
      for (const id of ids) {
        try { await syncCf({ data: { id } }); } catch {}
      }
      if (!cancelled) sitesQuery.refetch();
    }
    const t = setInterval(tick, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [sites.map((s) => s.id).join(","), sites.map((s) => s.status).join(",")]);

  useEffect(() => {
    if (!activeSite) return;
    const inProgress = ["pending", "generating", "building", "deploying"].includes(activeSite.status);
    if (!inProgress) return;
    let cancelled = false;
    async function tick() {
      try { await buildProgress({ data: { id: activeSite!.id } }); } catch {}
      if (!cancelled) sitesQuery.refetch();
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [activeSite?.id, activeSite?.status]);

  const isDirty = useMemo(() => {
    if (!activeSite || !draftPages) return false;
    const savedPages = activeSite.site_data?.pages ?? [];
    if (savedPages.length !== draftPages.length) return true;
    for (let i = 0; i < draftPages.length; i++) {
      const a = draftPages[i];
      const b = savedPages.find((p) => p.slug === a.slug);
      if (!b) return true;
      if (a.html_content !== b.html_content || a.seo_title !== b.seo_title) return true;
    }
    const savedColors = activeSite.site_data?.site_info?.colors;
    const draftColors = draftBrand?.colors;
    if (savedColors && draftColors) {
      for (const k of Object.keys(draftColors) as (keyof typeof draftColors)[]) {
        if (savedColors[k] !== draftColors[k]) return true;
      }
    }
    return false;
  }, [activeSite, draftPages, draftBrand]);

  async function handleLogout() {
    await logout({});
    await router.navigate({ to: "/login" });
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer ce site (Cloudflare + base) ?")) return;
    try {
      await del({ data: { id } });
      toast.success("Site supprimé");
      if (activeId === id) setActiveId(null);
      sitesQuery.refetch();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function handlePublish() {
    if (!activeSite || !draftPages) return;
    setPublishing(true);
    try {
      const brandForSave = draftBrand ? ({ brand_name: draftBrand.brand_name ?? activeSite.name, tagline: draftBrand.tagline ?? "", story: draftBrand.story ?? "", colors: draftBrand.colors ?? { primary: "#0f172a", secondary: "#334155", accent: "#38bdf8", neutral: "#e2e8f0", background: "#ffffff" }, logo_url: draftBrand.logo_url ?? "", moodboard_url: "", design_style: draftBrand.design_style ?? "minimaliste", header_style: draftBrand.header_style ?? "classique", footer_style: draftBrand.footer_style ?? "simple", sections: draftBrand.sections ?? [], selected_header_id: "", selected_hero_id: "", selected_section_ids: [], selected_footer_id: "", component_overrides: {}, home_html: "" } as BrandIdentity) : undefined;
      const res = await save({ data: { id: activeSite.id, pages: draftPages, brand: brandForSave } });
      if (!res.ok) throw new Error(res.error ?? "Échec de la publication");
      toast.success("Publication lancée");
      sitesQuery.refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setPublishing(false); }
  }

  // ---------- Chat action handler ----------
  async function handleAction(action: OrchestratorAction) {
    if (action.type === "write_file") {
      setVfsFiles((prev) => {
        const existing = prev.filter(f => f.path !== action.path);
        return [...existing, { path: action.path, content: action.content }];
      });
      setVfsPreviewNonce(n => n + 1);
      toast.success(`Fichier créé : ${action.path}`);
      return;
    }
    if (action.type === "modify_file") {
      setVfsFiles((prev) => {
        const existing = prev.filter(f => f.path !== action.path);
        return [...existing, { path: action.path, content: action.content }];
      });
      setVfsPreviewNonce(n => n + 1);
      toast.success(`Fichier modifié : ${action.path}`);
      return;
    }
    if (action.type === "delete_file") {
      setVfsFiles((prev) => prev.filter(f => f.path !== action.path));
      if (selectedPath === action.path) setSelectedPath(null);
      setVfsPreviewNonce(n => n + 1);
      toast.success(`Fichier supprimé : ${action.path}`);
      return;
    }
    if (action.type === "set_project_name") {
      setCreateProjectName(action.name);
      saveProject();
      return;
    }
    if (action.type === "open_create_wizard") {
      openCreate();
      return;
    }

    if (!activeSite || !draftPages) return;

    if (action.type === "update_colors") {
      setDraftBrand((prev) => {
        const base = prev ?? { brand_name: activeSite.name };
        const cur = (base.colors ?? { primary: "#0f172a", secondary: "#334155", accent: "#38bdf8", neutral: "#e2e8f0", background: "#ffffff" }) as BrandIdentity["colors"];
        return { ...base, colors: { ...cur, ...(action.colors as Partial<BrandIdentity["colors"]>) } };
      });
      toast.success("Palette mise à jour");
      return;
    }

    if (action.type === "update_page_content") {
      const page = draftPages.find((p) => p.slug === action.slug);
      if (!page) { toast.error(`Page "${action.slug}" introuvable`); return; }
      toast.info(`Régénération de « ${page.seo_title.split("—")[0].trim() || page.slug} »…`);
      try {
        const res = await regen({ data: { instruction: action.instruction, current_html: page.html_content, page_title: page.seo_title, slug: page.slug, brand: draftBrand ?? undefined } });
        setDraftPages((prev) => (prev ?? []).map((p) => p.slug === action.slug ? { ...p, html_content: res.html_content, seo_title: action.seo_title ?? res.seo_title } : p));
        toast.success("Page mise à jour");
      } catch (e) { toast.error((e as Error).message); }
      return;
    }

    if (action.type === "add_page") {
      const slug = action.slug ? slugify(action.slug) : slugify(action.title);
      if (!slug || draftPages.some((p) => p.slug === slug)) { toast.error("Slug invalide ou déjà utilisé"); return; }
      toast.info(`Création de « ${action.title} »…`);
      try {
        const page = await genPage({ data: { title: action.title, slug, instruction: action.instruction ?? "", brand: draftBrand ?? undefined, site_context: { name: activeSite.name, pages: draftPages.map((p) => ({ slug: p.slug, seo_title: p.seo_title })) } } });
        setDraftPages((prev) => [...(prev ?? []), page]);
        toast.success("Page ajoutée");
      } catch (e) { toast.error((e as Error).message); }
      return;
    }

    if (action.type === "remove_page") {
      if (action.slug === "index") { toast.error("Impossible de supprimer la page d'accueil"); return; }
      setDraftPages((prev) => (prev ?? []).filter((p) => p.slug !== action.slug));
      toast.success("Page supprimée");
      return;
    }
  }

  const previewBg = draftBrand?.colors?.background;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#1D1D1C] text-neutral-100">
      <header className="flex h-14 shrink-0 items-stretch bg-[#1D1D1C]">
        <div className="flex w-80 shrink-0 items-center gap-3 px-3">
        {mode === "create" ? (
          <input
            value={createProjectName}
            onChange={(e) => { setCreateProjectName(e.target.value); saveProject(); }}
            className="h-8 w-[160px] rounded-md border border-[#3a3a38] bg-[#272726] px-2 text-sm text-neutral-100 outline-none focus:border-[#3B6DF5]"
            title="Renommer le projet"
          />
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-[#272726]" title="Menu">
              <img src={logoAsset.url} alt="CapitoleAI" className="h-7 w-7 object-contain" />
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px]">
            <DropdownMenuItem onClick={() => { setActiveId(null); setMode("empty"); }}>
              <LayoutDashboard className="mr-2 h-3.5 w-3.5" /> Dashboard
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Vos sites</DropdownMenuLabel>
            {sites.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">Aucun site pour l'instant.</div>}
            {sites.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => { setActiveId(s.id); setMode("edit"); }} className="flex items-center gap-2">
                {s.id === activeId ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                <span className="flex-1 truncate">{s.name}</span>
                <span className={"text-[10px] " + (s.status === "deployed" ? "text-emerald-600" : s.status === "failed" ? "text-red-600" : "text-muted-foreground")}>{STATUS_LABEL[s.status]}</span>
              </DropdownMenuItem>
            ))}
            {savedProjects.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Projets locaux</DropdownMenuLabel>
                {savedProjects.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => loadProject(p.id)} className="flex items-center gap-2">
                    <FileCode2 className="h-3.5 w-3.5 opacity-60" />
                    <span className="flex-1 truncate text-xs">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString()}</span>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openCreate()}><Plus className="mr-2 h-3.5 w-3.5" /> Nouveau projet</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}><LogOut className="mr-2 h-3.5 w-3.5" /> Se déconnecter</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeSite ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">{activeSite.name}</span>
            {activeSite.status === "deployed" ? <StatusDot up title="En ligne" /> : activeSite.status === "failed" ? <StatusDot up={false} title="Hors ligne" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">{STATUS_LABEL[activeSite.status]}</span>
          </div>
        ) : (
          <span className="text-sm text-neutral-400">{mode === "create" ? "Nouveau projet" : "Dashboard"}</span>
        )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        {mode === "create" && (
          <div className="flex flex-1 items-center gap-2">
            <div className="flex items-center rounded-full bg-[#272726] p-0.5">
              {[{ value: "preview" as const, label: "Aperçu", icon: Globe }, { value: "code" as const, label: "Code", icon: FileCode2 }].map((t) => {
                const active = tab === t.value;
                const Icon = t.icon;
                return (
                  <button key={t.value} type="button" onClick={() => setTab(t.value)} title={t.label} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors", active ? "bg-[#272726] text-white shadow-sm" : "text-neutral-400 hover:text-neutral-100")}>
                    <Icon className="h-3.5 w-3.5" />
                    {active && <span>{t.label}</span>}
                  </button>
                );
              })}
            </div>
            {tab === "preview" && (
              <div className="mx-auto flex items-center gap-2">
                <button type="button" title="Rafraîchir" onClick={() => setVfsPreviewNonce((n) => n + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 hover:bg-[#272726] hover:text-white">
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {activeSite && mode === "edit" && (
          <div className="flex flex-1 items-center gap-2">
            <div className="flex items-center rounded-full bg-[#272726] p-0.5">
              {[{ value: "preview" as const, label: "Aperçu", icon: Globe }, { value: "code" as const, label: "Code", icon: FileCode2 }, { value: "sitemap" as const, label: "Arborescence", icon: Network }, { value: "analytics" as const, label: "Analytics", icon: BarChart3 }].map((t) => {
                const active = tab === t.value;
                const Icon = t.icon;
                return (
                  <button key={t.value} type="button" onClick={() => setTab(t.value)} title={t.label} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors", active ? "bg-[#272726] text-white shadow-sm" : "text-neutral-400 hover:text-neutral-100")}>
                    <Icon className="h-3.5 w-3.5" />
                    {active && <span>{t.label}</span>}
                  </button>
                );
              })}
            </div>
            {tab === "preview" && (draftPages ?? []).length > 0 && (
              <div className="mx-auto flex items-center gap-2">
                <button type="button" title="Changer d'appareil" onClick={() => setDevice(device === "desktop" ? "tablet" : device === "tablet" ? "mobile" : "desktop")} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 hover:bg-[#272726] hover:text-white">
                  {device === "desktop" && <Monitor className="h-4 w-4" />}
                  {device === "tablet" && <Tablet className="h-4 w-4" />}
                  {device === "mobile" && <Smartphone className="h-4 w-4" />}
                </button>
                <div className="flex min-w-[165px] items-center gap-1 rounded-full bg-[#272726] px-1.5 py-1">
                  <button type="button" onClick={() => setPreviewNonce((n) => n + 1)} title="Rafraîchir" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:text-neutral-100">
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex flex-1 items-center justify-start gap-1 rounded-full px-2 py-0.5 font-mono text-xs text-neutral-100"><span className="truncate">{previewSlug === "index" ? "/" : `/${previewSlug}`}</span><ChevronDown className="h-3 w-3 shrink-0 opacity-60" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="min-w-[220px]">
                      <DropdownMenuLabel>Pages</DropdownMenuLabel>
                      {(draftPages ?? []).map((p) => (<DropdownMenuItem key={p.slug} onClick={() => setPreviewSlug(p.slug)} className="flex items-center gap-2">{p.slug === previewSlug ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}<span className="font-mono text-xs">{p.slug === "index" ? "/" : `/${p.slug}`}</span></DropdownMenuItem>))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {activeSite.deploy_url && (<a href={previewSlug === "index" ? activeSite.deploy_url : `${activeSite.deploy_url.replace(/\/$/, "")}/${previewSlug}`} target="_blank" rel="noreferrer" title="Ouvrir dans un nouvel onglet" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-300 hover:bg-[#272726] hover:text-white"><ExternalLink className="h-4 w-4" /></a>)}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {activeSite && (
            <Popover>
              <PopoverTrigger asChild><Button size="sm" className="bg-[#3B6DF5] text-white hover:bg-[#3361de]"><Upload className="mr-1.5 h-4 w-4" /> Publier</Button></PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4">
                <div className="mb-3"><p className="text-sm font-semibold">Publier</p><p className="text-xs text-muted-foreground">{isDirty ? "Modifications non publiées." : "Aucune modification en attente."}</p></div>
                {activeSite.deploy_url && (<div className="mb-3"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">URL du site</p><div className="mt-1 flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5"><span className="flex-1 truncate text-xs">{activeSite.deploy_url.replace(/^https?:\/\//, "")}</span><button type="button" className="rounded p-1 hover:bg-accent" title="Copier" onClick={() => { navigator.clipboard.writeText(activeSite.deploy_url!); toast.success("URL copiée"); }}><Copy className="h-3 w-3" /></button></div></div>)}
                <div className="space-y-1.5">
                  {activeSite.deploy_url && (<Button variant="outline" size="sm" className="w-full justify-start" asChild><a href={activeSite.deploy_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-3.5 w-3.5" /> Ouvrir le site</a></Button>)}
                  <Button variant="outline" size="sm" className="w-full justify-start text-destructive hover:text-destructive" onClick={() => handleDelete(activeSite.id)}><Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer le site</Button>
                  <Button size="sm" className="w-full bg-[#3B6DF5] text-white hover:bg-[#3361de]" onClick={handlePublish} disabled={!isDirty || publishing}>{publishing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />} Publier les modifications</Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-80 shrink-0 flex-col bg-[#1D1D1C]">
          <div className="min-h-0 flex-1">
            <WorkspaceChat
              mode={mode}
              siteName={activeSite?.name}
              brand={draftBrand ?? undefined}
              pages={draftPages ?? undefined}
              creationContext={mode === "create" ? { app: { files: vfsFiles.map(f => ({ path: f.path })) } } : undefined}
              onAction={handleAction}
              onCreateWizard={openCreate}
              initialMessages={mode === "create" ? chatMessages : undefined}
              onMessagesChange={mode === "create" ? updateChatMessages : undefined}
            />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-muted/30">
          {mode === "create" ? (
            tab === "code" ? (
              <div className="flex min-h-0 flex-1">
                <div className="w-56 shrink-0 overflow-y-auto border-r border-[#272726] bg-[#1D1D1C]">
                  <CreateFileTree files={vfsFiles} selectedPath={selectedPath} onSelect={setSelectedPath} />
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3">
                  {selectedPath ? (<pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-200">{vfsFiles.find(f => f.path === selectedPath)?.content ?? ""}</pre>) : (<div className="flex h-full items-center justify-center text-sm text-muted-foreground">{vfsFiles.length === 0 ? "Décrivez votre projet dans le chat. L'IA va coder votre application." : "Sélectionnez un fichier dans l'arborescence."}</div>)}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 p-4">
                {vfsFiles.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-md text-center">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#3B6DF5]/10"><MessageSquare className="h-6 w-6 text-[#3B6DF5]" /></div>
                      <h2 className="text-xl font-semibold">Nouveau projet</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Décrivez votre application dans le chat à gauche. L'IA va coder et vous verrez le résultat ici en temps réel.</p>
                      <Button className="mt-6" variant="ghost" onClick={exitCreate}>← Retour au dashboard</Button>
                    </div>
                  </div>
                ) : (<CreatePreview files={vfsFiles} nonce={vfsPreviewNonce} />)}
              </div>
            )
          ) : !activeSite ? (
            <EmptyWorkspace onCreate={openCreate} />
          ) : ["pending", "generating", "building", "deploying"].includes(activeSite.status) && !draftPages?.length ? (
            <div className="flex flex-1 items-center justify-center p-6"><div className="w-full max-w-md rounded-lg border border-border bg-card p-6"><p className="mb-3 text-sm font-medium">Build en cours</p><SiteBuildProgress siteId={activeSite.id} active /></div></div>
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex min-h-0 flex-1 flex-col">
              <TabsContent value="preview" className="min-h-0 flex-1 mt-0" style={{ backgroundColor: "#1D1D1C" }}>
                <WorkspacePreview pages={draftPages ?? []} brand={draftBrand ?? undefined} activeSlug={previewSlug} device={device} nonce={previewNonce} />
              </TabsContent>
              <TabsContent value="code" className="min-h-0 flex-1 mt-0">
                <WorkspaceCode pages={draftPages ?? []} brand={draftBrand} onChange={({ pages, brand }) => { setDraftPages(pages); if (brand !== undefined) setDraftBrand(brand); }} />
              </TabsContent>
              <TabsContent value="sitemap" className="min-h-0 flex-1 mt-0">
                <WorkspaceSitemap siteName={activeSite.name} brand={draftBrand ?? undefined} pages={draftPages ?? []} onChange={(p) => setDraftPages(p)} />
              </TabsContent>
              <TabsContent value="analytics" className="min-h-0 flex-1 mt-0">
                <WorkspaceAnalytics siteId={activeSite.id} />
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </div>
  );
}


function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Plus className="h-6 w-6" /></div>
        <h2 className="text-xl font-semibold">Créer un nouveau projet</h2>
        <p className="mt-2 text-sm text-muted-foreground">Utilisez le chat à gauche pour décrire votre application. L'IA codera pour vous.</p>
        <Button className="mt-6" onClick={onCreate}><Plus className="mr-2 h-4 w-4" /> Nouveau projet</Button>
      </div>
    </div>
  );
}