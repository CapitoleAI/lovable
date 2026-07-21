import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createSite,
  generatePageContent,
  suggestKeywords,
  suggestSitemap,
} from "@/lib/sites.functions";
import type { PageContent, SitemapPage } from "@/lib/sites-schema";

type Step = 1 | 2 | 3;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLaunched?: (siteId: string) => void;
}

const STEP_LABELS = [
  "Informations & mots-clés",
  "Arborescence",
  "Lancement",
] as const;

export function CreateSiteDialog({ open, onOpenChange, onLaunched }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [city, setCity] = useState("");
  const [mainKeyword, setMainKeyword] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedKw, setSelectedKw] = useState<Set<string>>(new Set());
  const [newKw, setNewKw] = useState("");
  const [sitemap, setSitemap] = useState<SitemapPage[]>([]);
  const [launchStatus, setLaunchStatus] = useState<{
    phase: "idle" | "generating" | "sending" | "done" | "error";
    current: number;
    total: number;
    label: string;
    error?: string;
  }>({ phase: "idle", current: 0, total: 0, label: "" });

  const suggestKw = useServerFn(suggestKeywords);
  const suggestSm = useServerFn(suggestSitemap);
  const genPage = useServerFn(generatePageContent);
  const createFn = useServerFn(createSite);
  const qc = useQueryClient();

  const kwMutation = useMutation({
    mutationFn: async () =>
      suggestKw({ data: { theme, city, business_name: name } }),
    onSuccess: (res) => {
      const merged = Array.from(new Set([...keywords, ...res.keywords]));
      setKeywords(merged);
      setSelectedKw(new Set(merged));
      toast.success(`${res.keywords.length} mots-clés suggérés`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const smMutation = useMutation({
    mutationFn: async () =>
      suggestSm({
        data: {
          theme,
          city,
          business_name: name,
          keywords: Array.from(selectedKw),
        },
      }),
    onSuccess: (res) => {
      setSitemap(res.sitemap);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function normalizeSlug(input: string): string {
    const raw = (input ?? "").trim();
    if (!raw || raw === "/" || raw.toLowerCase() === "/index" || raw.toLowerCase() === "index") {
      return "index";
    }
    return (
      raw
        .replace(/^\/+/, "")
        .replace(/\/+$/, "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-") || "index"
    );
  }

  function flatten(sm: SitemapPage[]): SitemapPage[] {
    const out: SitemapPage[] = [];
    for (const p of sm) {
      out.push({ title: p.title, slug: p.slug });
      if (p.children) for (const c of p.children) out.push({ title: c.title, slug: c.slug });
    }
    return out;
  }

  async function launch() {
    const flat = flatten(sitemap);
    const seen = new Set<string>();
    const uniquePages = flat
      .map((p) => ({ title: p.title, slug: normalizeSlug(p.slug) }))
      .filter((p) => {
        if (seen.has(p.slug)) return false;
        seen.add(p.slug);
        return true;
      });
    if (!uniquePages.some((p) => p.slug === "index") && uniquePages[0]) {
      uniquePages[0] = { ...uniquePages[0], slug: "index" };
    }

    const total = uniquePages.length;
    const pages: PageContent[] = [];
    try {
      for (let i = 0; i < uniquePages.length; i++) {
        const p = uniquePages[i];
        setLaunchStatus({
          phase: "generating",
          current: i + 1,
          total,
          label: `Rédaction de la page ${p.title} (${i + 1}/${total})…`,
        });
        const res = await genPage({
          data: {
            theme,
            city,
            business_name: name,
            main_keyword: mainKeyword || Array.from(selectedKw)[0] || theme,
            secondary_keywords: Array.from(selectedKw),
            sitemap,
            page: p,
          },
        });
        pages.push({ ...res.page, slug: normalizeSlug(res.page.slug) });
      }

      setLaunchStatus({
        phase: "sending",
        current: total,
        total,
        label: "Envoi du code vers GitHub…",
      });

      const res = await createFn({
        data: {
          name,
          theme,
          city,
          main_keyword: mainKeyword || Array.from(selectedKw)[0] || theme,
          secondary_keywords: Array.from(selectedKw),
          sitemap,
          pages,
          business_name: name,
        },
      });

      setLaunchStatus({
        phase: "done",
        current: total,
        total,
        label: "Build lancé, en attente du déploiement Cloudflare…",
      });
      toast.success("Création lancée");
      qc.invalidateQueries({ queryKey: ["sites"] });
      onLaunched?.(res.site.id);
      reset();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error).message;
      setLaunchStatus((s) => ({ ...s, phase: "error", error: msg, label: msg }));
      toast.error(msg);
    }
  }

  function reset() {
    setStep(1);
    setName("");
    setTheme("");
    setCity("");
    setMainKeyword("");
    setKeywords([]);
    setSelectedKw(new Set());
    setNewKw("");
    setSitemap([]);
    setLaunchStatus({ phase: "idle", current: 0, total: 0, label: "" });
  }

  function toggleKw(k: string) {
    setSelectedKw((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function addKw() {
    const v = newKw.trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords((p) => [...p, v]);
    setSelectedKw((p) => new Set(p).add(v));
    setNewKw("");
  }

  function removeKw(k: string) {
    setKeywords((p) => p.filter((x) => x !== k));
    setSelectedKw((p) => {
      const n = new Set(p);
      n.delete(k);
      return n;
    });
  }

  async function goStep2() {
    if (!name.trim() || !theme.trim() || !city.trim()) {
      toast.error("Nom, thématique et ville sont requis");
      return;
    }
    setStep(2);
    if (sitemap.length === 0 && !smMutation.isPending) {
      smMutation.mutate();
    }
  }

  function goStep3() {
    if (sitemap.length === 0) {
      toast.error("L'arborescence est vide");
      return;
    }
    setStep(3);
    createMutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer un nouveau site</DialogTitle>
          <DialogDescription>
            Un parcours guidé propulsé par l'IA pour lancer votre site en quelques clics.
          </DialogDescription>
        </DialogHeader>

        <Stepper current={step} />

        {step === 1 && (
          <div className="space-y-5 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom de l'entreprise / du site">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Plombier Express Paris"
                />
              </Field>
              <Field label="Ville / zone">
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Paris"
                />
              </Field>
              <Field label="Thématique générale" className="sm:col-span-2">
                <Input
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Dépannage plomberie 24/7"
                />
              </Field>
              <Field label="Mot-clé principal (optionnel)" className="sm:col-span-2">
                <Input
                  value={mainKeyword}
                  onChange={(e) => setMainKeyword(e.target.value)}
                  placeholder="plombier paris urgent"
                />
              </Field>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Mots-clés cibles</div>
                  <p className="text-xs text-muted-foreground">
                    Suggestions longue traîne par l'IA. Cochez ceux à conserver.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => kwMutation.mutate()}
                  disabled={
                    kwMutation.isPending || !theme.trim() || !city.trim()
                  }
                >
                  {kwMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Rechercher des mots-clés
                </Button>
              </div>

              {keywords.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Aucun mot-clé pour l'instant. Lancez la recherche IA ou ajoutez-en manuellement.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {keywords.map((k) => {
                    const active = selectedKw.has(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggleKw(k)}
                        className={
                          "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors " +
                          (active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-accent")
                        }
                      >
                        {active && <Check className="h-3 w-3" />}
                        <span>{k}</span>
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeKw(k);
                          }}
                          className="ml-1 rounded-full p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Input
                  value={newKw}
                  onChange={(e) => setNewKw(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKw();
                    }
                  }}
                  placeholder="Ajouter un mot-clé personnalisé"
                  className="h-9"
                />
                <Button type="button" size="sm" variant="outline" onClick={addKw}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button onClick={goStep2}>
                Continuer <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Proposition d'arborescence</div>
                <p className="text-xs text-muted-foreground">
                  Modifiez, ajoutez ou supprimez les pages avant validation.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => smMutation.mutate()}
                disabled={smMutation.isPending}
              >
                {smMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Régénérer
              </Button>
            </div>

            {smMutation.isPending && sitemap.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                L'IA construit votre arborescence…
              </div>
            ) : (
              <SitemapEditor value={sitemap} onChange={setSitemap} />
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour
              </Button>
              <Button onClick={goStep3} disabled={sitemap.length === 0}>
                Lancer la création <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Initialisation du site…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ current }: { current: Step }) {
  return (
    <ol className="flex items-center gap-2 border-b border-border pb-4">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === current;
        const done = n < current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className={
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold " +
                (done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground")
              }
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span
              className={
                "truncate text-xs " +
                (active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground")
              }
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <div className="ml-1 h-px flex-1 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SitemapEditor({
  value,
  onChange,
}: {
  value: SitemapPage[];
  onChange: (v: SitemapPage[]) => void;
}) {
  function updatePage(idx: number, patch: Partial<SitemapPage>) {
    const next = value.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  }
  function removePage(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function addPage() {
    onChange([...value, { title: "Nouvelle page", slug: "/nouvelle-page" }]);
  }
  function addChild(idx: number) {
    const page = value[idx];
    const children = [
      ...(page.children ?? []),
      { title: "Nouvelle sous-page", slug: "/sous-page" },
    ];
    updatePage(idx, { children });
  }
  function updateChild(
    idx: number,
    cIdx: number,
    patch: Partial<SitemapPage>,
  ) {
    const page = value[idx];
    const children = (page.children ?? []).map((c, i) =>
      i === cIdx ? { ...c, ...patch } : c,
    );
    updatePage(idx, { children });
  }
  function removeChild(idx: number, cIdx: number) {
    const page = value[idx];
    const children = (page.children ?? []).filter((_, i) => i !== cIdx);
    updatePage(idx, { children });
  }

  return (
    <div className="space-y-2">
      {value.map((page, idx) => (
        <div
          key={idx}
          className="rounded-md border border-border bg-card p-3"
        >
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="shrink-0">
              {idx + 1}
            </Badge>
            <Input
              value={page.title}
              onChange={(e) => updatePage(idx, { title: e.target.value })}
              className="h-8 text-sm font-medium"
              placeholder="Titre"
            />
            <Input
              value={page.slug}
              onChange={(e) => updatePage(idx, { slug: e.target.value })}
              className="h-8 w-40 font-mono text-xs"
              placeholder="/slug"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => addChild(idx)}
              title="Ajouter une sous-page"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => removePage(idx)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {page.children && page.children.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-l border-border pl-4">
              {page.children.map((child, cIdx) => (
                <li key={cIdx} className="flex items-center gap-2">
                  <span className="text-muted-foreground">└</span>
                  <Input
                    value={child.title}
                    onChange={(e) =>
                      updateChild(idx, cIdx, { title: e.target.value })
                    }
                    className="h-7 text-xs"
                  />
                  <Input
                    value={child.slug}
                    onChange={(e) =>
                      updateChild(idx, cIdx, { slug: e.target.value })
                    }
                    className="h-7 w-36 font-mono text-[11px]"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeChild(idx, cIdx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addPage}
        className="w-full"
      >
        <Plus className="mr-1.5 h-4 w-4" /> Ajouter une page
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-foreground/80">
        {label}
      </Label>
      {children}
    </div>
  );
}
