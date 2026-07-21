import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { useEffect } from "react";
import { LogOut, ExternalLink, RefreshCw, Trash2, FileText, Pencil } from "lucide-react";

import { toast } from "sonner";
import { getAuthStatus, signOut } from "@/lib/auth.functions";
import { listSites, retrySite, deleteSite, syncCloudflareStatus } from "@/lib/sites.functions";

import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateSiteDialog } from "@/components/create-site-dialog";
import { SiteDetailDialog } from "@/components/site-detail-dialog";
import { SiteBuildProgress } from "@/components/site-build-progress";
import { BuildProgressDialog } from "@/components/build-progress-dialog";
import { EditSiteDialog } from "@/components/edit-site-dialog";


const sitesQueryOptions = queryOptions({
  queryKey: ["sites"],
  queryFn: () => listSites(),
  staleTime: 10_000,
});

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Espace privé" },
      { name: "description", content: "Votre espace privé." },
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



type PageContent = { slug: string; seo_title: string; html_content: string };
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
  site_data?: { pages?: PageContent[] } | null;
  random_seed?: { sitemap?: SitemapNode[] } | null;
};

function buildPreviewDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=1280"><script src="https://cdn.tailwindcss.com"></script><style>html,body{margin:0;padding:0;background:#fff;}</style></head><body>${html}</body></html>`;
}

function getIndexHtml(site: SiteRow): string | null {
  const pages = site.site_data?.pages;
  if (!pages || pages.length === 0) return null;
  const home = pages.find((p) => p.slug === "index") ?? pages[0];
  return home?.html_content ?? null;
}

const STATUS_LABEL: Record<SiteRow["status"], string> = {
  pending: "En attente",
  generating: "Génération",
  building: "Build",
  deploying: "Déploiement",
  deployed: "Déployé",
  failed: "Échec",
};

const STATUS_VARIANT: Record<SiteRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  generating: "secondary",
  building: "secondary",
  deploying: "secondary",
  deployed: "default",
  failed: "destructive",
};

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



function DashboardPage() {
  const { email, sites: initialSites } = Route.useLoaderData();
  const router = useRouter();
  const logout = useServerFn(signOut);
  const list = useServerFn(listSites);
  const retry = useServerFn(retrySite);
  const del = useServerFn(deleteSite);
  const syncCf = useServerFn(syncCloudflareStatus);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailSite, setDetailSite] = useState<SiteRow | null>(null);
  const [editSite, setEditSite] = useState<SiteRow | null>(null);
  const [launchedSiteId, setLaunchedSiteId] = useState<string | null>(null);




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

  const sites = (sitesQuery.data?.sites as SiteRow[] | undefined) ?? [];


  async function handleLogout() {
    await logout({});
    await router.navigate({ to: "/login" });
  }

  async function handleRetry(id: string) {
    try {
      await retry({ data: { id } });
      toast.success("Relance envoyée");
      sitesQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer ce site (Cloudflare + base) ?")) return;
    try {
      await del({ data: { id } });
      toast.success("Site supprimé");
      sitesQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Vérification Cloudflare en tâche de fond toutes les minutes pour chaque
  // site déjà déployé — met à jour statut / deploy_url en base et déclenche
  // un refetch de la liste.
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
          // silencieux : simple heartbeat
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



  const sidebarSites = sites.map((s) => ({ id: s.id, name: s.name, url: "/dashboard" }));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar sites={sidebarSites} onCreate={() => setDialogOpen(true)} email={email} />
        <SidebarInset>
          <header className="flex h-14 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <h1 className="text-sm font-medium text-foreground">Tableau de bord</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Se déconnecter
            </Button>
          </header>

          <main className="flex-1 p-6">
            <div className="mx-auto max-w-5xl">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">Vos sites</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sites Astro générés statiquement et déployés sur l'hébergement cible.
                  </p>
                </div>
                <Button onClick={() => setDialogOpen(true)}>Créer un site</Button>
              </div>

              {sitesQuery.isLoading ? (
                <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  Chargement…
                </div>
              ) : sites.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-12 text-center">
                  <p className="text-sm text-muted-foreground">Aucun site pour l'instant.</p>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {sites.map((site) => {
                    const clickable = site.status === "deployed";
                    return (
                    <li
                      key={site.id}
                      onClick={clickable ? () => setDetailSite(site) : undefined}
                      className={
                        "rounded-lg border border-border bg-card p-4 shadow-sm transition-colors " +
                        (clickable ? "cursor-pointer hover:bg-accent/40" : "")
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-card-foreground">{site.name}</p>
                          {site.deploy_url ? (
                            <a
                              href={site.deploy_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {site.domain}
                            </a>
                          ) : (
                            <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
                          )}
                        </div>
                        {site.status === "deployed" ? (
                          <StatusDot up={true} title="En ligne" />
                        ) : site.status === "failed" ? (
                          <StatusDot up={false} title="Hors ligne" />
                        ) : (
                          <Badge variant={STATUS_VARIANT[site.status]}>{STATUS_LABEL[site.status]}</Badge>
                        )}
                      </div>

                      {(() => {
                        const html = getIndexHtml(site);
                        if (!html || site.status !== "deployed") return null;
                        return (
                          <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted">
                            <div className="relative aspect-[16/10] w-full">
                              <iframe
                                srcDoc={buildPreviewDoc(html)}
                                title={`Aperçu ${site.name}`}
                                loading="lazy"
                                sandbox="allow-scripts"
                                className="pointer-events-none absolute left-0 top-0 origin-top-left"
                                style={{
                                  width: "1280px",
                                  height: "800px",
                                  transform: "scale(0.28)",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {site.last_error && (
                        <p className="mt-2 line-clamp-2 text-xs text-destructive">{site.last_error}</p>
                      )}

                      {["pending", "generating", "building", "deploying", "failed"].includes(
                        site.status,
                      ) && (
                        <SiteBuildProgress
                          siteId={site.id}
                          active={site.status !== "failed"}
                        />
                      )}

                      <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                        {site.deploy_url && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={site.deploy_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ouvrir
                            </a>
                          </Button>
                        )}
                        {site.build_log_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={site.build_log_url} target="_blank" rel="noreferrer">
                              <FileText className="mr-1.5 h-3.5 w-3.5" /> Logs
                            </a>
                          </Button>
                        )}
                        {site.status === "deployed" && (
                          <Button size="sm" variant="ghost" onClick={() => setEditSite(site)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifier
                          </Button>
                        )}
                        {site.status !== "deployed" && (
                          <Button size="sm" variant="ghost" onClick={() => handleRetry(site.id)}>
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Relancer
                          </Button>
                        )}



                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(site.id)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                    );
                  })}

                </ul>
              )}
            </div>
          </main>
        </SidebarInset>

        <CreateSiteDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onLaunched={(id) => setLaunchedSiteId(id)}
        />
        <BuildProgressDialog
          siteId={launchedSiteId}
          open={!!launchedSiteId}
          onOpenChange={(v) => !v && setLaunchedSiteId(null)}
        />
        <SiteDetailDialog
          site={detailSite}
          open={!!detailSite}
          onOpenChange={(v) => !v && setDetailSite(null)}
        />


      </div>
    </SidebarProvider>
  );
}
