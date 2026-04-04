CREATE TABLE public.video_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  watched_percentage integer NOT NULL DEFAULT 0,
  last_position integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_user_video UNIQUE (user_id, video_id),
  CONSTRAINT valid_percentage CHECK (watched_percentage >= 0 AND watched_percentage <= 100),
  CONSTRAINT valid_position CHECK (last_position >= 0)
);

CREATE INDEX idx_video_progress_user ON public.video_progress (user_id);
CREATE INDEX idx_video_progress_user_recent ON public.video_progress (user_id, last_watched_at DESC);
CREATE INDEX idx_video_progress_video ON public.video_progress (video_id);

COMMENT ON TABLE public.video_progress IS 'Tracks video watch progress for both students and teachers';
COMMENT ON COLUMN public.video_progress.last_position IS 'Playback position in seconds for resume functionality';
COMMENT ON COLUMN public.video_progress.completed IS 'True when watched_percentage >= 90';
