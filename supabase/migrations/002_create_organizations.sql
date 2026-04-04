CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.org_type NOT NULL,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_organizations_active ON public.organizations (is_active) WHERE is_active = true;

COMMENT ON TABLE public.organizations IS 'CSR and NGO organizations that partner with EduFleet';
