import { z } from "zod";

export const HOSTING_TARGETS = [
  "cloudflare_pages",
  "netlify",
  "vercel",
  "ftp",
] as const;

export const ASTRO_TEMPLATES = ["alpha", "beta", "gamma"] as const;

export const PALETTES = {
  ocean: ["#0f172a", "#1e40af", "#38bdf8", "#f1f5f9"],
  forest: ["#052e16", "#166534", "#84cc16", "#f7fee7"],
  sunset: ["#450a0a", "#b91c1c", "#f97316", "#fef3c7"],
  mono: ["#0a0a0a", "#404040", "#a3a3a3", "#fafafa"],
  royal: ["#1e1b4b", "#6d28d9", "#c084fc", "#f5f3ff"],
} as const;

export type PaletteId = keyof typeof PALETTES;

export const sitemapPageSchema: z.ZodType<SitemapPage> = z.lazy(() =>
  z.object({
    title: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(80),
    children: z.array(sitemapPageSchema).max(20).optional(),
  }),
);
export type SitemapPage = {
  title: string;
  slug: string;
  children?: SitemapPage[];
};

export const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  theme: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  main_keyword: z.string().trim().min(1).max(120),
  secondary_keywords: z.array(z.string().trim().min(1).max(80)).max(30),
  sitemap: z.array(sitemapPageSchema).min(1).max(30),
  // Optional / defaults
  domain: z.string().trim().max(253).optional().default(""),
  business_name: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(255).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  hosting_target: z.enum(HOSTING_TARGETS).default("cloudflare_pages"),
  astro_template: z.enum(ASTRO_TEMPLATES).default("alpha"),
  palette: z
    .enum(Object.keys(PALETTES) as [PaletteId, ...PaletteId[]])
    .default("ocean"),
  randomize: z.boolean().default(true),
});

export type CreateSiteInput = z.input<typeof createSiteSchema>;
export type CreateSiteParsed = z.output<typeof createSiteSchema>;

export const suggestKeywordsSchema = z.object({
  theme: z.string().trim().min(1).max(200),
  city: z.string().trim().max(120).optional().default(""),
  business_name: z.string().trim().max(200).optional().default(""),
});

export const suggestSitemapSchema = z.object({
  theme: z.string().trim().min(1).max(200),
  city: z.string().trim().max(120).optional().default(""),
  business_name: z.string().trim().max(200).optional().default(""),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
