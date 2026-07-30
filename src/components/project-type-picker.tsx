import { Code2, LayoutTemplate, Sparkles } from "lucide-react";
import type { ProjectType } from "@/lib/vfs";

interface Props {
  onSelect: (type: ProjectType) => void;
}

const CARDS: Array<{
  type: ProjectType;
  title: string;
  subtitle: string;
  bullets: string[];
  icon: typeof Code2;
}> = [
  {
    type: "astro_site",
    title: "Site Web Statique (Astro)",
    subtitle: "Génération du design, SEO et pages vitrines.",
    bullets: [
      "Brief créatif & studio de marque",
      "Mots-clés et arborescence SEO",
      "Build Astro + déploiement Cloudflare",
    ],
    icon: LayoutTemplate,
  },
  {
    type: "full_app",
    title: "Application Web (React/Node)",
    subtitle: "Génération d'une architecture de fichiers complexe et intégration GitHub.",
    bullets: [
      "Choix d'architecture et de stack",
      "Arborescence de fichiers générée (VFS)",
      "Commit multi-fichiers sur GitHub",
    ],
    icon: Code2,
  },
];

export function ProjectTypePicker({ onSelect }: Props) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Que voulez-vous créer&nbsp;?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisissez un type de projet — ou dites-le simplement au chat à gauche.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.type}
                type="button"
                onClick={() => onSelect(card.type)}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 text-left transition hover:border-[#3B6DF5] hover:shadow-md"
              >
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground transition group-hover:bg-[#3B6DF5] group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold">{card.title}</span>
                <span className="mt-1 text-xs text-muted-foreground">{card.subtitle}</span>
                <ul className="mt-4 space-y-1.5">
                  {card.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                      {b}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
