-- ============================================================
-- AI_VIDEO_NOTES
-- Stores transcript/summary knowledge that Miss Asha can use for tutoring.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_video_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'English',
  summary text,
  key_points text,
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, language)
);

CREATE INDEX IF NOT EXISTS ai_video_notes_video_id_idx ON public.ai_video_notes(video_id);

ALTER TABLE public.ai_video_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_video_notes'
      AND policyname = 'platform_admin_all_ai_video_notes'
  ) THEN
    CREATE POLICY "platform_admin_all_ai_video_notes" ON public.ai_video_notes
      FOR ALL USING (public.current_user_role() = 'platform_admin');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_video_notes'
      AND policyname = 'authenticated_read_accessible_ai_video_notes'
  ) THEN
    CREATE POLICY "authenticated_read_accessible_ai_video_notes" ON public.ai_video_notes
      FOR SELECT USING (
        auth.uid() IS NOT NULL
        AND video_id IN (
          SELECT videos.id
          FROM public.videos
          JOIN public.chapters ON chapters.id = videos.chapter_id
          JOIN public.profiles ON profiles.id = auth.uid()
          WHERE chapters.class = profiles.class
            AND chapters.board = COALESCE(profiles.board, 'CBSE')
            AND chapters.medium = COALESCE(profiles.medium, 'English')
            AND NOT EXISTS (
              SELECT 1
              FROM public.content_restrictions
              WHERE content_restrictions.chapter_id = chapters.id
                AND content_restrictions.org_id = profiles.org_id
            )
        )
      );
  END IF;
END $$;
