CREATE TABLE public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  title_hindi text,
  s3_key text NOT NULL,
  s3_key_hindi text,
  duration_seconds integer NOT NULL DEFAULT 0,
  duration_seconds_hindi integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_video_per_chapter UNIQUE (chapter_id, sort_order)
);

CREATE INDEX idx_videos_chapter ON public.videos (chapter_id, sort_order);

COMMENT ON TABLE public.videos IS 'Individual video lessons within a chapter';
COMMENT ON COLUMN public.videos.s3_key IS 'S3 object key for English medium video';
COMMENT ON COLUMN public.videos.s3_key_hindi IS 'S3 object key for Hindi medium video (if available)';
