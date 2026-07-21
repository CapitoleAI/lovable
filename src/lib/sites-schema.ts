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

export const createSiteSchema = z.object({
  // A
  name: z.string().trim().min(1).max(120),
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Domaine invalide"),
  hosting_target: z.enum(HOSTING_TARGETS),
  // B
  theme: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  main_keyword: z.string().trim().min(1).max(120),
  secondary_keywords: z.array(z.string().trim().min(1).max(60)).max(20),
  // C
  business_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(255),
  address: z.string().trim().min(1).max(300),
  // D
  astro_template: z.enum(ASTRO_TEMPLATES),
  palette: z.enum(
    Object.keys(PALETTES) as [PaletteId, ...PaletteId[]],
  ),
  randomize: z.boolean(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
