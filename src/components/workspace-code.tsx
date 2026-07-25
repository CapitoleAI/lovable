import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";

interface Props {
  pages: PageContent[];
  brand?: Partial<BrandIdentity> | null;
  onChange: (next: { pages: PageContent[]; brand?: Partial<BrandIdentity> | null }) => void;
}

export function WorkspaceCode({ pages, brand, onChange }: Props) {
  const initial = useMemo(
    () => JSON.stringify({ brand: brand ?? null, pages }, null, 2),
    [pages, brand],
  );
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
    setError(null);
  }, [initial]);

  const dirty = draft !== initial;

  function apply() {
    try {
      const parsed = JSON.parse(draft);
      if (!parsed || !Array.isArray(parsed.pages)) {
        throw new Error("Le JSON doit contenir un tableau `pages`.");
      }
      onChange({ pages: parsed.pages as PageContent[], brand: parsed.brand ?? null });
      toast.success("JSON appliqué au brouillon");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
        <p className="text-xs text-muted-foreground">
          JSON complet du site (marque + pages). Édition locale ; cliquez sur « Appliquer » puis « Publier » pour rebuild.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(initial);
              setError(null);
            }}
            disabled={!dirty}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Annuler
          </Button>
          <Button size="sm" onClick={apply} disabled={!dirty}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Appliquer
          </Button>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 bg-muted/40 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="h-full min-h-full resize-none rounded-md border-border bg-background font-mono text-xs leading-relaxed"
        />
      </div>
    </div>
  );
}
