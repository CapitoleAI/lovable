import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Circle, XCircle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getSiteBuildProgress } from "@/lib/github-runs.functions";
import { listSites } from "@/lib/sites.functions";

type SiteRow = {
  id: string;
  status: "pending" | "generating" | "building" | "deploying" | "deployed" | "failed";
  deploy_url: string | null;
  last_error: string | null;
};

const STAGES = [
  { key: "generating", label: "Génération IA des textes & HTML" },
  { key: "building", label: "Envoi & compilation Astro sur GitHub" },
  { key: "deploying", label: "Déploiement sur Cloudflare Pages" },
  { key: "deployed", label: "Site en ligne" },
] as const;

function stageState(
  siteStatus: SiteRow["status"] | null,
  key: (typeof STAGES)[number]["key"],
) {
  const order = ["pending", "generating", "building", "deploying", "deployed"];
  if (siteStatus === "failed") {
    if (key === "generating") return "failed" as const;
    return "pending" as const;
  }
  if (!siteStatus) return "pending" as const;
  const cur = order.indexOf(siteStatus);
  const target = order.indexOf(key);
  if (cur > target) return "done" as const;
  if (cur === target) return "active" as const;
  return "pending" as const;
}

function StageIcon({ state }: { state: "done" | "active" | "pending" | "failed" }) {
  if (state === "done") return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (state === "active") return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  if (state === "failed") return <XCircle className="h-5 w-5 text-destructive" />;
  return <Circle className="h-5 w-5 text-muted-foreground/50" />;
}

interface Props {
  siteId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function BuildProgressDialog({ siteId, open, onOpenChange }: Props) {
  const listFn = useServerFn(listSites);
  const progressFn = useServerFn(getSiteBuildProgress);

  const sitesQ = useQuery({
    queryKey: ["sites"],
    queryFn: () => listFn(),
    refetchInterval: open ? 4000 : false,
    enabled: open,
  });
  const site = ((sitesQ.data?.sites as SiteRow[] | undefined) ?? []).find(
    (s) => s.id === siteId,
  );

  const progressQ = useQuery({
    queryKey: ["build-progress", siteId],
    queryFn: () => progressFn({ data: { id: siteId! } }),
    refetchInterval: open ? 4000 : false,
    enabled: open && !!siteId,
    retry: false,
  });

  // Si le run GitHub est terminé avec succès OU si Cloudflare a un déploiement
  // en ligne, on considère le site comme déployé — même si la ligne DB n'a pas
  // encore été réconciliée par le callback.
  const rawStatus = site?.status ?? null;
  const runOk =
    progressQ.data?.run?.status === "completed" &&
    progressQ.data?.run?.conclusion === "success";
  const runFailed =
    progressQ.data?.run?.status === "completed" &&
    progressQ.data?.run?.conclusion !== null &&
    progressQ.data?.run?.conclusion !== "success";
  const status: SiteRow["status"] | null =
    site?.deploy_url || runOk ? "deployed" : runFailed ? "failed" : rawStatus;
  const finished = status === "deployed" || status === "failed";


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Création de votre site en cours</DialogTitle>
          <DialogDescription>
            Suivi en direct des étapes de génération et déploiement.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 py-2">
          {STAGES.map((s) => {
            const st = stageState(status, s.key);
            return (
              <li
                key={s.key}
                className={
                  "flex items-center gap-3 rounded-md border p-3 transition-colors " +
                  (st === "active"
                    ? "border-primary bg-primary/5"
                    : st === "done"
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : st === "failed"
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border")
                }
              >
                <StageIcon state={st} />
                <span
                  className={
                    "text-sm " +
                    (st === "pending"
                      ? "text-muted-foreground"
                      : "text-foreground")
                  }
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {status === "failed" && site?.last_error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {site.last_error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {progressQ.data?.run?.html_url && (
            <a
              href={progressQ.data.run.html_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Voir le build GitHub <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="ml-auto flex gap-2">
            {finished && site?.deploy_url && (
              <Button asChild size="sm" variant="default">
                <a href={site.deploy_url} target="_blank" rel="noreferrer">
                  Ouvrir le site <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant={finished ? "outline" : "ghost"}
              onClick={() => onOpenChange(false)}
            >
              {finished ? "Fermer" : "Suivre en arrière-plan"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
