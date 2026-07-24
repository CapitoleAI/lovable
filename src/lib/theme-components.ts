/**
 * Bibliothèque de composants HTML/Tailwind pour le Theme Builder.
 * Chaque template est une fonction `render(ctx)` qui renvoie du HTML string
 * utilisant Tailwind CSS (via CDN dans les previews, ou classes standard dans
 * le build final). Les couleurs de marque sont injectées via `style="..."`
 * pour éviter la purge JIT sur les classes arbitraires dynamiques.
 */

export type ThemeCategory = "header" | "hero" | "section" | "footer";

export type BrandCtx = {
  brand_name: string;
  tagline: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    neutral: string;
    background: string;
  };
  logo_url: string;
};

export type ThemeComponent = {
  id: string;
  category: ThemeCategory;
  label: string;
  render: (b: BrandCtx) => string;
};

// ---------- Helpers ----------

function logo(b: BrandCtx, size = 32): string {
  if (b.logo_url) {
    return `<img src="${b.logo_url}" alt="${b.brand_name}" style="height:${size}px;width:${size}px;object-fit:contain" class="rounded" />`;
  }
  return `<div style="width:${size}px;height:${size}px;background:${b.colors.primary};color:${b.colors.background}" class="flex items-center justify-center rounded-md font-bold text-sm">${(b.brand_name?.[0] ?? "L").toUpperCase()}</div>`;
}

const NAV = ["Accueil", "Services", "À propos", "Contact"];

// =========================================================
// HEADERS
// =========================================================

const HEADERS: ThemeComponent[] = [
  {
    id: "header_classic_split",
    category: "header",
    label: "Header 1 — Classique (logo gauche, menu droit)",
    render: (b) => `
<header style="background:${b.colors.background};border-bottom:1px solid ${b.colors.neutral}">
  <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
    <a href="/" class="flex items-center gap-3">${logo(b, 36)}<span style="color:${b.colors.primary}" class="text-xl font-bold tracking-tight">${b.brand_name}</span></a>
    <nav class="hidden md:flex items-center gap-8 text-sm">${NAV.map((n) => `<a href="#" style="color:${b.colors.secondary}" class="hover:opacity-70 transition">${n}</a>`).join("")}</nav>
    <a href="#" style="background:${b.colors.primary};color:${b.colors.background}" class="px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90">Devis</a>
  </div>
</header>`,
  },
  {
    id: "header_centered",
    category: "header",
    label: "Header 2 — Centré (logo + menu centrés)",
    render: (b) => `
<header style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-6 flex flex-col items-center gap-4">
    <a href="/" class="flex items-center gap-3">${logo(b, 40)}<span style="color:${b.colors.primary}" class="text-2xl font-bold tracking-tight">${b.brand_name}</span></a>
    <nav class="flex items-center gap-10 text-sm uppercase tracking-widest">${NAV.map((n) => `<a href="#" style="color:${b.colors.secondary}" class="hover:opacity-70">${n}</a>`).join("")}</nav>
  </div>
  <div style="height:1px;background:${b.colors.neutral}"></div>
</header>`,
  },
  {
    id: "header_bold_bar",
    category: "header",
    label: "Header 3 — Barre pleine couleur (CTA proéminent)",
    render: (b) => `
<header style="background:${b.colors.primary};color:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
    <a href="/" class="flex items-center gap-3">${logo(b, 34)}<span class="text-xl font-black tracking-tight">${b.brand_name}</span></a>
    <nav class="hidden lg:flex items-center gap-6 text-sm font-medium opacity-90">${NAV.map((n) => `<a href="#" class="hover:opacity-100">${n}</a>`).join("")}</nav>
    <div class="flex items-center gap-2">
      <a href="#" style="border-color:${b.colors.background};color:${b.colors.background}" class="hidden sm:inline px-4 py-2 rounded-full text-sm border">Connexion</a>
      <a href="#" style="background:${b.colors.accent};color:${b.colors.primary}" class="px-5 py-2 rounded-full text-sm font-bold">Réserver</a>
    </div>
  </div>
</header>`,
  },
];

// =========================================================
// HEROES
// =========================================================

const HEROES: ThemeComponent[] = [
  {
    id: "hero_split_image",
    category: "hero",
    label: "Hero 1 — Split gauche/droite avec visuel",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-12 items-center">
    <div>
      <span style="background:${b.colors.accent}20;color:${b.colors.accent}" class="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-6">Nouveau</span>
      <h1 style="color:${b.colors.primary}" class="text-5xl lg:text-6xl font-black tracking-tight leading-tight">${b.brand_name}<br/><span style="color:${b.colors.accent}">${b.tagline || "Excellence & précision"}</span></h1>
      <p style="color:${b.colors.secondary}" class="mt-6 text-lg leading-relaxed">Découvrez une approche moderne et engagée. Nous transformons vos idées en résultats mesurables, avec soin et expertise.</p>
      <div class="mt-8 flex gap-3">
        <a href="#" style="background:${b.colors.primary};color:${b.colors.background}" class="px-6 py-3 rounded-lg font-semibold">Commencer</a>
        <a href="#" style="border-color:${b.colors.primary};color:${b.colors.primary}" class="px-6 py-3 rounded-lg font-semibold border">En savoir plus</a>
      </div>
    </div>
    <div style="background:linear-gradient(135deg,${b.colors.primary},${b.colors.accent})" class="aspect-square rounded-3xl shadow-2xl"></div>
  </div>
</section>`,
  },
  {
    id: "hero_centered_bold",
    category: "hero",
    label: "Hero 2 — Centré XXL",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-4xl mx-auto px-6 py-32 text-center">
    <h1 style="color:${b.colors.primary}" class="text-6xl lg:text-8xl font-black tracking-tighter leading-none">${b.tagline || b.brand_name}</h1>
    <p style="color:${b.colors.secondary}" class="mt-8 text-xl leading-relaxed max-w-2xl mx-auto">Une expérience pensée pour aller à l'essentiel. Simple, efficace, mémorable.</p>
    <div class="mt-10 flex justify-center gap-3">
      <a href="#" style="background:${b.colors.primary};color:${b.colors.background}" class="px-8 py-4 rounded-full font-bold">Découvrir</a>
      <a href="#" style="color:${b.colors.primary}" class="px-8 py-4 rounded-full font-bold underline-offset-4 hover:underline">Voir la démo →</a>
    </div>
  </div>
</section>`,
  },
  {
    id: "hero_gradient_full",
    category: "hero",
    label: "Hero 3 — Dégradé plein écran",
    render: (b) => `
<section style="background:linear-gradient(135deg,${b.colors.primary} 0%,${b.colors.secondary} 60%,${b.colors.accent} 100%);color:${b.colors.background}">
  <div class="max-w-6xl mx-auto px-6 py-32 grid lg:grid-cols-5 gap-8 items-end">
    <div class="lg:col-span-3">
      <h1 class="text-5xl lg:text-7xl font-black leading-tight">${b.brand_name}<br/><span class="opacity-80">${b.tagline || "Faites la différence."}</span></h1>
    </div>
    <div class="lg:col-span-2">
      <p class="text-lg opacity-90 leading-relaxed">Une signature visuelle et une exécution sans compromis. Passons du brief au résultat, ensemble.</p>
      <a href="#" style="background:${b.colors.background};color:${b.colors.primary}" class="mt-6 inline-block px-6 py-3 rounded-lg font-bold">Nous parler</a>
    </div>
  </div>
</section>`,
  },
];

// =========================================================
// SECTIONS
// =========================================================

const SECTIONS: ThemeComponent[] = [
  {
    id: "section_features_3col",
    category: "section",
    label: "Features — Grille 3 colonnes",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <div class="text-center max-w-2xl mx-auto mb-16">
      <h2 style="color:${b.colors.primary}" class="text-4xl font-bold">Pourquoi nous choisir</h2>
      <p style="color:${b.colors.secondary}" class="mt-4 text-lg">Trois piliers qui font la différence.</p>
    </div>
    <div class="grid md:grid-cols-3 gap-8">
      ${["Rapidité", "Expertise", "Engagement"].map((t, i) => `<div style="background:${b.colors.neutral}20;border-color:${b.colors.neutral}" class="p-8 rounded-2xl border"><div style="background:${b.colors.accent};color:${b.colors.background}" class="w-12 h-12 rounded-lg flex items-center justify-center font-bold mb-4">${i + 1}</div><h3 style="color:${b.colors.primary}" class="text-xl font-bold mb-2">${t}</h3><p style="color:${b.colors.secondary}">Un engagement fort, des livrables clairs, une équipe qui répond présent à chaque étape.</p></div>`).join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_services_grid",
    category: "section",
    label: "Services — Grille avec icônes",
    render: (b) => `
<section style="background:${b.colors.neutral}20">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-4">Nos services</h2>
    <p style="color:${b.colors.secondary}" class="text-center mb-12 max-w-xl mx-auto">Des prestations sur-mesure adaptées à votre secteur.</p>
    <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
      ${["Conseil", "Design", "Développement", "Support"].map((s) => `<div style="background:${b.colors.background}" class="p-6 rounded-xl shadow-sm hover:shadow-lg transition"><div style="background:${b.colors.primary}15;color:${b.colors.primary}" class="w-10 h-10 rounded-lg flex items-center justify-center mb-4 font-bold">✦</div><h3 style="color:${b.colors.primary}" class="font-bold text-lg mb-2">${s}</h3><p style="color:${b.colors.secondary}" class="text-sm">Une approche complète et rigoureuse.</p></div>`).join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_testimonials",
    category: "section",
    label: "Témoignages — 3 avis",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-12">Ils nous font confiance</h2>
    <div class="grid md:grid-cols-3 gap-6">
      ${[
        ["Marie L.", "Directrice", "Un travail exceptionnel, à l'écoute et créatif."],
        ["Julien D.", "Fondateur", "Livraison dans les temps, qualité au rendez-vous."],
        ["Sophia R.", "Responsable com.", "L'équipe rêvée pour un projet ambitieux."],
      ]
        .map(([n, r, q]) => `<figure style="background:${b.colors.neutral}20;border-left:4px solid ${b.colors.accent}" class="p-6 rounded-r-xl"><blockquote style="color:${b.colors.primary}" class="text-lg italic leading-relaxed">"${q}"</blockquote><figcaption class="mt-4"><div style="color:${b.colors.primary}" class="font-bold">${n}</div><div style="color:${b.colors.secondary}" class="text-sm">${r}</div></figcaption></figure>`)
        .join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_testimonials_carousel",
    category: "section",
    label: "Témoignage — Avis vedette centré",
    render: (b) => `
<section style="background:${b.colors.primary};color:${b.colors.background}">
  <div class="max-w-3xl mx-auto px-6 py-24 text-center">
    <div style="color:${b.colors.accent}" class="text-5xl font-serif leading-none mb-4">"</div>
    <p class="text-2xl lg:text-3xl font-medium leading-relaxed">Une collaboration qui a transformé notre marque de fond en comble. Un vrai partenaire, pas un simple prestataire.</p>
    <div class="mt-8 flex items-center justify-center gap-3">
      <div style="background:${b.colors.accent}" class="w-12 h-12 rounded-full"></div>
      <div class="text-left"><div class="font-bold">Alexandre M.</div><div class="opacity-70 text-sm">CEO, Studio Nova</div></div>
    </div>
  </div>
</section>`,
  },
  {
    id: "section_about_split",
    category: "section",
    label: "À propos — Split image / texte",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16 items-center">
    <div style="background:linear-gradient(160deg,${b.colors.secondary},${b.colors.primary})" class="aspect-[4/5] rounded-3xl"></div>
    <div>
      <span style="color:${b.colors.accent}" class="text-sm font-bold uppercase tracking-widest">Notre histoire</span>
      <h2 style="color:${b.colors.primary}" class="mt-3 text-4xl font-bold">Une équipe, une mission</h2>
      <p style="color:${b.colors.secondary}" class="mt-6 text-lg leading-relaxed">Depuis plus de 10 ans, nous accompagnons des marques exigeantes dans leur transformation. Nos convictions : rigueur, créativité et transparence.</p>
      <a href="#" style="color:${b.colors.primary}" class="mt-6 inline-flex items-center gap-2 font-bold underline-offset-4 hover:underline">En savoir plus →</a>
    </div>
  </div>
</section>`,
  },
  {
    id: "section_pricing_3tier",
    category: "section",
    label: "Tarifs — 3 offres",
    render: (b) => `
<section style="background:${b.colors.neutral}20">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-12">Nos tarifs</h2>
    <div class="grid md:grid-cols-3 gap-6">
      ${[
        ["Starter", "49", "Idéal pour démarrer", false],
        ["Pro", "149", "Le plus populaire", true],
        ["Enterprise", "sur devis", "Volumes & SLA", false],
      ]
        .map(([n, p, d, hi]) => `<div style="background:${hi ? b.colors.primary : b.colors.background};color:${hi ? b.colors.background : b.colors.primary}" class="p-8 rounded-2xl shadow-sm ${hi ? "scale-105" : ""}"><h3 class="text-xl font-bold">${n}</h3><div class="mt-4 text-4xl font-black">${p === "sur devis" ? p : p + "€"}${p !== "sur devis" ? '<span class="text-sm font-normal opacity-70">/mois</span>' : ""}</div><p class="mt-2 opacity-70 text-sm">${d}</p><ul class="mt-6 space-y-2 text-sm">${["Support prioritaire", "Accès complet", "Mises à jour"].map((f) => `<li>✓ ${f}</li>`).join("")}</ul><a href="#" style="background:${hi ? b.colors.accent : b.colors.primary};color:${hi ? b.colors.primary : b.colors.background}" class="mt-6 block text-center py-3 rounded-lg font-bold">Choisir</a></div>`)
        .join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_pricing_table",
    category: "section",
    label: "Tarifs — Comparatif tableau",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-5xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-12">Comparez nos formules</h2>
    <div style="border-color:${b.colors.neutral}" class="overflow-hidden rounded-2xl border">
      <table class="w-full text-sm">
        <thead style="background:${b.colors.primary};color:${b.colors.background}"><tr><th class="text-left p-4 font-bold">Fonctionnalité</th><th class="p-4 font-bold">Basic</th><th class="p-4 font-bold">Pro</th><th class="p-4 font-bold">Premium</th></tr></thead>
        <tbody style="color:${b.colors.secondary}">
          ${["Utilisateurs", "Stockage", "Support"].map((f, i) => `<tr style="background:${i % 2 ? b.colors.neutral + "20" : "transparent"}"><td class="p-4 font-medium" style="color:${b.colors.primary}">${f}</td><td class="p-4 text-center">1</td><td class="p-4 text-center">10</td><td class="p-4 text-center">∞</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>`,
  },
  {
    id: "section_faq",
    category: "section",
    label: "FAQ — Liste dépliable",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-3xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-12">Questions fréquentes</h2>
    <div class="space-y-3">
      ${[
        ["Quels sont vos délais ?", "En moyenne 2 à 4 semaines selon la complexité."],
        ["Proposez-vous du sur-mesure ?", "Oui, chaque projet est adapté à vos besoins."],
        ["Comment se passe le paiement ?", "50% à la commande, 50% à la livraison."],
        ["Assurez-vous le suivi ?", "Un accompagnement de 3 mois est inclus."],
      ]
        .map(([q, a]) => `<details style="background:${b.colors.neutral}20;border-color:${b.colors.neutral}" class="group rounded-xl border p-5"><summary class="cursor-pointer flex items-center justify-between font-bold" style="color:${b.colors.primary}">${q}<span style="color:${b.colors.accent}" class="group-open:rotate-45 transition">+</span></summary><p style="color:${b.colors.secondary}" class="mt-3 leading-relaxed">${a}</p></details>`)
        .join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_cta_banner",
    category: "section",
    label: "CTA — Bannière pleine largeur",
    render: (b) => `
<section style="background:${b.colors.accent}">
  <div class="max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row items-center justify-between gap-6">
    <div>
      <h2 style="color:${b.colors.primary}" class="text-3xl md:text-4xl font-black">Prêt à démarrer votre projet ?</h2>
      <p style="color:${b.colors.primary}" class="mt-2 opacity-80">Un premier échange offert de 30 minutes.</p>
    </div>
    <a href="#" style="background:${b.colors.primary};color:${b.colors.background}" class="px-8 py-4 rounded-full font-bold whitespace-nowrap">Réserver un appel →</a>
  </div>
</section>`,
  },
  {
    id: "section_cta_dark",
    category: "section",
    label: "CTA — Bloc sombre centré",
    render: (b) => `
<section style="background:${b.colors.primary};color:${b.colors.background}">
  <div class="max-w-3xl mx-auto px-6 py-24 text-center">
    <h2 class="text-4xl font-black">Commençons dès aujourd'hui</h2>
    <p class="mt-4 text-lg opacity-80">Rejoignez les marques qui nous font confiance.</p>
    <a href="#" style="background:${b.colors.accent};color:${b.colors.primary}" class="mt-8 inline-block px-8 py-4 rounded-lg font-bold">Prendre rendez-vous</a>
  </div>
</section>`,
  },
  {
    id: "section_stats",
    category: "section",
    label: "Chiffres clés — 4 stats",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
      ${[
        ["12+", "Années d'expérience"],
        ["350", "Projets livrés"],
        ["98%", "Clients satisfaits"],
        ["24/7", "Support disponible"],
      ]
        .map(([n, l]) => `<div><div style="color:${b.colors.accent}" class="text-5xl font-black">${n}</div><div style="color:${b.colors.secondary}" class="mt-2 text-sm uppercase tracking-widest">${l}</div></div>`)
        .join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_gallery_grid",
    category: "section",
    label: "Galerie — Grille 6 vignettes",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-12">Nos réalisations</h2>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
      ${Array.from({ length: 6 })
        .map((_, i) => `<div style="background:linear-gradient(${45 + i * 30}deg,${b.colors.primary},${b.colors.accent})" class="aspect-square rounded-xl"></div>`)
        .join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_gallery_masonry",
    category: "section",
    label: "Galerie — Masonry asymétrique",
    render: (b) => `
<section style="background:${b.colors.neutral}20">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold mb-12">Portfolio</h2>
    <div class="grid grid-cols-4 grid-rows-2 gap-4 h-[500px]">
      <div style="background:linear-gradient(135deg,${b.colors.primary},${b.colors.accent})" class="col-span-2 row-span-2 rounded-2xl"></div>
      <div style="background:${b.colors.secondary}" class="rounded-2xl"></div>
      <div style="background:${b.colors.accent}" class="rounded-2xl"></div>
      <div style="background:${b.colors.primary}" class="col-span-2 rounded-2xl"></div>
    </div>
  </div>
</section>`,
  },
  {
    id: "section_contact_form",
    category: "section",
    label: "Contact — Formulaire",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-3xl mx-auto px-6 py-24">
    <div class="text-center mb-10">
      <h2 style="color:${b.colors.primary}" class="text-4xl font-bold">Contactez-nous</h2>
      <p style="color:${b.colors.secondary}" class="mt-3">Réponse sous 24 h ouvrées.</p>
    </div>
    <form class="grid gap-4">
      <div class="grid md:grid-cols-2 gap-4">
        <input placeholder="Prénom" style="border-color:${b.colors.neutral};color:${b.colors.primary}" class="border rounded-lg px-4 py-3" />
        <input placeholder="Nom" style="border-color:${b.colors.neutral};color:${b.colors.primary}" class="border rounded-lg px-4 py-3" />
      </div>
      <input placeholder="Email" style="border-color:${b.colors.neutral};color:${b.colors.primary}" class="border rounded-lg px-4 py-3" />
      <textarea placeholder="Votre message" rows="5" style="border-color:${b.colors.neutral};color:${b.colors.primary}" class="border rounded-lg px-4 py-3"></textarea>
      <button type="button" style="background:${b.colors.primary};color:${b.colors.background}" class="py-3 rounded-lg font-bold">Envoyer</button>
    </form>
  </div>
</section>`,
  },
  {
    id: "section_contact_split",
    category: "section",
    label: "Contact — Split infos + formulaire",
    render: (b) => `
<section style="background:${b.colors.neutral}20">
  <div class="max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-12">
    <div>
      <h2 style="color:${b.colors.primary}" class="text-4xl font-bold">Parlons de votre projet</h2>
      <p style="color:${b.colors.secondary}" class="mt-4 text-lg">Notre équipe vous accompagne à chaque étape.</p>
      <ul class="mt-8 space-y-4">
        <li style="color:${b.colors.primary}"><span style="color:${b.colors.accent}" class="font-bold mr-2">✉</span> contact@exemple.com</li>
        <li style="color:${b.colors.primary}"><span style="color:${b.colors.accent}" class="font-bold mr-2">☎</span> 01 23 45 67 89</li>
        <li style="color:${b.colors.primary}"><span style="color:${b.colors.accent}" class="font-bold mr-2">◉</span> 12 rue de la Paix, Paris</li>
      </ul>
    </div>
    <form style="background:${b.colors.background}" class="p-8 rounded-2xl grid gap-4">
      <input placeholder="Votre nom" style="border-color:${b.colors.neutral}" class="border rounded-lg px-4 py-3" />
      <input placeholder="Email" style="border-color:${b.colors.neutral}" class="border rounded-lg px-4 py-3" />
      <textarea placeholder="Message" rows="4" style="border-color:${b.colors.neutral}" class="border rounded-lg px-4 py-3"></textarea>
      <button type="button" style="background:${b.colors.primary};color:${b.colors.background}" class="py-3 rounded-lg font-bold">Envoyer</button>
    </form>
  </div>
</section>`,
  },
  {
    id: "section_logos_bar",
    category: "section",
    label: "Bandeau logos partenaires",
    render: (b) => `
<section style="background:${b.colors.background};border-top:1px solid ${b.colors.neutral};border-bottom:1px solid ${b.colors.neutral}">
  <div class="max-w-7xl mx-auto px-6 py-12">
    <p style="color:${b.colors.secondary}" class="text-center text-xs uppercase tracking-widest mb-6">Ils nous font confiance</p>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-6 items-center justify-items-center opacity-70">
      ${Array.from({ length: 5 }).map(() => `<div style="background:${b.colors.neutral}" class="h-8 w-24 rounded"></div>`).join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_steps",
    category: "section",
    label: "Processus — 4 étapes numérotées",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-16">Notre méthode</h2>
    <div class="grid md:grid-cols-4 gap-8">
      ${["Écoute", "Cadrage", "Production", "Livraison"].map((s, i) => `<div class="text-center"><div style="background:${b.colors.primary};color:${b.colors.background}" class="mx-auto w-14 h-14 rounded-full flex items-center justify-center font-black text-lg">${i + 1}</div><h3 style="color:${b.colors.primary}" class="mt-4 font-bold text-lg">${s}</h3><p style="color:${b.colors.secondary}" class="mt-2 text-sm">Une étape claire avec des livrables définis.</p></div>`).join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_team",
    category: "section",
    label: "Équipe — 4 profils",
    render: (b) => `
<section style="background:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-24">
    <h2 style="color:${b.colors.primary}" class="text-4xl font-bold text-center mb-12">Notre équipe</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
      ${["Léa", "Marc", "Sofia", "Karim"].map((n, i) => `<div class="text-center"><div style="background:linear-gradient(${i * 90}deg,${b.colors.primary},${b.colors.accent})" class="aspect-square rounded-2xl mb-3"></div><h3 style="color:${b.colors.primary}" class="font-bold">${n}</h3><p style="color:${b.colors.secondary}" class="text-sm">Directeur artistique</p></div>`).join("")}
    </div>
  </div>
</section>`,
  },
  {
    id: "section_newsletter",
    category: "section",
    label: "Newsletter — Bloc inscription",
    render: (b) => `
<section style="background:${b.colors.primary};color:${b.colors.background}">
  <div class="max-w-3xl mx-auto px-6 py-20 text-center">
    <h2 class="text-3xl font-bold">Restons en contact</h2>
    <p class="mt-3 opacity-80">Une newsletter mensuelle, sans spam.</p>
    <form class="mt-8 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
      <input placeholder="votre@email.com" style="color:${b.colors.primary};background:${b.colors.background}" class="flex-1 rounded-lg px-4 py-3" />
      <button type="button" style="background:${b.colors.accent};color:${b.colors.primary}" class="px-6 py-3 rounded-lg font-bold">S'inscrire</button>
    </form>
  </div>
</section>`,
  },
];

// =========================================================
// FOOTERS
// =========================================================

const FOOTERS: ThemeComponent[] = [
  {
    id: "footer_simple",
    category: "footer",
    label: "Footer 1 — Simple une ligne",
    render: (b) => `
<footer style="background:${b.colors.primary};color:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm">
    <div class="flex items-center gap-3">${logo(b, 28)}<span class="font-bold">${b.brand_name}</span></div>
    <p class="opacity-70">© ${new Date().getFullYear()} ${b.brand_name}. Tous droits réservés.</p>
    <div class="flex gap-4 opacity-80"><a href="#">Mentions</a><a href="#">Confidentialité</a></div>
  </div>
</footer>`,
  },
  {
    id: "footer_columns",
    category: "footer",
    label: "Footer 2 — Complet 4 colonnes",
    render: (b) => `
<footer style="background:${b.colors.primary};color:${b.colors.background}">
  <div class="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-8">
    <div>
      <div class="flex items-center gap-3">${logo(b, 32)}<span class="font-black text-lg">${b.brand_name}</span></div>
      <p class="mt-4 opacity-70 text-sm">${b.tagline || "Une signature moderne et engagée."}</p>
    </div>
    ${[
      ["Produit", ["Fonctionnalités", "Tarifs", "Roadmap"]],
      ["Ressources", ["Blog", "Documentation", "Support"]],
      ["Entreprise", ["À propos", "Carrières", "Contact"]],
    ]
      .map(([t, items]) => `<div><h4 class="font-bold mb-4">${t}</h4><ul class="space-y-2 text-sm opacity-80">${(items as string[]).map((i) => `<li><a href="#" class="hover:opacity-100">${i}</a></li>`).join("")}</ul></div>`)
      .join("")}
  </div>
  <div style="border-top:1px solid ${b.colors.background}30" class="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-xs opacity-70">
    <p>© ${new Date().getFullYear()} ${b.brand_name}</p>
    <div class="flex gap-4"><a href="#">Mentions</a><a href="#">CGV</a><a href="#">Confidentialité</a></div>
  </div>
</footer>`,
  },
  {
    id: "footer_center_bold",
    category: "footer",
    label: "Footer 3 — Centré XL avec CTA",
    render: (b) => `
<footer style="background:${b.colors.background};border-top:1px solid ${b.colors.neutral}">
  <div class="max-w-4xl mx-auto px-6 py-20 text-center">
    <div class="flex items-center justify-center gap-3">${logo(b, 40)}<span style="color:${b.colors.primary}" class="text-2xl font-black">${b.brand_name}</span></div>
    <p style="color:${b.colors.secondary}" class="mt-6 max-w-lg mx-auto">${b.tagline || "Restez connectés. Suivez nos actualités."}</p>
    <div class="mt-8 flex justify-center gap-4">
      ${["Facebook", "Instagram", "LinkedIn"].map((s) => `<a href="#" style="border-color:${b.colors.neutral};color:${b.colors.primary}" class="w-10 h-10 rounded-full border flex items-center justify-center">${s[0]}</a>`).join("")}
    </div>
    <p style="color:${b.colors.secondary}" class="mt-10 text-xs">© ${new Date().getFullYear()} ${b.brand_name}. Fait avec soin.</p>
  </div>
</footer>`,
  },
];

// =========================================================
// Registry
// =========================================================

export const THEME_COMPONENTS: ThemeComponent[] = [
  ...HEADERS,
  ...HEROES,
  ...SECTIONS,
  ...FOOTERS,
];

export const THEME_BY_ID: Record<string, ThemeComponent> = Object.fromEntries(
  THEME_COMPONENTS.map((c) => [c.id, c]),
);

export function componentsByCategory(cat: ThemeCategory): ThemeComponent[] {
  return THEME_COMPONENTS.filter((c) => c.category === cat);
}

/**
 * Rendu du HTML final pour un composant, en tenant compte d'un éventuel
 * override HTML (renvoyé par le chat IA).
 */
export function renderComponent(
  id: string,
  brand: BrandCtx,
  overrides?: Record<string, string>,
): string {
  if (overrides?.[id]) return overrides[id];
  const c = THEME_BY_ID[id];
  if (!c) return "";
  return c.render(brand);
}

/**
 * Assemble l'ossature HTML complète de la home à partir des composants
 * sélectionnés.
 */
export function assembleHomeHtml(
  selection: {
    header?: string;
    hero?: string;
    sections?: string[];
    footer?: string;
  },
  brand: BrandCtx,
  overrides?: Record<string, string>,
): string {
  const parts: string[] = [];
  if (selection.header) parts.push(renderComponent(selection.header, brand, overrides));
  if (selection.hero) parts.push(renderComponent(selection.hero, brand, overrides));
  for (const id of selection.sections ?? []) {
    parts.push(renderComponent(id, brand, overrides));
  }
  if (selection.footer) parts.push(renderComponent(selection.footer, brand, overrides));
  return parts.filter(Boolean).join("\n");
}

/** Wrap un HTML dans un document complet avec Tailwind CDN pour aperçu iframe. */
export function wrapPreviewDoc(html: string, background = "#ffffff"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><style>body{margin:0;background:${background};font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}</style></head><body>${html}</body></html>`;
}
