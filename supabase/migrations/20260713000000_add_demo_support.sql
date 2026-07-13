-- Demo accounts: mark demo profiles and their dedicated org/centre.
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.centres       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_demo      ON public.profiles (is_demo)      WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_organizations_is_demo ON public.organizations (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_centres_is_demo       ON public.centres (is_demo)       WHERE is_demo;

COMMENT ON COLUMN public.profiles.is_demo      IS 'True for demo/prospect accounts created from the admin Demo section.';
COMMENT ON COLUMN public.organizations.is_demo IS 'True for per-client demo organizations; excluded from real Impact Analytics.';
COMMENT ON COLUMN public.centres.is_demo       IS 'True for demo centres (e.g. "Centre A") under a demo organization.';
