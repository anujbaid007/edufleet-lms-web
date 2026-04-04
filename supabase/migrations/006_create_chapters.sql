CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class integer NOT NULL,
  board text NOT NULL DEFAULT 'CBSE',
  medium text NOT NULL DEFAULT 'English',
  chapter_no integer NOT NULL,
  title text NOT NULL,
  title_hindi text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT valid_class CHECK (class >= 0 AND class <= 12),
  CONSTRAINT unique_chapter_per_subject UNIQUE (subject_id, class, board, medium, chapter_no)
);

CREATE INDEX idx_chapters_class_board_medium ON public.chapters (class, board, medium);
CREATE INDEX idx_chapters_subject ON public.chapters (subject_id);

COMMENT ON TABLE public.chapters IS 'Chapters within a subject for a specific class/board/medium';
COMMENT ON COLUMN public.chapters.class IS '0 = KG, 1-12 = Class 1-12';
