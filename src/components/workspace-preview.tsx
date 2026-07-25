import { useMemo } from "react";
import type { BrandIdentity, PageContent } from "@/lib/sites-schema";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

interface Props {
  pages: PageContent[];
  brand?: Partial<BrandIdentity>;
  activeSlug: string;
  device: PreviewDevice;
  nonce: number;
}

const DEFAULT_COLORS = {
  primary: "#0f172a",
  secondary: "#334155",
  accent: "#38bdf8",
  neutral: "#e2e8f0",
  background: "#ffffff",
};

export const DEVICE_WIDTHS: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: 820,
  mobile: 390,
};

function buildDoc(html: string, colors: typeof DEFAULT_COLORS): string {
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
  const resetRadius = `.rounded-t-2xl{border-top-left-radius:0!important;border-top-right-radius:0!important;}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><script>tailwind.config = ${JSON.stringify(config)};</script><style>html,body{margin:0;padding:0;background:${colors.background};}${cssVars}${resetRadius}</style></head><body>${html}</body></html>`;
}

export function WorkspacePreview({ pages, brand, activeSlug, device, nonce }: Props) {
  const active = useMemo(
    () => pages.find((p) => p.slug === activeSlug) ?? pages[0],
    [pages, activeSlug],
  );
  const colors = { ...DEFAULT_COLORS, ...(brand?.colors ?? {}) };
  const colorKey = `${colors.primary}|${colors.secondary}|${colors.accent}|${colors.neutral}|${colors.background}`;
  const deviceWidth = DEVICE_WIDTHS[device];

  return (
    <div
      className="min-h-0 flex-1 overflow-auto h-full"
      style={{ borderTopLeftRadius: "1rem", borderTopRightRadius: "1rem" }}
    >
      {active ? (
        <div
          className="mx-auto h-full overflow-hidden border border-[#1D1D1C] shadow-lg transition-all"
          style={{
            ...(deviceWidth ? { maxWidth: deviceWidth } : {}),
          }}
        >
          <iframe
            key={`${active.slug}-${colorKey}-${nonce}-${device}`}
            title={`Aperçu ${active.slug}`}
            sandbox="allow-scripts"
            srcDoc={buildDoc(active.html_content, colors)}
            className="h-full w-full bg-white"
          />
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Aucune page.
        </div>
      )}
    </div>
  );
}
