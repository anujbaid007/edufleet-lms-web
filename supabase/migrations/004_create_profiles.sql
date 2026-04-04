CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'student',
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  centre_id uuid REFERENCES public.centres(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  class integer,
  board text,
  medium text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_class CHECK (class IS NULL OR (class >= 0 AND class <= 12))
);

CREATE INDEX idx_profiles_org ON public.profiles (org_id);
CREATE INDEX idx_profiles_centre ON public.profiles (centre_id);
CREATE INDEX idx_profiles_teacher ON public.profiles (teacher_id);
CREATE INDEX idx_profiles_role ON public.profiles (role);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase auth — stores role, org, centre, class info';
COMMENT ON COLUMN public.profiles.teacher_id IS 'Links students to their teacher/batch. NULL for non-students.';
COMMENT ON COLUMN public.profiles.class IS '0 = KG, 1-12 = Class 1-12. NULL for admins.';

-- Auto-create profile on signup (triggered by Supabase auth)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
