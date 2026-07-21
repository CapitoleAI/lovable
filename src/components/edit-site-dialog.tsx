import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Save, FileText } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { updateSite, generatePageForSite } from "@/lib/sites.functions";

type PageContent = { slug: string; seo_title: string; html_content: string };

type Site = {
  id: string;
  name: string;
  site_data?: { pages?: PageContent[] } | null;
};

interface EditSiteDialogProps {
  site: Site | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function EditSiteDialog({ site, open, onOpenChange, onSaved }: EditSiteDialogProps) {
  const save = useServerFn(updateSite);
  const genPage = useServerFn(generatePageForSite);

  const [pages, setPages] = useState<PageContent[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>("index");
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open && site) {
      const initial = site.site_data?.pages ?? [];
      setPages(initial.map((p) => ({ ...p })));
      setActiveSlug(initial[0]?.slug ?? "index");
      setNewTitle("");
    }
  }, [open, site]);

  const activePage = useMemo(
    () => pages.find((p) => p.slug === activeSlug) ?? pages[0],
    [pages, activeSlug],
  );

  function updateActive(patch: Partial<PageContent>) {
    setPages((prev) =>
      prev.map((p) => (p.slug === activePage?.slug ? { ...p, ...patch } : p)),
    );
  }

  function removePage(slug: string) {
    if (slug === "index") {
      toast.error("Impossible de supprimer la page d'accueil");
      return;
    }
    if (!confirm("Supprimer cette page ?")) return;
    setPages((prev) => prev.filter((p) => p.slug !== slug));
    if (activeSlug === slug) setActiveSlug("index");
  }

  async function handleAddPage() {
    if (!site) return;
    const title = newTitle.trim();
    if (!title) {
      toast.error("Renseignez un titre");
      return;
    }
    let slug = slugify(title);
    if (!slug) slug = `page-${pages.length + 1}`;
    if (pages.some((p) => p.slug === slug)) {
      toast.error("Une page avec ce slug existe déjà");
      return;
    }
    setGenerating(true);
    try {
      const { page } = await genPage({ data: { id: site.id, title, slug } });
      const normalized: PageContent = { ...page, slug };
      setPages((prev) => [...prev, normalized]);
      setActiveSlug(slug);
      setNewTitle("");
      toast.success("Page générée par l'IA");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!site) return;
    if (pages.length === 0) {
      toast.error("Au moins une page est requise");
      return;
    }
    if (!pages.some((p) => p.slug === "index")) {
      toast.error("La page 'index' est obligatoire");
      return;
    }
    setSaving(true);
    try {
      const res = await save({ data: { id: site.id, pages } });
      if (!res.ok) throw new Error(res.error ?? "Échec");
      toast.success("Modifications enregistrées, rebuild lancé");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!site) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Modifier {site.name}</DialogTitle>
            <DialogDescription>
              Éditez le contenu, ajoutez des pages, puis validez pour relancer un build.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 gap-0">
            {/* Pages sidebar */}
            <aside className="w-64 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pages ({pages.length})
              </div>
              <ul className="space-y-1">
                {pages.map((p) => (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() => setActiveSlug(p.slug)}
                      className={
                        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                        (activeSlug === p.slug
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent")
                      }
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {p.seo_title.split("—")[0].trim() || p.slug}
                      </span>
                      {p.slug !== "index" && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            removePage(p.slug);
                          }}
                          className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4 rounded-md border border-dashed border-border p-2">
                <Label className="text-xs">Ajouter une page</Label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Tarifs"
                  className="mt-1 h-8"
                />
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={handleAddPage}
                  disabled={generating}
                >
                  {generating ? (
                    <>Génération…</>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Générer avec l'IA
                    </>
                  )}
                </Button>
              </div>
            </aside>

            {/* Editor */}
            <div className="flex min-w-0 flex-1 flex-col">
              {activePage ? (
                <Tabs defaultValue="edit" className="flex min-h-0 flex-1 flex-col">
                  <div className="border-b border-border px-4 pt-3">
                    <TabsList>
                      <TabsTrigger value="edit">Éditer</TabsTrigger>
                      <TabsTrigger value="preview">Aperçu</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="edit" className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="space-y-3">
                      <div>
                        <Label>Slug</Label>
                        <Input
                          value={activePage.slug}
                          disabled
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label>Titre SEO</Label>
                        <Input
                          value={activePage.seo_title}
                          onChange={(e) => updateActive({ seo_title: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Contenu HTML (Tailwind)</Label>
                        <Textarea
                          value={activePage.html_content}
                          onChange={(e) => updateActive({ html_content: e.target.value })}
                          className="mt-1 min-h-[420px] font-mono text-xs"
                          spellCheck={false}
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="preview" className="min-h-0 flex-1 overflow-hidden p-4">
                    <div className="h-full overflow-hidden rounded-md border border-border">
                      <iframe
                        title={`Aperçu ${activePage.slug}`}
                        sandbox="allow-scripts"
                        className="h-full w-full bg-white"
                        srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head><body>${activePage.html_content}</body></html>`}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Aucune page sélectionnée
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border bg-background px-6 py-3">
            <div className="flex w-full items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Enregistrer déclenche un nouveau build.
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {saving ? "Enregistrement…" : "Enregistrer & rebuild"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
