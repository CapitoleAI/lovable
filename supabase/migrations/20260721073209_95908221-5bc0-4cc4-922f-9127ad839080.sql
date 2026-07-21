
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email TEXT NOT NULL,
  -- A: Identity & routing
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  hosting_target TEXT NOT NULL CHECK (hosting_target IN ('cloudflare_pages','netlify','vercel','ftp')),
  -- B: SEO
  theme TEXT NOT NULL,
  city TEXT NOT NULL,
  main_keyword TEXT NOT NULL,
  secondary_keywords TEXT[] NOT NULL DEFAULT '{}',
  -- C: Trust
  business_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  -- D: Anti-footprint
  astro_template TEXT NOT NULL CHECK (astro_template IN ('alpha','beta','gamma')),
  color_palette JSONB NOT NULL DEFAULT '{}'::jsonb,
  randomize BOOLEAN NOT NULL DEFAULT true,
  random_seed JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Pipeline
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','building','deploying','deployed','failed')),
  deploy_url TEXT,
  build_log_url TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.sites TO service_role;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
-- No policies: all access goes through server functions using the service role.

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER sites_set_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX sites_owner_email_created_at_idx ON public.sites (owner_email, created_at DESC);
