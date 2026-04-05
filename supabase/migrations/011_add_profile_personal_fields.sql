ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.phone IS 'Optional phone number for the user profile.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Selected avatar id for the user profile.';
