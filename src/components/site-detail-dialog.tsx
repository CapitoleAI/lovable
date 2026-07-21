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
  Folder,
  FileText,
  ExternalLink,
  TrendingUp,
  Search,
  Activity,
  Globe,
  Calendar,
} from "lucide-react";

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

type TreeNode = { name: string; type: "folder" | "file"; children?: TreeNode[] };

const FAKE_TREE: TreeNode = {
  name: "src/",
  type: "folder",
  children: [
    { name: "index.astro", type: "file" },
    {
      name: "pages/",
      type: "folder",
      children: [
        { name: "services.astro", type: "file" },
        { name: "a-propos.astro", type: "file" },
        { name: "contact.astro", type: "file" },
        {
          name: "blog/",
          type: "folder",
          children: [
            { name: "[slug].astro", type: "file" },
            { name: "index.astro", type: "file" },
          ],
        },
      ],
    },
    {
      name: "components/",
      type: "folder",
      children: [
        { name: "Header.astro", type: "file" },
        { name: "Footer.astro", type: "file" },
        { name: "Hero.astro", type: "file" },
      ],
    },
  ],
};

function TreeView({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const Icon = node.type === "folder" ? Folder : FileText;
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md py-1 text-sm hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <Icon
          className={
            node.type === "folder"
              ? "h-4 w-4 text-primary"
              : "h-4 w-4 text-muted-foreground"
          }
        />
        <span className={node.type === "folder" ? "font-medium" : "text-muted-foreground"}>
          {node.name}
        </span>
      </div>
      {node.children?.map((child, i) => (
        <TreeView key={`${child.name}-${i}`} node={child} depth={depth + 1} />
      ))}
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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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
              <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Arborescence du site
              </div>
              <div className="p-2 font-mono">
                <TreeView node={FAKE_TREE} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
