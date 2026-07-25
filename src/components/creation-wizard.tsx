import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
  createSite,
  generateBrandIdentity,
  generateBrandImage,
  generatePageContent,
  refineComponent,
  suggestKeywords,
  suggestSitemap,
} from "@/lib/sites.functions";
import {
  type BrandIdentity,
  type PageContent,
  type SitemapPage,
} from "@/lib/sites-schema";
import {
  componentsByCategory,
  wrapPreviewDoc,
  type ThemeComponent,
  type BrandCtx,
} from "@/lib/theme-components";


type Step = 1 | 2 | 3 | 4 | 5;

export type CreationSnapshot = {
  step: Step;
  name: string;
  theme: string;
  city: string;
  brief: string;
  hint_colors: string[];
  brand: BrandIdentity | null;
  main_keyword: string;
  keywords: string[];
  selected_keywords: string[];
  sitemap: SitemapPage[];
  launch_phase: "idle" | "generating" | "sending" | "done" | "error";
};

export type CreationWizardHandle = {
  /** Fill brief fields (any subset) and, if enough is present, generate brand + advance to step 2. */
  advanceToBrandStudio: (input: {
    name?: string;
    theme?: string;
    city?: string;
    brief?: string;
    hint_colors?: string[];
  }) => Promise<void>;
  /** Patch the theme/brand at step 2. */
  updateTheme: (patch: Partial<BrandIdentity>) => void;
  /** Move to SEO + Sitemap (step 3-4), optionally seed values and auto-suggest missing ones. */
  generateSeoAndTree: (input: {
    main_keyword?: string;
    keywords?: string[];
    sitemap?: SitemapPage[];
  }) => Promise<void>;
  /** Launch the site build. */
  finalizeAndBuild: () => Promise<void>;
  /** Manually navigate to a step (from stepper clicks). */
  goToStep: (step: Step) => void;
};

interface Props {
  onFinalized?: (siteId: string) => void;
  onSnapshotChange?: (snap: CreationSnapshot) => void;
  onExit?: () => void;
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


export const CreationWizard = forwardRef<CreationWizardHandle, Props>(function CreationWizard(
  { onFinalized, onSnapshotChange, onExit },
  ref,
) {
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
      onFinalized?.(res.site.id);
      reset();

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

  // ---------- Snapshot to parent (for chat context) ----------
  const selectedKwArr = Array.from(selectedKw);
  useEffect(() => {
    onSnapshotChange?.({
      step,
      name,
      theme,
      city,
      brief,
      hint_colors: hintColors,
      brand,
      main_keyword: mainKeyword,
      keywords,
      selected_keywords: selectedKwArr,
      sitemap,
      launch_phase: launchStatus.phase,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, name, theme, city, brief, hintColors, brand, mainKeyword, keywords, selectedKwArr.join("|"), sitemap, launchStatus.phase]);

  // ---------- Imperative API (used by the chat orchestrator) ----------
  useImperativeHandle(
    ref,
    () => ({
      async advanceToBrandStudio(input) {
        if (input.name !== undefined) setName(input.name);
        if (input.theme !== undefined) setTheme(input.theme);
        if (input.city !== undefined) setCity(input.city);
        if (input.brief !== undefined) setBrief(input.brief);
        if (input.hint_colors !== undefined) setHintColors(input.hint_colors);
        const n = (input.name ?? name).trim();
        const th = (input.theme ?? theme).trim();
        const ci = (input.city ?? city).trim();
        const br = (input.brief ?? brief).trim();
        if (!n || !th || !ci || !br) {
          toast.info("Précise nom, thématique, ville et brief pour lancer le studio.");
          return;
        }
        try {
          const res = await genBrand({
            data: { brief: br, hint_colors: input.hint_colors ?? hintColors, business_name: n, theme: th, city: ci },
          });
          setBrand(res.brand);
          setLogoPrompt(res.logo_prompt);
          setStep(2);
          void runLogo(res.logo_prompt, res.brand);
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
      updateTheme(patch) {
        if (!brand) return;
        setBrand({ ...brand, ...patch, colors: { ...brand.colors, ...(patch.colors ?? {}) } });
      },
      async generateSeoAndTree(input) {
        if (input.main_keyword !== undefined) setMainKeyword(input.main_keyword);
        setStep(3);
        let kws = keywords;
        if (input.keywords && input.keywords.length > 0) {
          kws = Array.from(new Set([...keywords, ...input.keywords]));
          setKeywords(kws);
          setSelectedKw(new Set(kws));
        } else if (keywords.length === 0) {
          try {
            const res = await suggestKw({
              data: {
                theme: theme || brand?.tagline || "",
                city,
                business_name: brand?.brand_name || name,
              },
            });
            kws = Array.from(new Set([...keywords, ...res.keywords]));
            setKeywords(kws);
            setSelectedKw(new Set(kws));
          } catch (e) {
            toast.error((e as Error).message);
          }
        }
        setStep(4);
        if (input.sitemap && input.sitemap.length > 0) {
          setSitemap(input.sitemap);
        } else if (sitemap.length === 0) {
          try {
            const res = await suggestSm({
              data: {
                theme,
                city,
                business_name: brand?.brand_name || name,
                keywords: kws,
              },
            });
            setSitemap(res.sitemap);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }
      },
      async finalizeAndBuild() {
        if (!brand) {
          toast.error("Identité de marque manquante");
          return;
        }
        if (sitemap.length === 0) {
          toast.error("Arborescence vide");
          return;
        }
        setStep(5);
        await launch();
      },
      goToStep(s) {
        setStep(s);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, theme, city, brief, hintColors, brand, keywords, sitemap],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Créer un nouveau site</h1>
            <p className="text-xs text-muted-foreground">
              Discute avec l'IA à gauche ou remplis directement les étapes ci-dessous.
            </p>
          </div>
          {onExit && (
            <Button variant="ghost" size="sm" onClick={onExit}>
              <X className="mr-1.5 h-4 w-4" /> Fermer
            </Button>
          )}
        </div>

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
              <Button variant="ghost" onClick={onExit}>Annuler</Button>
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
          <ThemeBuilder
            brand={brand}
            setBrand={setBrand}
            logoLoading={logoLoading}
            logoPrompt={logoPrompt}
            onRegenLogo={() => runLogo(logoPrompt, brand)}
            chat={chat}
            setChat={setChat}
            chatInput={chatInput}
            setChatInput={setChatInput}
            refining={refining}
            sendChat={sendChat}
            onBack={() => setStep(1)}
            onNext={goStep2To3}
          />
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
      </div>
    </div>
  );
});


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

// ============================================================================
// Theme Builder — Étape 2 (galerie visuelle de composants Tailwind)
// ============================================================================

function brandCtx(brand: BrandIdentity): BrandCtx {
  return {
    brand_name: brand.brand_name || "Marque",
    tagline: brand.tagline || "",
    colors: brand.colors,
    logo_url: brand.logo_url || "",
  };
}

function ComponentPreview({
  comp,
  brand,
  overrideHtml,
  selected,
  onSelect,
  onRefine,
}: {
  comp: ThemeComponent;
  brand: BrandIdentity;
  overrideHtml?: string;
  selected: boolean;
  onSelect: () => void;
  onRefine: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const html = overrideHtml ?? comp.render(brandCtx(brand));
  const doc = wrapPreviewDoc(html, brand.colors.background);

  async function submitRefine() {
    const p = prompt.trim();
    if (!p) return;
    setBusy(true);
    try {
      await onRefine(p);
      setPrompt("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        "group relative overflow-hidden rounded-lg border-2 bg-card transition-all " +
        (selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50")
      }
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full cursor-pointer"
        title={selected ? "Sélectionné" : "Cliquer pour sélectionner"}
      >
        <div className="pointer-events-none relative h-[220px] w-full overflow-hidden bg-white">
          <iframe
            title={comp.label}
            sandbox="allow-scripts"
            srcDoc={doc}
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width: "1280px", height: "800px", transform: "scale(0.32)" }}
          />
        </div>
        {selected && (
          <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Check className="h-3.5 w-3.5" />
          </div>
        )}
      </button>
      <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2">
        <span className="truncate text-xs font-medium">{comp.label}</span>
        {overrideHtml && (
          <Badge variant="outline" className="text-[9px]">
            IA
          </Badge>
        )}
      </div>
      <div className="border-t border-border p-2">
        <div className="flex gap-1.5">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Modifier avec l'IA…"
            className="h-7 text-xs"
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitRefine();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={busy || !prompt.trim()}
            onClick={() => void submitRefine()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThemeBuilder({
  brand,
  setBrand,
  logoLoading,
  logoPrompt,
  onRegenLogo,
  chat,
  setChat,
  chatInput,
  setChatInput,
  refining,
  sendChat,
  onBack,
  onNext,
}: {
  brand: BrandIdentity;
  setBrand: (b: BrandIdentity) => void;
  logoLoading: boolean;
  logoPrompt: string;
  onRegenLogo: () => void;
  chat: { role: "user" | "assistant"; text: string }[];
  setChat: React.Dispatch<React.SetStateAction<{ role: "user" | "assistant"; text: string }[]>>;
  chatInput: string;
  setChatInput: (v: string) => void;
  refining: boolean;
  sendChat: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const refineComp = useServerFn(refineComponent);
  const overrides = brand.component_overrides ?? {};

  const selectHeader = (id: string) =>
    setBrand({ ...brand, selected_header_id: brand.selected_header_id === id ? "" : id });
  const selectHero = (id: string) =>
    setBrand({ ...brand, selected_hero_id: brand.selected_hero_id === id ? "" : id });
  const selectFooter = (id: string) =>
    setBrand({ ...brand, selected_footer_id: brand.selected_footer_id === id ? "" : id });
  const toggleSection = (id: string) => {
    const cur = brand.selected_section_ids ?? [];
    setBrand({
      ...brand,
      selected_section_ids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    });
  };

  async function refineOne(comp: ThemeComponent, message: string) {
    try {
      const currentHtml = overrides[comp.id] ?? comp.render(brandCtx(brand));
      const { html } = await refineComp({
        data: {
          component_id: comp.id,
          category: comp.category,
          current_html: currentHtml,
          message,
          brand: brandCtx(brand),
        },
      });
      setBrand({
        ...brand,
        component_overrides: { ...overrides, [comp.id]: html },
      });
      toast.success("Composant modifié");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const headers = componentsByCategory("header");
  const heroes = componentsByCategory("hero");
  const sections = componentsByCategory("section");
  const footers = componentsByCategory("footer");

  const selectedCount =
    (brand.selected_header_id ? 1 : 0) +
    (brand.selected_hero_id ? 1 : 0) +
    (brand.selected_section_ids?.length ?? 0) +
    (brand.selected_footer_id ? 1 : 0);

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[1fr_360px]">
      {/* LEFT — Gallery */}
      <div className="space-y-4">
        {/* Brand summary */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            {brand.logo_url ? (
              <img src={brand.logo_url} alt="" className="h-12 w-12 rounded object-contain" />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded font-bold text-white"
                style={{ background: brand.colors.primary }}
              >
                {(brand.brand_name?.[0] ?? "L").toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <Input
                value={brand.brand_name}
                onChange={(e) => setBrand({ ...brand, brand_name: e.target.value })}
                className="h-8 text-sm font-semibold"
              />
              <Input
                value={brand.tagline}
                onChange={(e) => setBrand({ ...brand, tagline: e.target.value })}
                className="mt-1 h-7 text-xs"
                placeholder="Tagline"
              />
            </div>
            <div className="flex gap-1">
              {(Object.keys(brand.colors) as (keyof BrandIdentity["colors"])[]).map((k) => (
                <div
                  key={k}
                  className="h-8 w-8 rounded border border-border"
                  style={{ background: brand.colors[k] }}
                  title={`${k}: ${brand.colors[k]}`}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRegenLogo}
              disabled={logoLoading}
            >
              {logoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5 text-xs">Logo</span>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="header" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="header">
              Header {brand.selected_header_id && <Check className="ml-1 h-3 w-3" />}
            </TabsTrigger>
            <TabsTrigger value="hero">
              Hero {brand.selected_hero_id && <Check className="ml-1 h-3 w-3" />}
            </TabsTrigger>
            <TabsTrigger value="section">
              Sections ({brand.selected_section_ids?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="footer">
              Footer {brand.selected_footer_id && <Check className="ml-1 h-3 w-3" />}
            </TabsTrigger>
          </TabsList>

          {[
            { key: "header", list: headers, onSel: selectHeader, isSel: (id: string) => brand.selected_header_id === id, hint: "Choisis 1 header" },
            { key: "hero", list: heroes, onSel: selectHero, isSel: (id: string) => brand.selected_hero_id === id, hint: "Choisis 1 hero" },
            { key: "section", list: sections, onSel: toggleSection, isSel: (id: string) => (brand.selected_section_ids ?? []).includes(id), hint: "Choisis plusieurs sections (dans l'ordre de clic)" },
            { key: "footer", list: footers, onSel: selectFooter, isSel: (id: string) => brand.selected_footer_id === id, hint: "Choisis 1 footer" },
          ].map((cat) => (
            <TabsContent key={cat.key} value={cat.key} className="mt-3">
              <div className="mb-2 text-xs text-muted-foreground">{cat.hint}</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cat.list.map((c) => (
                  <ComponentPreview
                    key={c.id}
                    comp={c}
                    brand={brand}
                    overrideHtml={overrides[c.id]}
                    selected={cat.isSel(c.id)}
                    onSelect={() => cat.onSel(c.id)}
                    onRefine={(msg) => refineOne(c, msg)}
                  />
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* RIGHT — chat + summary */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-xs">
          <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
            Sélection ({selectedCount})
          </div>
          <div>Header: {brand.selected_header_id || "—"}</div>
          <div>Hero: {brand.selected_hero_id || "—"}</div>
          <div>Sections: {(brand.selected_section_ids ?? []).join(", ") || "—"}</div>
          <div>Footer: {brand.selected_footer_id || "—"}</div>
        </div>
        <div className="flex min-h-[440px] flex-1 flex-col rounded-lg border border-border bg-card">
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
                placeholder="Ajuste la marque (couleurs, ton…)"
                disabled={refining}
              />
              <Button size="icon" onClick={() => void sendChat()} disabled={refining || !chatInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Pour modifier un composant précis, utilise l'input « Modifier avec l'IA » sur la carte.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour
          </Button>
          <Button onClick={onNext} disabled={logoLoading || selectedCount === 0}>
            Valider le thème <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

