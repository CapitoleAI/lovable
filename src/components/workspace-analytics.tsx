import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Activity, Clock, Rocket, TrendingUp } from "lucide-react";
import { getCloudflareAnalytics } from "@/lib/orchestrator.functions";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  siteId: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} Go`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} Mo`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} Ko`;
  return `${n} o`;
}

export function WorkspaceAnalytics({ siteId }: Props) {
  const get = useServerFn(getCloudflareAnalytics);
  const q = useQuery({
    queryKey: ["cf-analytics", siteId],
    queryFn: () => get({ data: { id: siteId } }),
    staleTime: 60_000,
  });

  const data = q.data;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-semibold">Analytics Cloudflare</h2>
            <p className="text-sm text-muted-foreground">
              Métriques et déploiements du projet Cloudflare Pages.
            </p>
          </div>
          {q.isFetching && <span className="text-xs text-muted-foreground">Rafraîchissement…</span>}
        </div>

        {q.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : q.isError ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{(q.error as Error).message}</span>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                icon={<Activity className="h-4 w-4" />}
                label="Requêtes 24h"
                value={fmt(data.requests_24h)}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Requêtes 7j"
                value={fmt(data.requests_7d)}
              />
              <StatCard
                icon={<Rocket className="h-4 w-4" />}
                label="Déploiements"
                value={`${data.deployments_success}/${data.deployments_count}`}
                hint="réussis / total"
              />
              <StatCard
                icon={<Clock className="h-4 w-4" />}
                label="Dernier déploiement"
                value={
                  data.last_deployed_at
                    ? new Date(data.last_deployed_at).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"
                }
              />
            </div>

            {data.error && (
              <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="font-medium">Information</p>
                <p className="mt-1 text-xs">{data.error}</p>
              </div>
            )}

            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              <p>
                Bande passante 7j : <span className="font-medium text-foreground">{fmtBytes(data.bandwidth_bytes_7d)}</span>
              </p>
              <p className="mt-2 text-xs">
                Le détail par page nécessite l'activation de Cloudflare Web Analytics avec un tag RUM injecté.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
