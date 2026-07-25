import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateNewPage } from "@/lib/orchestrator.functions";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";

interface Props {
  siteName: string;
  brand?: Partial<BrandIdentity>;
  pages: PageContent[];
  onChange: (pages: PageContent[]) => void;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function WorkspaceSitemap({ siteName, brand, pages, onChange }: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const genPage = useServerFn(generateNewPage);

  async function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    const slug = slugify(title) || `page-${pages.length + 1}`;
    if (pages.some((p) => p.slug === slug)) {
      toast.error("Une page avec ce slug existe déjà");
      return;
    }
    setBusy(true);
    try {
      const page = await genPage({
        data: {
          title,
          slug,
          instruction: "",
          brand: brand as BrandIdentity | undefined,
          site_context: {
            name: siteName,
            pages: pages.map((p) => ({ slug: p.slug, seo_title: p.seo_title })),
          },
        },
      });
      onChange([...pages, page]);
      setNewTitle("");
      toast.success("Page ajoutée");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleRemove(slug: string) {
    if (slug === "index") {
      toast.error("Impossible de supprimer la page d'accueil");
      return;
    }
    if (!window.confirm("Supprimer cette page ?")) return;
    onChange(pages.filter((p) => p.slug !== slug));
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Arborescence</h2>
          <p className="text-sm text-muted-foreground">
            {pages.length} page{pages.length > 1 ? "s" : ""}. Les modifications s'appliquent en local ; cliquez sur « Publier » pour lancer un rebuild.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {pages.map((p) => (
              <li key={p.slug} className="flex items-center gap-3 p-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.seo_title.split("—")[0].trim() || p.slug}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.slug === "index" ? "/" : `/${p.slug}`}
                  </p>
                </div>
                {p.slug !== "index" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemove(p.slug)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-dashed border-border bg-card p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Ajouter une page
          </Label>
          <div className="mt-2 flex gap-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Ex. Tarifs, Blog, Contact…"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              disabled={busy}
            />
            <Button onClick={handleAdd} disabled={busy || !newTitle.trim()}>
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Générer
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            L'IA rédigera le contenu Tailwind cohérent avec votre marque.
          </p>
        </div>

        {/* placeholder for parity with icon usage */}
        <div className="sr-only">
          <Plus />
        </div>
      </div>
    </div>
  );
}
