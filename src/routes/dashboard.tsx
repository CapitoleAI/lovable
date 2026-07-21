import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { getAuthStatus, signOut } from "@/lib/auth.functions";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { Button } from "@/components/ui/button";

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
    if (!status.authenticated) {
      throw redirect({ to: "/login" });
    }
    return { email: status.email };
  },
  loader: ({ context }) => ({
    email: (context as { email: string | null }).email,
  }),
  component: DashboardPage,
});

type Site = { id: string; name: string; url: string };

function DashboardPage() {
  const { email } = Route.useLoaderData();
  const router = useRouter();
  const logout = useServerFn(signOut);
  const [sites, setSites] = useState<Site[]>([]);

  async function handleLogout() {
    await logout({});
    await router.navigate({ to: "/login" });
  }

  function handleCreate() {
    const name = window.prompt("Nom du site ?");
    if (!name) return;
    const id = crypto.randomUUID();
    setSites((prev) => [...prev, { id, name, url: `/dashboard` }]);
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar sites={sites} onCreate={handleCreate} email={email} />
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
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Vos sites
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Retrouvez ici tous vos sites. Cliquez sur « Créer » pour en ajouter un.
                </p>
              </div>

              {sites.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Aucun site pour l'instant.
                  </p>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sites.map((site) => (
                    <li
                      key={site.id}
                      className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent"
                    >
                      <p className="text-sm font-medium text-card-foreground">
                        {site.name}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
