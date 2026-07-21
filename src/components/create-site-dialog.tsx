import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSite } from "@/lib/sites.functions";
import {
  ASTRO_TEMPLATES,
  HOSTING_TARGETS,
  PALETTES,
  createSiteSchema,
  type CreateSiteInput,
} from "@/lib/sites-schema";

interface CreateSiteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const HOSTING_LABELS: Record<(typeof HOSTING_TARGETS)[number], string> = {
  cloudflare_pages: "Cloudflare Pages",
  netlify: "Netlify",
  vercel: "Vercel",
  ftp: "FTP mutualisé",
};

const TEMPLATE_LABELS: Record<(typeof ASTRO_TEMPLATES)[number], string> = {
  alpha: "Thème Alpha",
  beta: "Thème Beta",
  gamma: "Thème Gamma",
};

const initialForm: CreateSiteInput = {
  name: "",
  domain: "",
  hosting_target: "cloudflare_pages",
  theme: "",
  city: "",
  main_keyword: "",
  secondary_keywords: [],
  business_name: "",
  phone: "",
  email: "",
  address: "",
  astro_template: "alpha",
  palette: "ocean",
  randomize: true,
};

export function CreateSiteDialog({ open, onOpenChange }: CreateSiteDialogProps) {
  const [form, setForm] = useState<CreateSiteInput>(initialForm);
  const [secondaryText, setSecondaryText] = useState("");
  const createFn = useServerFn(createSite);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: CreateSiteInput) => createFn({ data: input }),
    onSuccess: () => {
      toast.success("Site créé, génération lancée");
      qc.invalidateQueries({ queryKey: ["sites"] });
      onOpenChange(false);
      setForm(initialForm);
      setSecondaryText("");
    },
    onError: (e: Error) => toast.error(e.message || "Échec de la création"),
  });

  function set<K extends keyof CreateSiteInput>(k: K, v: CreateSiteInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const secondary_keywords = secondaryText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const candidate = { ...form, secondary_keywords };
    const parsed = createSiteSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Formulaire invalide");
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Créer un site Astro</DialogTitle>
          <DialogDescription>
            Configurez le site. La génération et le déploiement se déclenchent en arrière-plan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">A · Identité & routage</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom du projet">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </Field>
              <Field label="Nom de domaine">
                <Input
                  value={form.domain}
                  placeholder="plombier-paris-express.fr"
                  onChange={(e) => set("domain", e.target.value)}
                  required
                />
              </Field>
              <Field label="Hébergement cible" className="sm:col-span-2">
                <Select
                  value={form.hosting_target}
                  onValueChange={(v) => set("hosting_target", v as CreateSiteInput["hosting_target"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOSTING_TARGETS.map((h) => (
                      <SelectItem key={h} value={h}>{HOSTING_LABELS[h]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">B · SEO & sémantique</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Thématique principale">
                <Input value={form.theme} onChange={(e) => set("theme", e.target.value)} required />
              </Field>
              <Field label="Ville / zone cible">
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} required />
              </Field>
              <Field label="Mot-clé principal" className="sm:col-span-2">
                <Input
                  value={form.main_keyword}
                  onChange={(e) => set("main_keyword", e.target.value)}
                  required
                />
              </Field>
              <Field label="Mots-clés secondaires (séparés par des virgules)" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={secondaryText}
                  onChange={(e) => setSecondaryText(e.target.value)}
                  placeholder="dépannage urgent, plombier 24/7, fuite d'eau"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">C · Signaux de confiance</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom de l'entreprise">
                <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} required />
              </Field>
              <Field label="Téléphone">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
              </Field>
              <Field label="Email de contact">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                />
              </Field>
              <Field label="Adresse physique">
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} required />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">D · Anti-empreinte & design</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Template Astro">
                <Select
                  value={form.astro_template}
                  onValueChange={(v) => set("astro_template", v as CreateSiteInput["astro_template"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASTRO_TEMPLATES.map((t) => (
                      <SelectItem key={t} value={t}>{TEMPLATE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Palette de couleurs">
                <Select
                  value={form.palette}
                  onValueChange={(v) => set("palette", v as CreateSiteInput["palette"])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PALETTES) as (keyof typeof PALETTES)[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="inline-flex items-center gap-2">
                          <span className="flex gap-0.5">
                            {PALETTES[p].map((c) => (
                              <span key={c} className="h-3 w-3 rounded-sm border border-border" style={{ background: c }} />
                            ))}
                          </span>
                          <span className="capitalize">{p}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center justify-between rounded-md border border-border p-3 sm:col-span-2">
                <div className="pr-4">
                  <div className="text-sm font-medium">Randomiser structure & CSS</div>
                  <p className="text-xs text-muted-foreground">
                    Ordre des sections HTML et préfixe unique des classes CSS pour réduire l'empreinte.
                  </p>
                </div>
                <Switch checked={form.randomize} onCheckedChange={(v) => set("randomize", v)} />
              </label>
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Création…" : "Créer le site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
