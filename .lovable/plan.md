
## Objectif

Le mode Création passe du Dialog superposé à une vue inline dans le panneau droit, orchestrée par le chat de gauche via function calling.

## Résultat visuel

```text
Mode ÉDITION (existant)                    Mode CRÉATION (nouveau)
┌────────┬────────────────────────┐        ┌────────┬────────────────────────┐
│        │ [Preview│Sitemap│Analytics]      │        │ Stepper: ● Brief > Studio > SEO > Arbo    │
│ CHAT   │                        │        │ CHAT   │                        │
│ édit   │  contenu onglets       │        │ créa   │  wizard inline plein   │
│        │                        │        │        │  cadre (étape active)  │
└────────┴────────────────────────┘        └────────┴────────────────────────┘
```

## Changements

### 1. Suppression du Dialog
- `src/components/create-site-dialog.tsx` → renommé `src/components/creation-wizard.tsx`. Retire `<Dialog>/<DialogContent>`, expose `<CreationWizard state onChange onLaunched />`.
- L'état du wizard (brief, brand, mots-clés, sitemap, phase de lancement) remonte dans `dashboard.tsx` (`creationDraft`) pour que le chat puisse le muter.
- Suppression du chat interne de l'étape 2 (dupliqué avec celui de gauche) et de `BuildProgressDialog` déclenché depuis le wizard (le mode Édition prend le relais).

### 2. Nouveau mode dashboard
- `dashboard.tsx` : ajoute `mode: "edit" | "create"` (dérivé : `activeId ? edit : create` si `creationDraft` existe, sinon `empty`).
- Dropdown « + Nouveau site » → `setCreationDraft({ step: 1, brief: {}, brand: null, seo: {}, sitemap: [] })` + `setActiveId(null)`.
- Panneau droit : si `mode==="create"` → `<CreationWizard>` en plein cadre (pas de Tabs, pas de bouton Publier), sinon les onglets actuels.
- Après `finalize_and_build` réussi → `setActiveId(newSiteId)` + `setCreationDraft(null)` → bascule automatique en mode Édition + Live Preview.

### 3. Orchestrateur enrichi (`src/lib/orchestrator.functions.ts`)
- Nouveau mode `"create"` dans `orchestrateSchema` avec `creation_context: { step, brief, brand, seo, sitemap }`.
- 4 nouvelles actions structurées :
  - `advance_to_brand_studio({ name?, theme?, city?, brief?, hint_colors? })` → écrit le brief, lance `generateBrandIdentity` côté serveur, retourne `{ brand, logo_prompt }` dans l'action pour que le client mette à jour `creationDraft.brand` et passe à l'étape 2.
  - `update_creation_theme({ colors?, selected_header_id?, selected_hero_id?, selected_section_ids?, selected_footer_id?, design_style? })` → patch partiel de `creationDraft.brand`.
  - `generate_seo_and_tree({ main_keyword?, keywords?, sitemap? })` → optionnellement appelle `suggestKeywords` / `suggestSitemap` si absents, passe à l'étape 3 puis 4.
  - `finalize_and_build()` → client déclenche `createSite` avec tout le draft.
- Prompt système "création" : posture directeur d'agence, interview étape par étape, appelle les actions au fil de la conversation.

### 4. Chat (`workspace-chat.tsx`)
- Ajoute mode `"create"`, passe `creation_context` à l'orchestrateur.
- Nouveau `onCreationAction` sur le parent qui applique les 4 actions au `creationDraft`.
- Empty state création : « Racontez-moi votre projet : activité, ville, ambiance visuelle… »

### 5. Nettoyage
- Retire `<BuildProgressDialog>` du dashboard (statut visible via badge header + section « Build en cours » existante côté édition).
- Retire l'entrée « Nouveau site » qui ouvrait un Dialog ; le clic active désormais le mode création.

## Points techniques

- **Actions retournant du contenu** : l'orchestrateur exécute côté serveur `generateBrandIdentity` / `suggestKeywords` / `suggestSitemap` puis embarque le résultat dans l'action renvoyée au client — pas de round-trip supplémentaire.
- **Persistance** : rien n'est sauvegardé avant `finalize_and_build`. `creationDraft` vit dans `useState` du dashboard.
- **Types** : nouveau discriminated union étendu, `OrchestratorAction` couvre les 9 types (5 existants + 4 création).
- **Focus visuel** : le stepper du wizard reste barre horizontale en tête du panneau droit ; les étapes 1–4 sont toujours accessibles au clic (fallback si l'utilisateur ne veut pas passer par le chat), mais le chat peut les faire toutes.
- **Build phase** : quand `finalize_and_build` s'achève, `setActiveId(siteId) + setCreationDraft(null)` déclenche le rendu du mode Édition ; la section « Build en cours » existante prend le relais avec `SiteBuildProgress`.

## Non inclus

- Pas de tests automatisés.
- L'étape 2 conserve le Theme Builder visuel actuel ; le chat pilote la sélection (`selected_*_id`) mais l'utilisateur peut aussi cliquer.
- Le prompt système création reste en français et suit un scénario linéaire (Brief → Studio → SEO → Arbo → Build). Pas encore d'aller-retour arbitraire entre étapes via chat au-delà de patches sur l'étape courante.

Après ton OK j'exécute tout en une passe puis typecheck.
