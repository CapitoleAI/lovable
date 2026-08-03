ALTER TABLE public.app_project_messages
  ADD COLUMN version_id text,
  ADD COLUMN has_file_changes boolean NOT NULL DEFAULT false;