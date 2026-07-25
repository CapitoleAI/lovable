
## Résultat visuel

```text
┌─────────────────────────────────────────────────────────────────┐
│ [logo]  Site: "Plombier Toulouse ▾"      [Publier] [Déconnexion]│
├──────────────┬──────────────────────────────────────────────────┤
│              │ [ Live Preview | Arborescence | Analytics ]       │
│  💬 CHAT     │                                                  │
│              │  ┌────────────────────────────────────────────┐  │
│  historique  │  │                                            │  │
│  messages    │  │        contenu de l'onglet actif           │  │
│              │  │                                            │  │
│              │  └────────────────────────────────────────────┘  │
│  [input _]   │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
       w-96                              flex-1
```

Deux modes du panneau droit selon l'état :

- **Aucun site sélectionné → mode Création** : le panneau droit affiche les étapes (Brief → Identité → SEO → Sitemap → Génération), le chat les remplit au fil de la conversation ; à la fin, bascule auto sur Live Preview.
- **Site sélectionné → mode Édition** : onglets Live Preview / Arborescence / Analytics. Le chat modifie le site en cours.

## Architecture

### 1. Nouveau layout — `src/routes/dashboard.tsx`

Refonte : `h-screen w-full flex overflow-hidden`. Panneau gauche `w-96 border-r bg-white` = chat. Panneau droit `flex-1 bg-muted/30` = workspace. La sidebar shadcn actuelle disparaît ; sa liste de sites migre en dropdown "Site actif" dans le header. Le bouton "Créer" devient un item "+ Nouveau site" dans ce dropdown → passe en mode création.

### 2. Chat orchestrateur — `src/components/workspace-chat.tsx` + `src/routes/api/chat.ts`

- UI : AI SDK `useChat` + AI Elements (`Conversation`, `Message`, `PromptInput`). Persistance mémoire par site (in-memory, pas de threads DB — un site = une conversation).
- Backend : nouveau server route `src/routes/api/chat.ts` avec `streamText` + `tools` (function calling structuré) :
  - `update_brand_colors({ primary, secondary, accent, ... })` → patch `brand.colors`
  - `set_design_style({ style })`, `set_header_style`, `set_footer_style`, `toggle_content_section`
  - `add_page({ title, slug })` / `remove_page({ slug })` / `rename_page`
  - `update_page_content({ slug, instruction })` → régénère via `generatePageContentServer`
  - `set_wizard_step({ step, values })` en mode création
  - `trigger_publish()` en mode édition
- Le client applique les résultats sur un state local `siteDraft`, ce qui rafraîchit Live Preview et Arborescence instantanément. Rien n'est persisté avant "Publier".

### 3. Panneau droit — `src/components/workspace-right.tsx`

- Composant qui switch entre `<CreateFlow />` (mode création) et `<EditTabs />` (mode édition).
- `EditTabs` = `Tabs` shadcn avec 3 valeurs.

#### 3a. Onglet Live Preview — `src/components/live-preview-panel.tsx`
Iframe plein cadre avec `srcDoc` reconstruit à partir du `siteDraft.pages` en cours. Sélecteur de page (chips) en haut. Bouton "Rafraîchir".

#### 3b. Onglet Arborescence — `src/components/sitemap-panel.tsx`
Liste des pages avec drag & drop (`@dnd-kit/sortable` déjà utilisé), boutons Ajouter / Supprimer / Renommer. Les changements modifient `siteDraft` localement.

#### 3c. Onglet Analytics — `src/components/analytics-panel.tsx`
Cartes : Requêtes 24h / 7j, Visiteurs uniques, Bande passante, Top pages. Alimenté par `getCloudflareAnalytics` (voir §5).

### 4. Bouton Publier

Header : `<Button onClick={publish}>Publier</Button>` visible uniquement en mode édition avec `siteDraft !== savedSite`. Appelle `updateSite({ id, pages, brand })` (déjà existant, déclenche rebuild) puis toast + reset du dirty flag.

### 5. Analytics Cloudflare — `src/lib/sites.functions.ts`

Nouvelle server function `getCloudflareAnalytics({ id })` :
- Récupère `project_name` Cloudflare Pages du site (déduit du domaine ou stocké).
- Appelle l'API GraphQL Analytics de Cloudflare : `POST https://api.cloudflare.com/client/v4/graphql` avec le dataset `pagesFunctionsInvocationsAdaptiveGroups` et `httpRequestsAdaptiveGroups` (filtre `zoneTag` = zone du domaine `.pages.dev` ou domaine custom).
- Retourne `{ requests_24h, requests_7d, unique_visitors_7d, bandwidth_bytes_7d, top_paths: [{path, count}] }`.
- Fallback propre : si l'API renvoie 0 ou une erreur d'autorisation (le token doit avoir `Zone:Analytics:Read`), l'onglet affiche un état vide avec le message d'erreur.

### 6. State management

`useSiteWorkspace(siteId)` — hook local dans dashboard :
- Charge le site depuis la query `sites`.
- Maintient `siteDraft` (copie mutable).
- Expose des mutateurs typés exposés au chat via callbacks (l'API `/api/chat` renvoie les tool calls que le client applique).
- `isDirty` = comparaison superficielle draft vs saved.

### 7. Nettoyage

- `dashboard-sidebar.tsx` supprimé.
- `edit-site-dialog.tsx` et `site-detail-dialog.tsx` supprimés (leurs fonctionnalités migrent dans les onglets).
- `create-site-dialog.tsx` : contenu recyclé en `<CreateFlow />` (mêmes étapes, mais rendues à droite, plus dans un Dialog).
- `build-progress-dialog.tsx` : conservé, se déclenche automatiquement à la fin de la création.

## Détails techniques

- **Function calling** : `streamText` du package `ai` déjà installé (voir `tanstack-ai-chat`). Modèle par défaut `openai/gpt-5.5` via Lovable AI Gateway. Reasoning `none`. Chaque tool a un schéma Zod ; le client reçoit les tool results dans `message.parts` et les applique au draft.
- **Publication** : réutilise `updateSite` existante qui rappelle `triggerRunner` — pas de changement backend côté GitHub.
- **Analytics Cloudflare** : nécessite que le token `CF_API_TOKEN` (déjà présent) ait la permission `Account.Account Analytics:Read` + `Zone.Analytics:Read`. Si le token actuel ne les a pas, l'onglet affichera l'erreur `403` retournée par Cloudflare et je te dirai quelle permission ajouter.
- **Aucune migration DB** nécessaire ; tout passe par les tables existantes.
- **AI Elements** : installation `bunx ai-elements@latest add conversation message prompt-input shimmer`.

## Ce qui n'est PAS inclus (pour rester dans le scope)

- Pas de persistance des messages du chat entre reloads (in-memory par session).
- Pas de gestion multi-utilisateurs / threads.
- Pas de tests automatisés.

## Après ton OK

J'exécute en une passe : install AI Elements → refonte dashboard + composants → `/api/chat` + tools → `getCloudflareAnalytics` → suppressions → typecheck. Puis je te donne un récap court.
