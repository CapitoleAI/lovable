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

export const pageContentSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  seo_title: z.string().trim().min(1).max(200),
  html_content: z.string().min(1),
});
export type PageContent = z.infer<typeof pageContentSchema>;

export const brandColorsSchema = z.object({
  primary: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/),
  secondary: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/),
  accent: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/),
  neutral: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/),
  background: z.string().trim().regex(/^#([0-9a-fA-F]{6})$/),
});
export type BrandColors = z.infer<typeof brandColorsSchema>;

export const DESIGN_STYLES = [
  "minimaliste",
  "corporate",
  "ludique",
  "sombre",
  "elegant",
  "brutaliste",
] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];

export const HEADER_STYLES = ["classique", "centre"] as const;
export type HeaderStyle = (typeof HEADER_STYLES)[number];

export const FOOTER_STYLES = ["simple", "complet"] as const;
export type FooterStyle = (typeof FOOTER_STYLES)[number];

export const CONTENT_SECTIONS = [
  "hero_image",
  "services_grid",
  "testimonials",
  "contact_form",
  "features",
  "pricing",
  "faq",
  "cta_banner",
  "gallery",
  "stats",
] as const;
export type ContentSection = (typeof CONTENT_SECTIONS)[number];

export const DESIGN_STYLE_LABELS: Record<DesignStyle, string> = {
  minimaliste: "Minimaliste",
  corporate: "Corporate",
  ludique: "Ludique",
  sombre: "Sombre / Dark mode",
  elegant: "Élégant",
  brutaliste: "Brutaliste",
};

export const HEADER_STYLE_LABELS: Record<HeaderStyle, string> = {
  classique: "Classique (logo à gauche, menu à droite)",
  centre: "Centré (logo et menu centrés)",
};

export const FOOTER_STYLE_LABELS: Record<FooterStyle, string> = {
  simple: "Simple (une ligne)",
  complet: "Complet (colonnes et liens)",
};

export const CONTENT_SECTION_LABELS: Record<ContentSection, string> = {
  hero_image: "Hero avec image",
  services_grid: "Grille de services",
  testimonials: "Témoignages",
  contact_form: "Formulaire de contact",
  features: "Bloc fonctionnalités",
  pricing: "Tarifs",
  faq: "FAQ",
  cta_banner: "Bannière CTA",
  gallery: "Galerie",
  stats: "Chiffres clés",
};

export const brandIdentitySchema = z.object({
  brand_name: z.string().trim().min(1).max(120),
  tagline: z.string().trim().max(200).default(""),
  story: z.string().trim().max(4000).default(""),
  colors: brandColorsSchema,
  logo_url: z.string().trim().max(2_000_000).default(""),
  moodboard_url: z.string().trim().max(2_000_000).default(""),
  design_style: z.enum(DESIGN_STYLES).default("minimaliste"),
  header_style: z.enum(HEADER_STYLES).default("classique"),
  footer_style: z.enum(FOOTER_STYLES).default("simple"),
  sections: z.array(z.enum(CONTENT_SECTIONS)).default([]),
});
export type BrandIdentity = z.infer<typeof brandIdentitySchema>;

export const createSiteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  theme: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  main_keyword: z.string().trim().min(1).max(120),
  secondary_keywords: z.array(z.string().trim().min(1).max(80)).max(30),
  sitemap: z.array(sitemapPageSchema).min(1).max(30),
  pages: z.array(pageContentSchema).min(1).max(60).optional(),
  brand: brandIdentitySchema.optional(),
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

export const generatePageSchema = z.object({
  theme: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  business_name: z.string().trim().min(1).max(200),
  main_keyword: z.string().trim().min(1).max(120),
  secondary_keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  page: z.object({
    title: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(120),
  }),
  sitemap: z.array(sitemapPageSchema).min(1).max(30),
  brand: brandIdentitySchema.optional(),
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
