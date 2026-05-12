-- ============================================================
-- Offline centre analytics — aggregated usage data synced from Android TV app
-- ============================================================

CREATE TABLE public.offline_centre_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id uuid NOT NULL REFERENCES public.centres(id) ON DELETE CASCADE,
  date date NOT NULL,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Video metrics
  video_id uuid REFERENCES public.videos(id) ON DELETE SET NULL,
  play_count integer NOT NULL DEFAULT 0,

  -- Quiz metrics
  quiz_id uuid REFERENCES public.chapter_quizzes(id) ON DELETE SET NULL,
  quiz_attempt_count integer NOT NULL DEFAULT 0,
  quiz_avg_score integer,

  synced_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_daily_video UNIQUE (centre_id, date, teacher_id, video_id),
  CONSTRAINT unique_daily_quiz UNIQUE (centre_id, date, teacher_id, quiz_id)
);

CREATE INDEX idx_offline_analytics_centre ON public.offline_centre_analytics (centre_id);
CREATE INDEX idx_offline_analytics_date ON public.offline_centre_analytics (centre_id, date);
CREATE INDEX idx_offline_analytics_teacher ON public.offline_centre_analytics (teacher_id);

-- Track last sync timestamp per centre
ALTER TABLE public.centres
ADD COLUMN last_offline_sync_at timestamptz;

COMMENT ON TABLE public.offline_centre_analytics IS 'Daily aggregated analytics from Android TV app for offline centres';
COMMENT ON COLUMN public.centres.last_offline_sync_at IS 'When this offline centre last synced data from the Android TV app';

-- RLS: admins can read, service role can write (TV app sync endpoint)
ALTER TABLE public.offline_centre_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_read_all_offline_analytics" ON public.offline_centre_analytics
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_read_own_offline_analytics" ON public.offline_centre_analytics
  FOR SELECT USING (
    public.current_user_role() = 'org_admin'
    AND centre_id IN (SELECT id FROM public.centres WHERE org_id = public.current_user_org_id())
  );

CREATE POLICY "centre_admin_read_own_offline_analytics" ON public.offline_centre_analytics
  FOR SELECT USING (
    public.current_user_role() = 'centre_admin'
    AND centre_id = public.current_user_centre_id()
  );
