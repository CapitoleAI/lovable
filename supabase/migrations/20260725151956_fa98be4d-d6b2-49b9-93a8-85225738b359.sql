CREATE TABLE public.system_prompts (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.system_prompts TO service_role;
ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER set_system_prompts_updated_at
BEFORE UPDATE ON public.system_prompts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();