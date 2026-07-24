import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Send,
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSite,
  generateBrandIdentity,
  generateBrandImage,
  generatePageContent,
  refineBrandIdentity,
  suggestKeywords,
  suggestSitemap,
} from "@/lib/sites.functions";
import {
  CONTENT_SECTIONS,
  CONTENT_SECTION_LABELS,
  DESIGN_STYLES,
  DESIGN_STYLE_LABELS,
  FOOTER_STYLES,
  FOOTER_STYLE_LABELS,
  HEADER_STYLES,
  HEADER_STYLE_LABELS,
  type BrandIdentity,
  type ContentSection,
  type DesignStyle,
  type FooterStyle,
  type HeaderStyle,
  type PageContent,
  type SitemapPage,
} from "@/lib/sites-schema";

type Step = 1 | 2 | 3 | 4 | 5;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLaunched?: (siteId: string) => void;
}

const STEP_LABELS = [
  "Brief créatif",
  "Studio de marque",
  "SEO & mots-clés",
  "Arborescence",
  "Lancement",
] as const;

const DEFAULT_COLORS: BrandIdentity["colors"] = {
  primary: "#0f172a",
  secondary: "#334155",
  accent: "#38bdf8",
  neutral: "#e2e8f0",
  background: "#ffffff",
};


type ChatMsg = { role: "user" | "assistant"; text: string };

export function CreateSiteDialog({ open, onOpenChange, onLaunched }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Brief
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [city, setCity] = useState("");
  const [brief, setBrief] = useState("");
  const [hintColors, setHintColors] = useState<string[]>([]);
  const [newHint, setNewHint] = useState("#");

  // Step 2 — Brand
  const [brand, setBrand] = useState<BrandIdentity | null>(null);
  const [logoPrompt, setLogoPrompt] = useState("");
  const [logoLoading, setLogoLoading] = useState(false);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [refining, setRefining] = useState(false);

  // Step 3 — SEO
  const [mainKeyword, setMainKeyword] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [selectedKw, setSelectedKw] = useState<Set<string>>(new Set());
  const [newKw, setNewKw] = useState("");

  // Step 4 — Sitemap
  const [sitemap, setSitemap] = useState<SitemapPage[]>([]);

  // Step 5 — Launch
  const [launchStatus, setLaunchStatus] = useState<{
    phase: "idle" | "generating" | "sending" | "done" | "error";
    current: number;
    total: number;
    label: string;
    error?: string;
  }>({ phase: "idle", current: 0, total: 0, label: "" });

  const genBrand = useServerFn(generateBrandIdentity);
  const genImage = useServerFn(generateBrandImage);
  const refineBrand = useServerFn(refineBrandIdentity);
  const suggestKw = useServerFn(suggestKeywords);
  const suggestSm = useServerFn(suggestSitemap);
  const genPage = useServerFn(generatePageContent);
  const createFn = useServerFn(createSite);
  const qc = useQueryClient();

  const brandMutation = useMutation({
    mutationFn: async () =>
      genBrand({
        data: {
          brief,
          hint_colors: hintColors,
          business_name: name,
          theme,
          city,
        },
      }),
    onSuccess: async (res) => {
      setBrand(res.brand);
      setLogoPrompt(res.logo_prompt);
      setChat([
        {
          role: "assistant",
          text: `Voici une première proposition pour "${res.brand.brand_name}". Demandez-moi des ajustements (style, couleurs, sections, logo…).`,
        },
      ]);
      setStep(2);
      void runLogo(res.logo_prompt, res.brand);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function runLogo(prompt: string, current: BrandIdentity) {
    setLogoLoading(true);
    try {
      const { data_url } = await genImage({ data: { prompt } });
      setBrand((prev) => ({ ...(prev ?? current), logo_url: data_url }));
    } catch (e) {
      toast.error(`Logo: ${(e as Error).message}`);
    } finally {
      setLogoLoading(false);
    }
  }


  const kwMutation = useMutation({
    mutationFn: async () =>
      suggestKw({
        data: {
          theme: theme || brand?.tagline || "",
          city,
          business_name: brand?.brand_name || name,
        },
      }),
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
          business_name: brand?.brand_name || name,
          keywords: Array.from(selectedKw),
        },
      }),
    onSuccess: (res) => setSitemap(res.sitemap),
    onError: (e: Error) => toast.error(e.message),
  });

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || !brand) return;
    setChatInput("");
    setChat((c) => [...c, { role: "user", text: msg }]);
    setRefining(true);
    try {
      const res = await refineBrand({ data: { message: msg, brand } });
      setBrand(res.brand);
      setChat((c) => [
        ...c,
        { role: "assistant", text: res.note || "Mise à jour appliquée." },
      ]);
      if (res.regenerate_logo && res.logo_prompt) {
        setLogoPrompt(res.logo_prompt);
        void runLogo(res.logo_prompt, res.brand);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefining(false);
    }
  }

  function normalizeSlug(input: string): string {
    const raw = (input ?? "").trim();
    if (!raw || raw === "/" || raw.toLowerCase() === "/index" || raw.toLowerCase() === "index") return "index";
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
    if (!brand) return;
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
            business_name: brand.brand_name || name,
            main_keyword: mainKeyword || Array.from(selectedKw)[0] || theme,
            secondary_keywords: Array.from(selectedKw),
            sitemap,
            page: p,
            brand,
          },
        });
        pages.push({ ...res.page, slug: normalizeSlug(res.page.slug) });
      }

      setLaunchStatus({ phase: "sending", current: total, total, label: "Envoi vers GitHub…" });

      const res = await createFn({
        data: {
          name: brand.brand_name || name,
          theme,
          city,
          main_keyword: mainKeyword || Array.from(selectedKw)[0] || theme,
          secondary_keywords: Array.from(selectedKw),
          sitemap,
          pages,
          business_name: brand.brand_name || name,
          brand,
        },
      });

      setLaunchStatus({ phase: "done", current: total, total, label: "Build lancé…" });
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
    setBrief("");
    setHintColors([]);
    setNewHint("#");
    setBrand(null);
    setLogoPrompt("");
    
    setChat([]);
    setChatInput("");
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
  function addHint() {
    const v = newHint.trim();
    if (!/^#([0-9a-fA-F]{6})$/.test(v)) {
      toast.error("Format hex #RRGGBB requis");
      return;
    }
    if (!hintColors.includes(v)) setHintColors((p) => [...p, v]);
    setNewHint("#");
  }

  function goStep1To2() {
    if (!name.trim() || !theme.trim() || !city.trim() || !brief.trim()) {
      toast.error("Nom, thématique, ville et brief sont requis");
      return;
    }
    brandMutation.mutate();
  }
  function goStep2To3() {
    if (!brand) return;
    setStep(3);
    if (keywords.length === 0 && !kwMutation.isPending) kwMutation.mutate();
  }
  function goStep3To4() {
    setStep(4);
    if (sitemap.length === 0 && !smMutation.isPending) smMutation.mutate();
  }
  function goStep4To5() {
    if (sitemap.length === 0) {
      toast.error("L'arborescence est vide");
      return;
    }
    setStep(5);
    void launch();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer un nouveau site</DialogTitle>
          <DialogDescription>
            Un studio de création guidé par l'IA, du brief au déploiement.
          </DialogDescription>
        </DialogHeader>

        <Stepper current={step} />

        {step === 1 && (
          <div className="space-y-5 pt-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom de l'entreprise / du site">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Atelier Nova" />
              </Field>
              <Field label="Ville / zone">
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Paris" />
              </Field>
              <Field label="Thématique générale" className="sm:col-span-2">
                <Input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Studio de design graphique" />
              </Field>
              <Field label="Racontez l'histoire de la marque, valeurs, ton, instructions de design" className="sm:col-span-2">
                <Textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  className="min-h-[140px]"
                  placeholder="Ex: Nous voulons une marque premium, minimaliste, inspirée du japonisme, tournée vers l'artisanat local. Ton chaleureux mais épuré, palette naturelle terre / crème / vert forêt."
                />
              </Field>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="mb-2 text-sm font-medium">Teintes suggérées (optionnel)</div>
              <div className="flex flex-wrap gap-2">
                {hintColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setHintColors((p) => p.filter((x) => x !== c))}
                    className="group flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1 text-xs"
                  >
                    <span className="h-4 w-4 rounded-full border" style={{ background: c }} />
                    <span className="font-mono">{c}</span>
                    <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  type="color"
                  value={/^#([0-9a-fA-F]{6})$/.test(newHint) ? newHint : "#38bdf8"}
                  onChange={(e) => setNewHint(e.target.value)}
                  className="h-9 w-14 p-1"
                />
                <Input
                  value={newHint}
                  onChange={(e) => setNewHint(e.target.value)}
                  className="h-9 font-mono"
                  placeholder="#38bdf8"
                />
                <Button type="button" size="sm" variant="outline" onClick={addHint}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button onClick={goStep1To2} disabled={brandMutation.isPending}>
                {brandMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                Générer l'identité visuelle
              </Button>
            </div>
          </div>
        )}

        {step === 2 && brand && (
          <div className="grid gap-4 pt-2 md:grid-cols-2">
            {/* Left — result */}
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Nom proposé</div>
                <Input
                  value={brand.brand_name}
                  onChange={(e) => setBrand({ ...brand, brand_name: e.target.value })}
                  className="mt-1 text-lg font-semibold"
                />
                <Input
                  value={brand.tagline}
                  onChange={(e) => setBrand({ ...brand, tagline: e.target.value })}
                  className="mt-2 text-sm"
                  placeholder="Tagline"
                />
              </div>
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Palette</div>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(brand.colors) as (keyof BrandIdentity["colors"])[]).map((k) => (
                    <div key={k} className="rounded-md border border-border p-2">
                      <div className="h-10 w-full rounded" style={{ background: brand.colors[k] }} />
                      <div className="mt-1 text-[10px] capitalize text-muted-foreground">{k}</div>
                      <div className="font-mono text-[10px]">{brand.colors[k]}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <ImageCard
                  title="Logo"
                  url={brand.logo_url}
                  loading={logoLoading}
                  onRegen={() => runLogo(logoPrompt, brand)}
                />
              </div>

              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Style général du site
                </div>
                <Select
                  value={brand.design_style}
                  onValueChange={(v) => setBrand({ ...brand, design_style: v as DesignStyle })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESIGN_STYLES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DESIGN_STYLE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Header
                  </div>
                  <Select
                    value={brand.header_style}
                    onValueChange={(v) => setBrand({ ...brand, header_style: v as HeaderStyle })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HEADER_STYLES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {HEADER_STYLE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Footer
                  </div>
                  <Select
                    value={brand.footer_style}
                    onValueChange={(v) => setBrand({ ...brand, footer_style: v as FooterStyle })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOOTER_STYLES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {FOOTER_STYLE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Sections de contenu à intégrer
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CONTENT_SECTIONS.map((s) => {
                    const checked = brand.sections.includes(s);
                    return (
                      <label
                        key={s}
                        className={
                          "flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs transition-colors " +
                          (checked
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:bg-accent")
                        }
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const on = v === true;
                            setBrand({
                              ...brand,
                              sections: on
                                ? Array.from(new Set([...brand.sections, s])) as ContentSection[]
                                : brand.sections.filter((x) => x !== s),
                            });
                          }}
                        />
                        <span>{CONTENT_SECTION_LABELS[s]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>


            {/* Right — chat */}
            <div className="flex min-h-[520px] flex-col rounded-lg border border-border bg-card">
              <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Chat direction artistique
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={
                      "max-w-[85%] rounded-lg px-3 py-2 " +
                      (m.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted text-foreground")
                    }
                  >
                    {m.text}
                  </div>
                ))}
                {refining && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> L'IA ajuste…
                  </div>
                )}
              </div>
              <div className="border-t border-border p-2">
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendChat();
                      }
                    }}
                    placeholder="Ex: rends le logo plus moderne, teintes bleu pastel"
                    disabled={refining}
                  />
                  <Button size="icon" onClick={() => void sendChat()} disabled={refining || !chatInput.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between md:col-span-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour
              </Button>
              <Button onClick={goStep2To3} disabled={logoLoading}>
                Valider l'identité <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 pt-2">
            <Field label="Mot-clé principal (optionnel)">
              <Input value={mainKeyword} onChange={(e) => setMainKeyword(e.target.value)} placeholder="studio design paris" />
            </Field>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Mots-clés cibles</div>
                  <p className="text-xs text-muted-foreground">Cochez ceux à conserver.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => kwMutation.mutate()}
                  disabled={kwMutation.isPending}
                >
                  {kwMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Régénérer
                </Button>
              </div>
              {keywords.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Aucun mot-clé. Lancez la suggestion ou ajoutez-en manuellement.
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
                  placeholder="Ajouter un mot-clé"
                  className="h-9"
                />
                <Button type="button" size="sm" variant="outline" onClick={addKw}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour
              </Button>
              <Button onClick={goStep3To4}>
                Continuer <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Arborescence proposée</div>
                <p className="text-xs text-muted-foreground">Modifiez avant validation.</p>
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
              <Button variant="ghost" onClick={() => setStep(3)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour
              </Button>
              <Button onClick={goStep4To5} disabled={sitemap.length === 0}>
                Lancer la création <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-border bg-muted/30 p-6 text-center">
              {launchStatus.phase === "error" ? (
                <>
                  <X className="mx-auto mb-3 h-8 w-8 text-destructive" />
                  <p className="text-sm font-medium text-destructive">
                    {launchStatus.error ?? "Erreur inattendue"}
                  </p>
                </>
              ) : launchStatus.phase === "done" ? (
                <>
                  <Check className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                  <p className="text-sm font-medium">{launchStatus.label}</p>
                </>
              ) : (
                <>
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">{launchStatus.label || "Initialisation…"}</p>
                </>
              )}
              {launchStatus.total > 0 && (
                <div className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.round(
                        (launchStatus.current / Math.max(launchStatus.total, 1)) *
                          (launchStatus.phase === "sending" || launchStatus.phase === "done" ? 100 : 90),
                      )}%`,
                    }}
                  />
                </div>
              )}
              {launchStatus.total > 0 && launchStatus.phase === "generating" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {launchStatus.current} / {launchStatus.total} pages rédigées
                </p>
              )}
            </div>
            {launchStatus.phase === "error" && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setStep(4)}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à l'arborescence
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImageCard({
  title,
  url,
  loading,
  onRegen,
  loadDelayMs = 0,
}: {
  title: string;
  url: string;
  loading: boolean;
  onRegen: () => void;
  loadDelayMs?: number;
}) {
  const hasUrl = typeof url === "string" && url.length > 0;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [mounted, setMounted] = useState(loadDelayMs === 0);
  const retriesRef = useRef(0);

  // Réinitialise l'état quand l'URL change (nouvelle génération)
  useEffect(() => {
    setImgLoaded(false);
    setImgError(false);
    retriesRef.current = 0;
    if (loadDelayMs > 0 && hasUrl) {
      setMounted(false);
      const t = setTimeout(() => setMounted(true), loadDelayMs);
      return () => clearTimeout(t);
    }
    setMounted(true);
  }, [url, loadDelayMs, hasUrl]);

  const busy = loading || (hasUrl && !imgLoaded && !imgError);
  const src = hasUrl ? (nonce ? `${url}${url.includes("?") ? "&" : "?"}r=${nonce}` : url) : "";

  function handleRegen() {
    setImgLoaded(false);
    setImgError(false);
    retriesRef.current = 0;
    if (hasUrl && !loading) {
      setNonce((n) => n + 1);
    } else {
      onRegen();
    }
  }

  function handleError() {
    // Auto-retry avec backoff (Pollinations renvoie 429 quand saturé)
    if (retriesRef.current < 4) {
      const attempt = retriesRef.current + 1;
      retriesRef.current = attempt;
      const delay = 2000 * Math.pow(2, attempt - 1) + Math.random() * 1000;
      setTimeout(() => setNonce((n) => n + 1), delay);
    } else {
      setImgError(true);
    }
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</span>
        <button
          type="button"
          onClick={onRegen}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Régénérer"
        >
          <RefreshCw className={"h-3 w-3 " + (loading ? "animate-spin" : "")} />
        </button>
      </div>
      <div className="relative flex aspect-square w-full items-center justify-center bg-muted">
        {imgError ? (
          <div className="flex flex-col items-center gap-2 p-3 text-center">
            <span className="text-xs text-muted-foreground">Échec du chargement</span>
            <Button size="sm" variant="outline" onClick={handleRegen}>
              <RefreshCw className="mr-1.5 h-3 w-3" /> Régénérer l'image
            </Button>
          </div>
        ) : !hasUrl && !loading ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <>
            {busy && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted animate-pulse">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="px-3 text-center text-[11px] leading-tight text-muted-foreground">
                  Génération de l'image en cours…<br />(cela peut prendre 15s)
                </span>
              </div>
            )}
            {hasUrl && mounted && (
              <img
                key={src}
                src={src}
                alt={title}
                onLoad={() => setImgLoaded(true)}
                onError={handleError}
                className={
                  "h-full w-full object-cover transition-opacity duration-300 " +
                  (imgLoaded ? "opacity-100" : "opacity-0")
                }
              />
            )}
          </>
        )}
      </div>
    </div>
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
                "truncate text-xs " + (active ? "font-medium text-foreground" : "text-muted-foreground")
              }
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <div className="ml-1 h-px flex-1 bg-border" />}
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
    onChange(value.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function removePage(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function addPage() {
    onChange([...value, { title: "Nouvelle page", slug: "/nouvelle-page" }]);
  }
  function addChild(idx: number) {
    const page = value[idx];
    updatePage(idx, {
      children: [...(page.children ?? []), { title: "Nouvelle sous-page", slug: "/sous-page" }],
    });
  }
  function updateChild(idx: number, cIdx: number, patch: Partial<SitemapPage>) {
    const page = value[idx];
    updatePage(idx, {
      children: (page.children ?? []).map((c, i) => (i === cIdx ? { ...c, ...patch } : c)),
    });
  }
  function removeChild(idx: number, cIdx: number) {
    const page = value[idx];
    updatePage(idx, { children: (page.children ?? []).filter((_, i) => i !== cIdx) });
  }

  return (
    <div className="space-y-2">
      {value.map((page, idx) => (
        <div key={idx} className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="shrink-0">{idx + 1}</Badge>
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
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => addChild(idx)} title="Ajouter une sous-page">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removePage(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          {page.children && page.children.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-l border-border pl-4">
              {page.children.map((child, cIdx) => (
                <li key={cIdx} className="flex items-center gap-2">
                  <span className="text-muted-foreground">└</span>
                  <Input value={child.title} onChange={(e) => updateChild(idx, cIdx, { title: e.target.value })} className="h-7 text-xs" />
                  <Input value={child.slug} onChange={(e) => updateChild(idx, cIdx, { slug: e.target.value })} className="h-7 w-36 font-mono text-[11px]" />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeChild(idx, cIdx)}>
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addPage} className="w-full">
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
      <Label className="mb-1.5 block text-xs font-medium text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}
