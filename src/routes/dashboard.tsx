import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import logoAsset from "@/assets/capitoleai-logo.png.asset.json";
import { getAuthStatus, signOut } from "@/lib/auth.functions";
import {
  listSites,
  updateSite,
  deleteSite,
  syncCloudflareStatus,
} from "@/lib/sites.functions";
import { regeneratePageContent, generateNewPage } from "@/lib/orchestrator.functions";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CreationWizard,
  type CreationSnapshot,
  type CreationWizardHandle,
} from "@/components/creation-wizard";
import { WorkspaceChat } from "@/components/workspace-chat";
import { WorkspacePreview } from "@/components/workspace-preview";
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

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [launchedSiteId, setLaunchedSiteId] = useState<string | null>(null);

  // Local draft state per active site
  const [draftPages, setDraftPages] = useState<PageContent[] | null>(null);
  const [draftBrand, setDraftBrand] = useState<Partial<BrandIdentity> | null>(null);
  const [publishing, setPublishing] = useState(false);

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
      setDraftPages(activeSite.site_data?.pages ?? null);
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

  // Auto-select first site on first load if none selected
  useEffect(() => {
    if (!activeId && sites.length > 0) {
      const firstDeployed = sites.find((s) => s.status === "deployed") ?? sites[0];
      setActiveId(firstDeployed.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.length]);

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
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* ================ LEFT: Chat ================ */}
      <aside className="flex w-96 shrink-0 flex-col border-r border-border bg-white">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <img src={logoAsset.url} alt="CapitoleAI" className="h-7" />
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <WorkspaceChat
            mode={activeSite ? "edit" : "empty"}
            siteName={activeSite?.name}
            brand={draftBrand ?? undefined}
            pages={draftPages ?? undefined}
            onAction={handleAction}
            onCreateWizard={() => setDialogOpen(true)}
          />
        </div>
      </aside>

      {/* ================ RIGHT: Workspace ================ */}
      <main className="flex min-w-0 flex-1 flex-col bg-muted/30">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 font-medium">
                {activeSite ? activeSite.name : "Aucun site sélectionné"}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[240px]">
              <DropdownMenuLabel>Vos sites</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sites.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  Aucun site pour l'instant.
                </div>
              )}
              {sites.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
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
              <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" /> Nouveau site
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {activeSite && (
            <div className="flex items-center gap-2">
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
          )}

          <div className="ml-auto flex items-center gap-2">
            {activeSite?.deploy_url && (
              <Button size="sm" variant="ghost" asChild>
                <a href={activeSite.deploy_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Ouvrir
                </a>
              </Button>
            )}
            {activeSite && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(activeSite.id)}
                title="Supprimer le site"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={!activeSite || !isDirty || publishing}
            >
              {publishing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Publier
            </Button>
          </div>
        </header>

        {/* Body */}
        {!activeSite ? (
          <EmptyWorkspace onCreate={() => setDialogOpen(true)} />
        ) : ["pending", "generating", "building", "deploying"].includes(activeSite.status) &&
          !draftPages?.length ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
              <p className="mb-3 text-sm font-medium">Build en cours</p>
              <SiteBuildProgress siteId={activeSite.id} active />
            </div>
          </div>
        ) : (
          <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border bg-white px-4">
              <TabsList className="h-10 bg-transparent p-0">
                <TabsTrigger
                  value="preview"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-10"
                >
                  Live Preview
                </TabsTrigger>
                <TabsTrigger
                  value="sitemap"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-10"
                >
                  Arborescence
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none h-10"
                >
                  Analytics
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="preview" className="min-h-0 flex-1 mt-0" style={previewBg ? { backgroundColor: previewBg } : undefined}>
              <WorkspacePreview pages={draftPages ?? []} brand={draftBrand ?? undefined} />
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

      <CreateSiteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onLaunched={(id) => {
          setLaunchedSiteId(id);
          setActiveId(id);
          sitesQuery.refetch();
        }}
      />
      <BuildProgressDialog
        siteId={launchedSiteId}
        open={!!launchedSiteId}
        onOpenChange={(v) => !v && setLaunchedSiteId(null)}
      />
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
