-- ============================================================
-- Helper: get current user's profile
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_centre_id()
RETURNS uuid AS $$
  SELECT centre_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_orgs" ON public.organizations
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_read_own_org" ON public.organizations
  FOR SELECT USING (
    public.current_user_role() = 'org_admin'
    AND id = public.current_user_org_id()
  );

CREATE POLICY "member_read_own_org" ON public.organizations
  FOR SELECT USING (
    public.current_user_role() IN ('centre_admin', 'teacher', 'student')
    AND id = public.current_user_org_id()
  );

-- ============================================================
-- CENTRES
-- ============================================================

ALTER TABLE public.centres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_centres" ON public.centres
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_manage_centres" ON public.centres
  FOR ALL USING (
    public.current_user_role() = 'org_admin'
    AND org_id = public.current_user_org_id()
  );

CREATE POLICY "centre_admin_read_own_centre" ON public.centres
  FOR SELECT USING (
    public.current_user_role() = 'centre_admin'
    AND id = public.current_user_centre_id()
  );

CREATE POLICY "member_read_own_centre" ON public.centres
  FOR SELECT USING (
    public.current_user_role() IN ('teacher', 'student')
    AND id = public.current_user_centre_id()
  );

-- ============================================================
-- PROFILES
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_profiles" ON public.profiles
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_manage_org_profiles" ON public.profiles
  FOR ALL USING (
    public.current_user_role() = 'org_admin'
    AND org_id = public.current_user_org_id()
  );

CREATE POLICY "centre_admin_manage_centre_profiles" ON public.profiles
  FOR ALL USING (
    public.current_user_role() = 'centre_admin'
    AND centre_id = public.current_user_centre_id()
  );

CREATE POLICY "teacher_read_own_and_students" ON public.profiles
  FOR SELECT USING (
    public.current_user_role() = 'teacher'
    AND (id = auth.uid() OR teacher_id = auth.uid())
  );

CREATE POLICY "teacher_update_own" ON public.profiles
  FOR UPDATE USING (
    public.current_user_role() = 'teacher'
    AND id = auth.uid()
  );

CREATE POLICY "student_own_profile" ON public.profiles
  FOR SELECT USING (
    public.current_user_role() = 'student'
    AND id = auth.uid()
  );

CREATE POLICY "student_update_own" ON public.profiles
  FOR UPDATE USING (
    public.current_user_role() = 'student'
    AND id = auth.uid()
  );

-- ============================================================
-- SUBJECTS (read-only for all authenticated users)
-- ============================================================

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_subjects" ON public.subjects
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "authenticated_read_subjects" ON public.subjects
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- CHAPTERS
-- ============================================================

ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_chapters" ON public.chapters
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "authenticated_read_chapters" ON public.chapters
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- VIDEOS
-- ============================================================

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_videos" ON public.videos
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "authenticated_read_videos" ON public.videos
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- VIDEO_PROGRESS
-- ============================================================

ALTER TABLE public.video_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_read_all_progress" ON public.video_progress
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_read_org_progress" ON public.video_progress
  FOR SELECT USING (
    public.current_user_role() = 'org_admin'
    AND user_id IN (
      SELECT id FROM public.profiles WHERE org_id = public.current_user_org_id()
    )
  );

CREATE POLICY "centre_admin_read_centre_progress" ON public.video_progress
  FOR SELECT USING (
    public.current_user_role() = 'centre_admin'
    AND user_id IN (
      SELECT id FROM public.profiles WHERE centre_id = public.current_user_centre_id()
    )
  );

CREATE POLICY "teacher_read_own_and_students_progress" ON public.video_progress
  FOR SELECT USING (
    public.current_user_role() = 'teacher'
    AND (
      user_id = auth.uid()
      OR user_id IN (SELECT id FROM public.profiles WHERE teacher_id = auth.uid())
    )
  );

CREATE POLICY "user_upsert_own_progress" ON public.video_progress
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_update_own_progress" ON public.video_progress
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "student_read_own_progress" ON public.video_progress
  FOR SELECT USING (
    public.current_user_role() = 'student'
    AND user_id = auth.uid()
  );

-- ============================================================
-- CONTENT_RESTRICTIONS
-- ============================================================

ALTER TABLE public.content_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_restrictions" ON public.content_restrictions
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_manage_own_restrictions" ON public.content_restrictions
  FOR ALL USING (
    public.current_user_role() = 'org_admin'
    AND org_id = public.current_user_org_id()
  );

CREATE POLICY "authenticated_read_restrictions" ON public.content_restrictions
  FOR SELECT USING (auth.uid() IS NOT NULL);
