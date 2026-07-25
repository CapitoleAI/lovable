import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";

interface Props {
  pages: PageContent[];
  brand?: Partial<BrandIdentity>;
}

const DEFAULT_COLORS = {
  primary: "#0f172a",
  secondary: "#334155",
  accent: "#38bdf8",
  neutral: "#e2e8f0",
  background: "#ffffff",
};

function buildDoc(html: string, colors: typeof DEFAULT_COLORS): string {
  // Tailwind Play CDN config MUST be set after the CDN script loads.
  // We register a `brand` color palette (DEFAULT + variants) so templates
  // can use `bg-brand`, `text-brand`, `ring-brand`, `bg-brand-accent`, etc.,
  // and the Live Preview reflects palette changes instantly.
  const config = {
    theme: {
      extend: {
        colors: {
          brand: {
            DEFAULT: colors.primary,
            primary: colors.primary,
            secondary: colors.secondary,
            accent: colors.accent,
            neutral: colors.neutral,
            background: colors.background,
          },
        },
      },
    },
  };
  const cssVars = `:root{--brand:${colors.primary};--brand-primary:${colors.primary};--brand-secondary:${colors.secondary};--brand-accent:${colors.accent};--brand-neutral:${colors.neutral};--brand-background:${colors.background};}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><script>tailwind.config = ${JSON.stringify(config)};</script><style>html,body{margin:0;padding:0;background:${colors.background};}${cssVars}</style></head><body>${html}</body></html>`;
}

export function WorkspacePreview({ pages, brand }: Props) {
  const [activeSlug, setActiveSlug] = useState<string>(pages[0]?.slug ?? "index");
  const [nonce, setNonce] = useState(0);

  const active = useMemo(
    () => pages.find((p) => p.slug === activeSlug) ?? pages[0],
    [pages, activeSlug],
  );

  const colors = { ...DEFAULT_COLORS, ...(brand?.colors ?? {}) };
  const colorKey = `${colors.primary}|${colors.secondary}|${colors.accent}|${colors.neutral}|${colors.background}`;

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
            key={`${active.slug}-${colorKey}-${nonce}`}
            title={`Aperçu ${active.slug}`}
            sandbox="allow-scripts"
            srcDoc={buildDoc(active.html_content, colors)}
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
