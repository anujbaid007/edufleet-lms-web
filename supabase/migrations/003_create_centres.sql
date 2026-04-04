CREATE TABLE public.centres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_centres_org ON public.centres (org_id);

COMMENT ON TABLE public.centres IS 'Physical learning centres belonging to an organization';
