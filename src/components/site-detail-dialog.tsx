import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Wrench,
  Info,
  Mail,
  Newspaper,
  FileText as ArticleIcon,
  ExternalLink,
  TrendingUp,
  Search,
  Activity,
  Globe,
  Calendar,
} from "lucide-react";
import type { ComponentType } from "react";

type Site = {
  id: string;
  name: string;
  domain: string;
  deploy_url: string | null;
  created_at: string;
};

interface SiteDetailDialogProps {
  site: Site | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type SitemapNode = {
  id: string;
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  x: number;
  y: number;
  accent?: boolean;
};

// Coordinates in a 760 × 440 viewBox. Card size 168 × 64, anchored top-left.
const CARD_W = 168;
const CARD_H = 64;

const NODES: SitemapNode[] = [
  { id: "home", label: "Accueil", path: "/", icon: Home, x: 296, y: 24, accent: true },
  { id: "services", label: "Services", path: "/services", icon: Wrench, x: 24, y: 188 },
  { id: "about", label: "À propos", path: "/a-propos", icon: Info, x: 208, y: 188 },
  { id: "contact", label: "Contact", path: "/contact", icon: Mail, x: 392, y: 188 },
  { id: "blog", label: "Blog", path: "/blog", icon: Newspaper, x: 576, y: 188 },
  { id: "article", label: "Article", path: "/blog/:slug", icon: ArticleIcon, x: 576, y: 348 },
];

const EDGES: Array<[string, string]> = [
  ["home", "services"],
  ["home", "about"],
  ["home", "contact"],
  ["home", "blog"],
  ["blog", "article"],
];

function Sitemap() {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const cx = (n: SitemapNode) => n.x + CARD_W / 2;
  const topY = (n: SitemapNode) => n.y;
  const bottomY = (n: SitemapNode) => n.y + CARD_H;

  return (
    <div className="overflow-x-auto">
      <div className="relative mx-auto" style={{ width: 760, height: 440 }}>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 760 440"
          fill="none"
          aria-hidden
        >
          <defs>
            <marker
              id="sitemap-dot"
              markerWidth="6"
              markerHeight="6"
              refX="3"
              refY="3"
              orient="auto"
            >
              <circle cx="3" cy="3" r="2.5" className="fill-primary" />
            </marker>
          </defs>
          {EDGES.map(([from, to]) => {
            const a = byId[from];
            const b = byId[to];
            const x1 = cx(a);
            const y1 = bottomY(a);
            const x2 = cx(b);
            const y2 = topY(b);
            const midY = (y1 + y2) / 2;
            const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
            return (
              <path
                key={`${from}-${to}`}
                d={d}
                className="stroke-border"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                markerEnd="url(#sitemap-dot)"
              />
            );
          })}
        </svg>

        {NODES.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.id}
              className={
                "absolute flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
                (n.accent
                  ? "border-primary/40 ring-1 ring-primary/20"
                  : "border-border")
              }
              style={{ left: n.x, top: n.y, width: CARD_W, height: CARD_H }}
            >
              <div
                className={
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg " +
                  (n.accent
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground")
                }
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-tight">
                  {n.label}
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {n.path}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function SiteDetailDialog({ site, open, onOpenChange }: SiteDetailDialogProps) {
  if (!site) return null;
  const created = new Date(site.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl">{site.name}</DialogTitle>
            <Badge variant="default">Actif</Badge>
          </div>
          <DialogDescription>{site.domain}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="analyse" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="analyse">Analyse</TabsTrigger>
            <TabsTrigger value="architecture">Architecture</TabsTrigger>
          </TabsList>

          <TabsContent value="analyse" className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                icon={TrendingUp}
                label="Trafic"
                value="—"
                hint="Visites mensuelles"
              />
              <StatCard
                icon={Search}
                label="Mots-clés"
                value="—"
                hint="Positionnés en top 100"
              />
              <StatCard
                icon={Activity}
                label="Santé SEO"
                value="—"
                hint="Score global"
              />
            </div>
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Les données d'analyse seront disponibles ici prochainement.
            </div>
          </TabsContent>

          <TabsContent value="architecture" className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  URL de déploiement
                </div>
                {site.deploy_url ? (
                  <a
                    href={site.deploy_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 truncate text-sm font-medium text-primary hover:underline"
                  >
                    {site.deploy_url}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">Non disponible</div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Créé le
                </div>
                <div className="mt-2 text-sm font-medium">{created}</div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sitemap
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Maillage interne · données de démonstration
                </span>
              </div>
              <div className="p-4">
                <Sitemap />
              </div>
            </div>

          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
