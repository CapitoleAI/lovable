import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  BarChart3,
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  Globe,
  LayoutDashboard,
  Loader2,
  LogOut,
  Monitor,
  Network,
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
import type { OrchestratorAction } from "@/lib/orchestrator.functions";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";

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
import {
  CreationWizard,
  type CreationSnapshot,
  type CreationWizardHandle,
} from "@/components/creation-wizard";
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
  const [creationSnapshot, setCreationSnapshot] = useState<CreationSnapshot | null>(null);
  const wizardRef = useRef<CreationWizardHandle | null>(null);

  // Local draft state per active site
  const [draftPages, setDraftPages] = useState<PageContent[] | null>(null);
  const [draftBrand, setDraftBrand] = useState<Partial<BrandIdentity> | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Workspace UI state (lifted from tabs/preview)
  const [tab, setTab] = useState<"preview" | "code" | "sitemap" | "analytics">("preview");
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewSlug, setPreviewSlug] = useState<string>("index");
  const [previewNonce, setPreviewNonce] = useState(0);


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

  // When active site changes, reset drafts from server state
  useEffect(() => {
    if (activeSite) {
      const pages = activeSite.site_data?.pages ?? null;
      setDraftPages(pages);
      setPreviewSlug(pages?.[0]?.slug ?? "index");
      setTab("preview");
      // brand is only stored partially in site_info; keep colors + logo
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

  // Auto-select first site on first load if none selected AND not creating
  useEffect(() => {
    if (!activeId && mode !== "create" && sites.length > 0) {
      const firstDeployed = sites.find((s) => s.status === "deployed") ?? sites[0];
      setActiveId(firstDeployed.id);
      setMode("edit");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.length]);

  // Keep mode in sync with active site
  useEffect(() => {
    if (mode === "create") return;
    setMode(activeId ? "edit" : "empty");
  }, [activeId, mode]);

  function openCreate() {
    setActiveId(null);
    setMode("create");
    setCreationSnapshot(null);
  }

  function exitCreate() {
    setMode(sites.length > 0 ? "edit" : "empty");
    if (sites.length > 0 && !activeId) {
      setActiveId(sites[0].id);
    }
    setCreationSnapshot(null);
  }


  // Background Cloudflare sync every 60s for deployed/failed sites
  useEffect(() => {
    const ids = sites
      .filter((s) => s.status === "deployed" || s.status === "failed")
      .map((s) => s.id);
    if (ids.length === 0) return;
    let cancelled = false;
    async function tick() {
      for (const id of ids) {
        try {
          await syncCf({ data: { id } });
        } catch {
          /* silent */
        }
      }
      if (!cancelled) sitesQuery.refetch();
    }
    const t = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.map((s) => s.id).join(","), sites.map((s) => s.status).join(",")]);

  // While the active site is building, reconcile its status against GitHub every 5s
  // (getSiteBuildProgress updates the DB to "deployed"/"failed" when the run completes).
  useEffect(() => {
    if (!activeSite) return;
    const inProgress = ["pending", "generating", "building", "deploying"].includes(
      activeSite.status,
    );
    if (!inProgress) return;
    let cancelled = false;
    async function tick() {
      try {
        await buildProgress({ data: { id: activeSite!.id } });
      } catch {
        /* silent */
      }
      if (!cancelled) sitesQuery.refetch();
    }
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handlePublish() {
    if (!activeSite || !draftPages) return;
    setPublishing(true);
    try {
      const brandForSave = draftBrand
        ? ({
            brand_name: draftBrand.brand_name ?? activeSite.name,
            tagline: draftBrand.tagline ?? "",
            story: draftBrand.story ?? "",
            colors: draftBrand.colors ?? {
              primary: "#0f172a",
              secondary: "#334155",
              accent: "#38bdf8",
              neutral: "#e2e8f0",
              background: "#ffffff",
            },
            logo_url: draftBrand.logo_url ?? "",
            moodboard_url: "",
            design_style: draftBrand.design_style ?? "minimaliste",
            header_style: draftBrand.header_style ?? "classique",
            footer_style: draftBrand.footer_style ?? "simple",
            sections: draftBrand.sections ?? [],
            selected_header_id: "",
            selected_hero_id: "",
            selected_section_ids: [],
            selected_footer_id: "",
            component_overrides: {},
            home_html: "",
          } as BrandIdentity)
        : undefined;
      const res = await save({
        data: { id: activeSite.id, pages: draftPages, brand: brandForSave },
      });
      if (!res.ok) throw new Error(res.error ?? "Échec de la publication");
      toast.success("Publication lancée");
      sitesQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  // ---------- Chat action handler ----------
  async function handleAction(action: OrchestratorAction) {

    // Create-mode actions target the wizard imperatively
    if (action.type === "advance_to_brand_studio") {
      await wizardRef.current?.advanceToBrandStudio({
        name: action.name,
        theme: action.theme,
        city: action.city,
        brief: action.brief,
        hint_colors: action.hint_colors,
      });
      return;
    }
    if (action.type === "update_creation_brief") {
      wizardRef.current?.updateBrief({
        name: action.name,
        theme: action.theme,
        city: action.city,
        brief: action.brief,
        hint_colors: action.hint_colors,
      });
      return;
    }
    if (action.type === "update_creation_theme") {
      wizardRef.current?.updateTheme({
        ...(action.brand_name ? { brand_name: action.brand_name } : {}),
        ...(action.tagline ? { tagline: action.tagline } : {}),
        ...(action.design_style ? { design_style: action.design_style as BrandIdentity["design_style"] } : {}),
        ...(action.selected_header_id ? { selected_header_id: action.selected_header_id } : {}),
        ...(action.selected_hero_id ? { selected_hero_id: action.selected_hero_id } : {}),
        ...(action.selected_footer_id ? { selected_footer_id: action.selected_footer_id } : {}),
        ...(action.selected_section_ids ? { selected_section_ids: action.selected_section_ids } : {}),
        ...(action.colors ? { colors: action.colors as BrandIdentity["colors"] } : {}),
      });
      return;
    }
    if (action.type === "generate_seo_and_tree") {
      await wizardRef.current?.generateSeoAndTree({
        main_keyword: action.main_keyword,
        keywords: action.keywords,
        sitemap: action.sitemap,
      });
      return;
    }
    if (action.type === "regenerate_logo") {
      await wizardRef.current?.regenerateLogo(action.prompt);
      return;
    }
    if (action.type === "finalize_and_build") {
      await wizardRef.current?.finalizeAndBuild();
      return;
    }


    if (!activeSite || !draftPages) return;


    if (action.type === "update_colors") {
      setDraftBrand((prev) => {
        const base = prev ?? { brand_name: activeSite.name };
        const cur = (base.colors ?? {
          primary: "#0f172a",
          secondary: "#334155",
          accent: "#38bdf8",
          neutral: "#e2e8f0",
          background: "#ffffff",
        }) as BrandIdentity["colors"];
        return {
          ...base,
          colors: { ...cur, ...(action.colors as Partial<BrandIdentity["colors"]>) },
        };
      });
      toast.success("Palette mise à jour");
      return;
    }

    if (action.type === "update_page_content") {
      const page = draftPages.find((p) => p.slug === action.slug);
      if (!page) {
        toast.error(`Page "${action.slug}" introuvable`);
        return;
      }
      toast.info(`Régénération de « ${page.seo_title.split("—")[0].trim() || page.slug} »…`);
      try {
        const res = await regen({
          data: {
            instruction: action.instruction,
            current_html: page.html_content,
            page_title: page.seo_title,
            slug: page.slug,
            brand: draftBrand ?? undefined,
          },
        });
        setDraftPages((prev) =>
          (prev ?? []).map((p) =>
            p.slug === action.slug
              ? { ...p, html_content: res.html_content, seo_title: action.seo_title ?? res.seo_title }
              : p,
          ),
        );
        toast.success("Page mise à jour");
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }

    if (action.type === "add_page") {
      const slug = action.slug ? slugify(action.slug) : slugify(action.title);
      if (!slug || draftPages.some((p) => p.slug === slug)) {
        toast.error("Slug invalide ou déjà utilisé");
        return;
      }
      toast.info(`Création de « ${action.title} »…`);
      try {
        const page = await genPage({
          data: {
            title: action.title,
            slug,
            instruction: action.instruction ?? "",
            brand: draftBrand ?? undefined,
            site_context: {
              name: activeSite.name,
              pages: draftPages.map((p) => ({ slug: p.slug, seo_title: p.seo_title })),
            },
          },
        });
        setDraftPages((prev) => [...(prev ?? []), page]);
        toast.success("Page ajoutée");
      } catch (e) {
        toast.error((e as Error).message);
      }
      return;
    }

    if (action.type === "remove_page") {
      if (action.slug === "index") {
        toast.error("Impossible de supprimer la page d'accueil");
        return;
      }
      setDraftPages((prev) => (prev ?? []).filter((p) => p.slug !== action.slug));
      toast.success("Page supprimée");
      return;
    }
  }

  // Compute background color for preview from draft brand
  const previewBg = draftBrand?.colors?.background;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* ================ TOP APP BAR ================ */}
      <header className="flex h-14 shrink-0 items-stretch border-b border-zinc-800 bg-zinc-900">
        <div className="flex w-80 shrink-0 items-center gap-3 border-r border-zinc-800 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-zinc-800"
              title="Menu"
            >
              <img src={logoAsset.url} alt="CapitoleAI" className="h-7 w-7 object-contain" />
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px]">
            <DropdownMenuItem
              onClick={() => {
                setActiveId(null);
                setMode("empty");
              }}
            >
              <LayoutDashboard className="mr-2 h-3.5 w-3.5" /> Dashboard
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Vos sites</DropdownMenuLabel>
            {sites.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Aucun site pour l'instant.
              </div>
            )}
            {sites.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => {
                  setActiveId(s.id);
                  setMode("edit");
                }}
                className="flex items-center gap-2"
              >
                {s.id === activeId ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="w-3.5" />
                )}
                <span className="flex-1 truncate">{s.name}</span>
                <span
                  className={
                    "text-[10px] " +
                    (s.status === "deployed"
                      ? "text-emerald-600"
                      : s.status === "failed"
                        ? "text-red-600"
                        : "text-muted-foreground")
                  }
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openCreate}>
              <Plus className="mr-2 h-3.5 w-3.5" /> Nouveau site
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-3.5 w-3.5" /> Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeSite ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{activeSite.name}</span>
            {activeSite.status === "deployed" ? (
              <StatusDot up title="En ligne" />
            ) : activeSite.status === "failed" ? (
              <StatusDot up={false} title="Hors ligne" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {STATUS_LABEL[activeSite.status]}
            </span>
          </div>
        ) : (
          <span className="text-sm text-zinc-400">
            {mode === "create" ? "Nouveau site" : "Dashboard"}
          </span>
        )}

        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        {activeSite && mode === "edit" && (
          <div className="flex flex-1 items-center gap-2">
            <div className="flex items-center rounded-full bg-slate-100 p-0.5">
              {[
                { value: "preview" as const, label: "Aperçu", icon: Globe },
                { value: "code" as const, label: "Code", icon: FileCode2 },
                { value: "sitemap" as const, label: "Arborescence", icon: Network },
                { value: "analytics" as const, label: "Analytics", icon: BarChart3 },
              ].map((t) => {
                const active = tab === t.value;
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    title={t.label}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {active && <span>{t.label}</span>}
                  </button>
                );
              })}
            </div>

            {tab === "preview" && (draftPages ?? []).length > 0 && (
              <div className="mx-auto flex items-center gap-2">
                <div className="flex items-center rounded-full bg-slate-100 p-0.5">
                  {([
                    { d: "desktop" as const, Icon: Monitor, label: "Bureau" },
                    { d: "tablet" as const, Icon: Tablet, label: "Tablette" },
                    { d: "mobile" as const, Icon: Smartphone, label: "Mobile" },
                  ]).map(({ d, Icon, label }) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDevice(d)}
                      title={label}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                        device === d
                          ? "bg-white text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-1">
                  <button
                    type="button"
                    onClick={() => setPreviewNonce((n) => n + 1)}
                    title="Rafraîchir"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-white hover:text-foreground"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs hover:bg-white"
                      >
                        <span>{previewSlug === "index" ? "/" : `/${previewSlug}`}</span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="min-w-[220px]">
                      <DropdownMenuLabel>Pages</DropdownMenuLabel>
                      {(draftPages ?? []).map((p) => (
                        <DropdownMenuItem
                          key={p.slug}
                          onClick={() => setPreviewSlug(p.slug)}
                          className="flex items-center gap-2"
                        >
                          {p.slug === previewSlug ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <span className="w-3.5" />
                          )}
                          <span className="font-mono text-xs">
                            {p.slug === "index" ? "/" : `/${p.slug}`}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {activeSite.deploy_url && (
                    <a
                      href={
                        previewSlug === "index"
                          ? activeSite.deploy_url
                          : `${activeSite.deploy_url.replace(/\/$/, "")}/${previewSlug}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      title="Ouvrir dans un nouvel onglet"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-white hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {activeSite && (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm">
                  <Upload className="mr-1.5 h-4 w-4" />
                  Publier
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-4">
                <div className="mb-3">
                  <p className="text-sm font-semibold">Publier</p>
                  <p className="text-xs text-muted-foreground">
                    {isDirty
                      ? "Modifications non publiées."
                      : "Aucune modification en attente."}
                  </p>
                </div>
                {activeSite.deploy_url && (
                  <div className="mb-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      URL du site
                    </p>
                    <div className="mt-1 flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                      <span className="flex-1 truncate text-xs">
                        {activeSite.deploy_url.replace(/^https?:\/\//, "")}
                      </span>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-accent"
                        title="Copier"
                        onClick={() => {
                          navigator.clipboard.writeText(activeSite.deploy_url!);
                          toast.success("URL copiée");
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  {activeSite.deploy_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      asChild
                    >
                      <a href={activeSite.deploy_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        Ouvrir le site
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-destructive hover:text-destructive"
                    onClick={() => handleDelete(activeSite.id)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Supprimer le site
                  </Button>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={handlePublish}
                    disabled={!isDirty || publishing}
                  >
                    {publishing ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-1.5 h-4 w-4" />
                    )}
                    Publier les modifications
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        </div>
      </header>


      {/* ================ SPLIT BODY ================ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* LEFT: Chat */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-white">
          <div className="min-h-0 flex-1">
            <WorkspaceChat
              mode={mode}
              siteName={activeSite?.name}
              brand={draftBrand ?? undefined}
              pages={draftPages ?? undefined}
              creationContext={mode === "create" ? creationSnapshot ?? undefined : undefined}
              onAction={handleAction}
              onCreateWizard={openCreate}
            />
          </div>
        </aside>

        {/* RIGHT: Workspace */}
        <main className="flex min-w-0 flex-1 flex-col bg-muted/30">
          {mode === "create" ? (
            <CreationWizard
              ref={wizardRef}
              onSnapshotChange={setCreationSnapshot}
              onExit={exitCreate}
              onFinalized={(id) => {
                setActiveId(id);
                setMode("edit");
                setCreationSnapshot(null);
                sitesQuery.refetch();
              }}
            />
          ) : !activeSite ? (
            <EmptyWorkspace onCreate={openCreate} />
          ) : ["pending", "generating", "building", "deploying"].includes(activeSite.status) &&
            !draftPages?.length ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
                <p className="mb-3 text-sm font-medium">Build en cours</p>
                <SiteBuildProgress siteId={activeSite.id} active />
              </div>
            </div>
          ) : (
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as typeof tab)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <TabsContent
                value="preview"
                className="min-h-0 flex-1 mt-0"
                style={previewBg ? { backgroundColor: previewBg } : undefined}
              >
                <WorkspacePreview
                  pages={draftPages ?? []}
                  brand={draftBrand ?? undefined}
                  activeSlug={previewSlug}
                  device={device}
                  nonce={previewNonce}
                />
              </TabsContent>

              <TabsContent value="code" className="min-h-0 flex-1 mt-0">
                <WorkspaceCode
                  pages={draftPages ?? []}
                  brand={draftBrand}
                  onChange={({ pages, brand }) => {
                    setDraftPages(pages);
                    if (brand !== undefined) setDraftBrand(brand);
                  }}
                />
              </TabsContent>

              <TabsContent value="sitemap" className="min-h-0 flex-1 mt-0">
                <WorkspaceSitemap
                  siteName={activeSite.name}
                  brand={draftBrand ?? undefined}
                  pages={draftPages ?? []}
                  onChange={(p) => setDraftPages(p)}
                />
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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold">Créer votre premier site</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Utilisez le chat à gauche ou lancez l'assistant de création guidé.
        </p>
        <Button className="mt-6" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nouveau site
        </Button>
      </div>
    </div>
  );
}
