import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LogOut, ExternalLink, RefreshCw, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { getAuthStatus, signOut } from "@/lib/auth.functions";
import { listSites, retrySite, deleteSite } from "@/lib/sites.functions";
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
  loader: ({ context }) => ({
    email: (context as { email: string | null }).email,
  }),
  component: DashboardPage,
});

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
};

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

function DashboardPage() {
  const { email } = Route.useLoaderData();
  const router = useRouter();
  const logout = useServerFn(signOut);
  const list = useServerFn(listSites);
  const retry = useServerFn(retrySite);
  const del = useServerFn(deleteSite);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailSite, setDetailSite] = useState<SiteRow | null>(null);


  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: () => list(),
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
    if (!window.confirm("Supprimer ce site ?")) return;
    try {
      await del({ data: { id } });
      toast.success("Site supprimé");
      sitesQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

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
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-card-foreground">{site.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{site.domain}</p>
                        </div>
                        <Badge variant={STATUS_VARIANT[site.status]}>{STATUS_LABEL[site.status]}</Badge>
                      </div>

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

        <CreateSiteDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        <SiteDetailDialog
          site={detailSite}
          open={!!detailSite}
          onOpenChange={(v) => !v && setDetailSite(null)}
        />

      </div>
    </SidebarProvider>
  );
}
