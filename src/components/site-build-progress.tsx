import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Circle, XCircle, ExternalLink } from "lucide-react";
import { getSiteBuildProgress } from "@/lib/github-runs.functions";

type Props = {
  siteId: string;
  active: boolean;
};

function StepIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === "completed") {
    if (conclusion === "success")
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (conclusion === "skipped")
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />;
    return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
  if (status === "in_progress" || status === "queued")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />;
}

export function SiteBuildProgress({ siteId, active }: Props) {
  const fn = useServerFn(getSiteBuildProgress);
  const query = useQuery({
    queryKey: ["build-progress", siteId],
    queryFn: () => fn({ data: { id: siteId } }),
    refetchInterval: active ? 4000 : false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Récupération du build…
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Build GitHub introuvable pour le moment.
      </div>
    );
  }

  const data = query.data;
  if (!data?.run) {
    return (
      <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        En attente du démarrage du workflow…
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">Workflow GitHub</span>
        <a
          href={data.run.html_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Voir <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {data.jobs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Workflow en file d'attente…</p>
      ) : (
        <ul className="space-y-2">
          {data.jobs.map((job) => (
            <li key={job.id}>
              <div className="mb-1 flex items-center gap-2 text-xs font-medium">
                <StepIcon status={job.status} conclusion={job.conclusion} />
                <span className="truncate">{job.name}</span>
              </div>
              <ul className="ml-5 space-y-0.5 border-l border-border pl-3">
                {job.steps
                  .filter((s) => !/^(Set up job|Complete job|Post )/i.test(s.name))
                  .map((s) => (
                    <li
                      key={s.number}
                      className="flex items-center gap-2 text-[11px] text-muted-foreground"
                    >
                      <StepIcon status={s.status} conclusion={s.conclusion} />
                      <span className="truncate">{s.name}</span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
