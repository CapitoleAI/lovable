import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getAuthStatus, signOut } from "@/lib/auth.functions";

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
  loader: ({ context }) => ({ email: (context as { email: string | null }).email }),
  component: DashboardPage,
});

function DashboardPage() {
  const { email } = Route.useLoaderData();
  const router = useRouter();
  const logout = useServerFn(signOut);

  async function handleLogout() {
    await logout({});
    await router.navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Bienvenue 👋
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vous êtes connecté{email ? ` en tant que ${email}` : ""}.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
