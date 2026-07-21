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
  FileText,
  ExternalLink,
  TrendingUp,
  Search,
  Activity,
  Globe,
  Calendar,
} from "lucide-react";
import type { ComponentType } from "react";

type SitemapNode = { title: string; slug: string; children?: SitemapNode[] };

type Site = {
  id: string;
  name: string;
  domain: string;
  deploy_url: string | null;
  created_at: string;
  random_seed?: { sitemap?: SitemapNode[] } | null;
};

interface SiteDetailDialogProps {
  site: Site | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type LaidOutNode = {
  id: string;
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
  x: number;
  y: number;
  accent?: boolean;
};

const CARD_W = 168;
const CARD_H = 64;
const H_GAP = 16;
const ROW_H = 124;
const CARD_SPACE = CARD_W + H_GAP;

function pathOf(slug: string): string {
  const s = (slug ?? "").trim();
  if (!s || s === "index" || s === "/") return "/";
  return "/" + s.replace(/^\/+/, "");
}

function layoutSitemap(sitemap: SitemapNode[]): {
  nodes: LaidOutNode[];
  edges: Array<[string, string]>;
  width: number;
  height: number;
} {
  // Determine root and level-1 nodes.
  // If the first sitemap entry has slug 'index' (or path '/'), use it as root.
  let root: SitemapNode | null = null;
  let level1: SitemapNode[] = [];
  if (sitemap.length > 0) {
    const first = sitemap[0];
    const isHome =
      first.slug === "index" ||
      first.slug === "/" ||
      first.title.toLowerCase() === "accueil";
    if (isHome) {
      root = first;
      level1 = sitemap.slice(1);
    } else {
      root = { title: "Accueil", slug: "index" };
      level1 = sitemap;
    }
  } else {
    root = { title: "Accueil", slug: "index" };
  }

  // Compute subtree width for each level1 node (in card units)
  const subtreeUnits = level1.map((n) =>
    Math.max(1, (n.children?.length ?? 0)),
  );
  const totalUnits = subtreeUnits.reduce((a, b) => a + b, 0) || 1;

  const width = Math.max(
    CARD_SPACE * (level1.length || 1),
    CARD_SPACE * totalUnits,
    CARD_SPACE * 2,
  );

  const hasLevel2 = level1.some((n) => (n.children?.length ?? 0) > 0);
  const height = 24 + CARD_H + ROW_H + (hasLevel2 ? ROW_H : 0) + 24;

  const nodes: LaidOutNode[] = [];
  const edges: Array<[string, string]> = [];

  // Root centered
  const rootX = width / 2 - CARD_W / 2;
  nodes.push({
    id: "root",
    label: root.title,
    path: pathOf(root.slug),
    icon: Home,
    x: rootX,
    y: 24,
    accent: true,
  });

  // Level 1 positions: center each parent's block within its allocated units
  let cursor = 0;
  level1.forEach((node, i) => {
    const units = subtreeUnits[i];
    const blockCenter = (cursor + units / 2) * CARD_SPACE;
    const x = blockCenter - CARD_W / 2 + (width - totalUnits * CARD_SPACE) / 2;
    const y = 24 + CARD_H + ROW_H - CARD_H;
    const id = `l1-${i}`;
    nodes.push({
      id,
      label: node.title,
      path: pathOf(node.slug),
      icon: FileText,
      x,
      y,
    });
    edges.push(["root", id]);

    // Level 2 children
    const children = node.children ?? [];
    children.forEach((child, ci) => {
      const cx =
        (cursor + ci + 0.5) * CARD_SPACE -
        CARD_W / 2 +
        (width - totalUnits * CARD_SPACE) / 2;
      const cy = 24 + CARD_H + ROW_H * 2 - CARD_H;
      const cid = `${id}-c${ci}`;
      nodes.push({
        id: cid,
        label: child.title,
        path: pathOf(child.slug),
        icon: FileText,
        x: cx,
        y: cy,
      });
      edges.push([id, cid]);
    });

    cursor += units;
  });

  return { nodes, edges, width, height };
}

function Sitemap({ sitemap }: { sitemap: SitemapNode[] }) {
  const { nodes, edges, width, height } = layoutSitemap(sitemap);
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const cx = (n: LaidOutNode) => n.x + CARD_W / 2;
  const topY = (n: LaidOutNode) => n.y;
  const bottomY = (n: LaidOutNode) => n.y + CARD_H;

  return (
    <div className="overflow-x-auto">
      <div className="relative mx-auto" style={{ width, height }}>
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${width} ${height}`}
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
          {edges.map(([from, to]) => {
            const a = byId[from];
            const b = byId[to];
            if (!a || !b) return null;
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

        {nodes.map((n) => {
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
  icon: ComponentType<{ className?: string }>;
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
  const sitemap = site.random_seed?.sitemap ?? [];

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
                  Maillage interne du site
                </span>
              </div>
              <div className="p-4">
                {sitemap.length > 0 ? (
                  <Sitemap sitemap={sitemap} />
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Aucune arborescence enregistrée pour ce site.
                  </div>
                )}
              </div>
            </div>

          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
