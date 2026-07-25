import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageContent } from "@/lib/sites-schema";

interface Props {
  pages: PageContent[];
}

function buildDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><style>html,body{margin:0;padding:0;background:#fff;}</style></head><body>${html}</body></html>`;
}

export function WorkspacePreview({ pages }: Props) {
  const [activeSlug, setActiveSlug] = useState<string>(pages[0]?.slug ?? "index");
  const [nonce, setNonce] = useState(0);

  const active = useMemo(
    () => pages.find((p) => p.slug === activeSlug) ?? pages[0],
    [pages, activeSlug],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2 overflow-x-auto">
        {pages.map((p) => (
          <button
            key={p.slug}
            onClick={() => setActiveSlug(p.slug)}
            className={
              "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors " +
              (p.slug === active?.slug
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-accent")
            }
          >
            {p.slug === "index" ? "/" : `/${p.slug}`}
          </button>
        ))}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNonce((n) => n + 1)}
            title="Rafraîchir"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-muted p-4">
        {active ? (
          <iframe
            key={`${active.slug}-${nonce}`}
            title={`Aperçu ${active.slug}`}
            sandbox="allow-scripts"
            srcDoc={buildDoc(active.html_content)}
            className="h-full w-full rounded-lg border border-border bg-white shadow-sm"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Aucune page.
          </div>
        )}
      </div>
    </div>
  );
}
