CREATE TABLE public.app_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email text NOT NULL,
  name text NOT NULL DEFAULT 'Nouveau projet',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_projects TO service_role;
ALTER TABLE public.app_projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER app_projects_set_updated_at BEFORE UPDATE ON public.app_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.app_project_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_project_messages_project_idx ON public.app_project_messages(project_id, created_at);
GRANT ALL ON public.app_project_messages TO service_role;
ALTER TABLE public.app_project_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.app_project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.app_projects(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_project_versions_project_idx ON public.app_project_versions(project_id, created_at DESC);
GRANT ALL ON public.app_project_versions TO service_role;
ALTER TABLE public.app_project_versions ENABLE ROW LEVEL SECURITY;