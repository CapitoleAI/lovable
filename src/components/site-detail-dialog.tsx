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
import { useMemo } from "react";

type SitemapNode = { title: string; slug: string; children?: SitemapNode[] };
type PageContent = { slug: string; seo_title: string; html_content: string };

type Site = {
  id: string;
  name: string;
  domain: string;
  deploy_url: string | null;
  created_at: string;
  random_seed?: { sitemap?: SitemapNode[] } | null;
  site_data?: { pages?: PageContent[] } | null;
};

interface SiteDetailDialogProps {
  site: Site | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function normalizeSlug(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || s === "/" || s === "index" || s === "/index") return "index";
  return s.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.html?$/, "");
}

function pathOf(slug: string): string {
  const s = normalizeSlug(slug);
  return s === "index" ? "/" : "/" + s;
}

function collectSitemapNodes(sitemap: SitemapNode[]): Array<{ title: string; slug: string }> {
  const out: Array<{ title: string; slug: string }> = [];
  const seen = new Set<string>();
  const walk = (list: SitemapNode[]) => {
    for (const n of list) {
      const slug = normalizeSlug(n.slug);
      if (!seen.has(slug)) {
        seen.add(slug);
        out.push({ title: n.title, slug });
      }
      if (n.children) walk(n.children);
    }
  };
  walk(sitemap);
  return out;
}

function extractLinks(html: string): string[] {
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    // ignore external, mail, tel, anchors, protocol-relative
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("http") ||
      href.startsWith("//")
    ) {
      continue;
    }
    out.push(href.split("#")[0].split("?")[0]);
  }
  return out;
}

type GraphNode = {
  id: string;
  label: string;
  slug: string;
  x: number;
  y: number;
  accent: boolean;
};

function buildGraph(
  sitemap: SitemapNode[],
  pages: PageContent[],
  width: number,
  height: number,
): { nodes: GraphNode[]; edges: Array<[string, string]> } {
  // Build node list: from sitemap, plus any page slug not already listed.
  const nodesMap = new Map<string, { title: string; slug: string }>();
  for (const n of collectSitemapNodes(sitemap)) nodesMap.set(n.slug, n);
  for (const p of pages) {
    const slug = normalizeSlug(p.slug);
    if (!nodesMap.has(slug)) {
      // derive a title from seo_title if possible
      const title = (p.seo_title || slug).split("—")[0].trim() || slug;
      nodesMap.set(slug, { title, slug });
    }
  }
  const slugs = Array.from(nodesMap.keys());
  // Ensure home is first
  slugs.sort((a, b) => (a === "index" ? -1 : b === "index" ? 1 : 0));

  // Layout: home center, others on circle around
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 90;
  const others = slugs.filter((s) => s !== "index");
  const homeIdx = slugs.indexOf("index");

  const nodes: GraphNode[] = [];
  if (homeIdx >= 0) {
    const home = nodesMap.get("index")!;
    nodes.push({
      id: "index",
      label: home.title,
      slug: "index",
      x: cx,
      y: cy,
      accent: true,
    });
  }
  others.forEach((slug, i) => {
    const info = nodesMap.get(slug)!;
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / Math.max(1, others.length);
    nodes.push({
      id: slug,
      label: info.title,
      slug,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      accent: false,
    });
  });

  // Build edges from actual HTML content
  const validSlugs = new Set(slugs);
  const edgeSet = new Set<string>();
  const edges: Array<[string, string]> = [];
  for (const p of pages) {
    const from = normalizeSlug(p.slug);
    if (!validSlugs.has(from)) continue;
    const links = extractLinks(p.html_content);
    for (const href of links) {
      const to = normalizeSlug(href);
      if (!validSlugs.has(to) || to === from) continue;
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push([from, to]);
    }
  }

  return { nodes, edges };
}

const CARD_W = 168;
const CARD_H = 56;

function Sitemap({
  sitemap,
  pages,
}: {
  sitemap: SitemapNode[];
  pages: PageContent[];
}) {
  const total = Math.max(
    collectSitemapNodes(sitemap).length,
    pages.length,
  );
  // Scale canvas with number of nodes so cards don't overlap
  const size = Math.max(520, 260 + total * 46);
  const width = size;
  const height = size;
  const { nodes, edges } = useMemo(
    () => buildGraph(sitemap, pages, width, height),
    [sitemap, pages, width, height],
  );
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

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
              id="sitemap-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="3.5"
              refY="3.5"
              orient="auto"
            >
              <circle cx="3.5" cy="3.5" r="2.5" className="fill-primary/70" />
            </marker>
          </defs>
          {edges.map(([from, to], i) => {
            const a = byId[from];
            const b = byId[to];
            if (!a || !b) return null;
            // Slight curvature for visual mesh feel
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            const bow = Math.min(60, len * 0.15) * ((i % 2) === 0 ? 1 : -1);
            const cx1 = mx + nx * bow;
            const cy1 = my + ny * bow;
            const d = `M ${a.x} ${a.y} Q ${cx1} ${cy1} ${b.x} ${b.y}`;
            return (
              <path
                key={`${from}-${to}-${i}`}
                d={d}
                className="stroke-primary/40"
                strokeWidth={1.25}
                strokeDasharray="4 4"
              />
            );
          })}
        </svg>

        {nodes.map((n) => (
          <div
            key={n.id}
            className={
              "absolute flex items-center gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
              (n.accent
                ? "border-primary/40 ring-1 ring-primary/20"
                : "border-border")
            }
            style={{
              left: n.x - CARD_W / 2,
              top: n.y - CARD_H / 2,
              width: CARD_W,
              height: CARD_H,
            }}
          >
            <div
              className={
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                (n.accent
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground")
              }
            >
              {n.accent ? <Home className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold leading-tight">
                {n.label}
              </div>
              <div className="truncate font-mono text-[10px] text-muted-foreground">
                {pathOf(n.slug)}
              </div>
            </div>
          </div>
        ))}
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
  const sitemap = site.random_seed?.sitemap ?? [];
  const pages = site.site_data?.pages ?? [];
  const linkCount = useMemo(() => {
    const validSlugs = new Set<string>();
    for (const n of collectSitemapNodes(sitemap)) validSlugs.add(n.slug);
    for (const p of pages) validSlugs.add(normalizeSlug(p.slug));
    const seen = new Set<string>();
    for (const p of pages) {
      const from = normalizeSlug(p.slug);
      for (const href of extractLinks(p.html_content)) {
        const to = normalizeSlug(href);
        if (!validSlugs.has(to) || to === from) continue;
        const key = from < to ? `${from}|${to}` : `${to}|${from}`;
        seen.add(key);
      }
    }
    return seen.size;
  }, [sitemap, pages]);

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
              <StatCard icon={TrendingUp} label="Trafic" value="—" hint="Visites mensuelles" />
              <StatCard icon={Search} label="Mots-clés" value="—" hint="Positionnés en top 100" />
              <StatCard icon={Activity} label="Santé SEO" value="—" hint="Score global" />
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
                  Maillage interne
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {pages.length} pages · {linkCount} liens détectés
                </span>
              </div>
              <div className="p-4">
                {pages.length > 0 || sitemap.length > 0 ? (
                  <Sitemap sitemap={sitemap} pages={pages} />
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Aucune donnée disponible pour ce site.
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
