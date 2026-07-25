import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listPrompts, resetPrompt, updatePrompt } from "@/lib/prompts.functions";

type PromptRow = {
  key: string;
  label: string;
  description: string;
  default_content: string;
  current_content: string;
  is_customized: boolean;
  updated_at: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromptsManager({ open, onOpenChange }: Props) {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = useServerFn(listPrompts);
  const doUpdate = useServerFn(updatePrompt);
  const doReset = useServerFn(resetPrompt);

  async function reload() {
    setLoading(true);
    try {
      const rows = (await fetchAll()) as PromptRow[];
      setPrompts(rows);
      setSelectedKey((prev) => prev ?? rows[0]?.key ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = prompts.find((p) => p.key === selectedKey) ?? null;

  useEffect(() => {
    setDraft(selected?.current_content ?? "");
  }, [selectedKey, selected?.current_content]);

  const dirty = selected ? draft.trim() !== selected.current_content.trim() : false;

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await doUpdate({ data: { key: selected.key, content: draft } });
      toast.success("Prompt enregistré");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!selected) return;
    setSaving(true);
    try {
      await doReset({ data: { key: selected.key } });
      toast.success("Prompt réinitialisé au défaut");
      await reload();
      setDraft(selected.default_content);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaultInEditor() {
    if (!selected) return;
    setDraft(selected.default_content);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Prompts système</DialogTitle>
          <DialogDescription>
            Tous les prompts qui pilotent l'IA. Enregistrés en base et partagés entre appareils.
          </DialogDescription>
        </DialogHeader>

        <div className="grid h-[70vh] grid-cols-[280px_1fr]">
          <aside className="min-h-0 overflow-y-auto border-r border-border bg-muted/30">
            {loading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
              </div>
            ) : (
              <ul className="py-2">
                {prompts.map((p) => (
                  <li key={p.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedKey(p.key)}
                      className={`w-full px-4 py-2.5 text-left text-sm transition ${
                        selectedKey === p.key
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{p.label}</span>
                        {p.is_customized && (
                          <span
                            title="Personnalisé"
                            className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
                          />
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {p.key}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="flex min-h-0 flex-col">
            {selected ? (
              <>
                <div className="border-b border-border px-5 py-3">
                  <div className="text-sm font-semibold">{selected.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {selected.description}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Clé : <code className="rounded bg-muted px-1">{selected.key}</code>
                    {selected.is_customized && selected.updated_at && (
                      <>
                        {" · "}personnalisé le{" "}
                        {new Date(selected.updated_at).toLocaleString("fr-FR")}
                      </>
                    )}
                  </div>
                </div>
                <div className="min-h-0 flex-1 p-4">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-full min-h-full resize-none font-mono text-xs leading-relaxed"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={restoreDefaultInEditor}
                      disabled={saving || draft === selected.default_content}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Charger le défaut
                    </Button>
                    {selected.is_customized && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={resetToDefault}
                        disabled={saving}
                      >
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Supprimer la personnalisation
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onOpenChange(false)}
                    >
                      Fermer
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      onClick={save}
                      disabled={!dirty || saving || !draft.trim()}
                    >
                      {saving ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Enregistrer
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Sélectionne un prompt à gauche.
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
