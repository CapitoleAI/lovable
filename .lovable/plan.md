
## Contrainte technique importante à valider avant de coder

Le runtime serveur de Lovable (Cloudflare Worker) **ne peut pas exécuter `astro build`** : pas de `child_process`, pas de système de fichiers réel, pas de binaires natifs. Impossible donc de scaffolder un projet Astro et de lancer un build directement depuis le backend Lovable.

Deux options réalistes pour l'étape "Job de génération + build" :

- **A. Externaliser le build** (recommandé) : Lovable stocke la config du site + la "graine de randomisation", puis appelle un **webhook sortant** (GitHub Actions, un runner Node séparé, ou un service comme Cloudflare Workers Builds / Render / Fly). Ce runner clone un template Astro, injecte la config, exécute `astro build`, puis pousse le `dist/` vers Cloudflare Pages / Netlify / Vercel / FTP. Lovable reçoit ensuite le statut via un webhook retour (`/api/public/deploy-callback`).
- **B. Générer statiquement côté serveur sans Astro** : produire directement du HTML/CSS randomisé depuis un server function (pas de vrai Astro, pas de build). Plus simple mais tu perds l'écosystème Astro et les vraies pages `.astro`.

Je propose **A**. Le plan ci-dessous met en place tout ce qui vit dans Lovable ; le runner externe est décrit à part.

## Ce qui est construit dans Lovable

### 1. Base de données (Lovable Cloud)

Table `sites` (RLS : owner = `auth.uid()`) :

```text
id, owner_id, created_at, updated_at
-- Section A
name, domain, hosting_target        -- 'cloudflare_pages' | 'netlify' | 'vercel' | 'ftp'
-- Section B
theme, city, main_keyword, secondary_keywords (text[])
-- Section C
business_name, phone, email, address
-- Section D
astro_template,                     -- 'alpha' | 'beta' | 'gamma'
color_palette (jsonb),
randomize (bool),
random_seed (jsonb)                 -- {sectionOrder:[...], cssPrefix:'x8k2_', paletteVariant:...}
-- Pipeline
status                              -- 'pending' | 'generating' | 'building' | 'deploying' | 'deployed' | 'failed'
deploy_url, last_error, build_log_url
```

Table `deploy_targets` (URL du webhook de génération/déploiement par cible d'hébergement — permet d'isoler les IPs).

### 2. Formulaire `Créer` (dashboard)

Bouton "Créer" → dialog shadcn en 4 sections (A/B/C/D) avec validation Zod. Soumission :

1. Génère `random_seed` côté client (ordre des sections, préfixe CSS, variante palette) via crypto.
2. Appelle `createSite` (server function, `requireSupabaseAuth`) qui :
   - insère la ligne `sites` avec `status='pending'`,
   - déclenche **de manière non bloquante** le webhook du runner externe (`fetch` vers l'URL stockée pour l'hébergement choisi, signée HMAC avec `ASTRO_RUNNER_SECRET`),
   - retourne immédiatement `{ id, status: 'pending' }`.
3. Le dashboard ferme le dialog et affiche la nouvelle carte avec badge de statut. Un `useQuery` (polling léger 5s tant que status ∈ pending/generating/building/deploying) met à jour la carte.

### 3. Endpoint public de callback

`src/routes/api/public/astro-deploy-callback.ts` (server route) :
- POST signé HMAC (vérif `timingSafeEqual` avec `ASTRO_RUNNER_SECRET`)
- Payload : `{ site_id, status, deploy_url?, error?, build_log_url? }`
- Met à jour la ligne via `supabaseAdmin` (chargé dans le handler).

### 4. UI liste des sites

Chaque carte : nom, domaine, statut coloré, lien `deploy_url` si déployé, bouton "Relancer" (repost webhook), bouton "Voir logs" (ouvre `build_log_url`).

### 5. Secrets

- `ASTRO_RUNNER_SECRET` — généré (HMAC partagé avec le runner).
- Une URL de runner par cible, stockée en base (`deploy_targets`) — configurable via UI plus tard.

## Ce que tu dois fournir (runner externe)

Un endpoint HTTP qui accepte le payload signé et fait :
1. `git clone` d'un template Astro (Alpha/Beta/Gamma).
2. Applique `random_seed` : renomme classes CSS avec `cssPrefix`, réordonne sections, injecte contenu (`.md` / `.astro`).
3. `npm ci && npx astro build`.
4. Zip du `dist/` → push vers Cloudflare Pages / Netlify / Vercel / FTP selon `hosting_target`.
5. POST retour vers `https://project--<id>.lovable.app/api/public/astro-deploy-callback`.

Je peux te fournir un exemple de runner **GitHub Actions** prêt à coller (workflow + script) dans un second temps, mais ce runner ne s'exécute pas dans Lovable.

## Détails techniques

- Stack : TanStack Start, server functions `createServerFn` avec `requireSupabaseAuth`, server route publique pour le callback, RLS sur `sites`.
- Validation Zod client + server (mêmes schémas partagés).
- `randomize` off → `random_seed` reste vide, le runner utilise l'ordre par défaut du template.
- Aucun tracker partagé dans le code généré : c'est une contrainte du **template Astro** dans le runner, pas de Lovable.
- Statuts progressent uniquement via le callback ; aucun état "faux positif" côté UI.

## Confirme

1. OK pour l'approche **A (runner externe déclenché par webhook)** ? Sinon je bascule sur B (générateur HTML pur, sans vrai Astro).
2. Pour démarrer, on commence sans runner branché : le bouton crée la ligne + tente le webhook (échec silencieux → statut `failed` avec message clair). Tu branches le runner quand il est prêt. OK ?
