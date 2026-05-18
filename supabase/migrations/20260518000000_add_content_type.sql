-- Add content_type to chapters so NEP Demos can be separated from regular content
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'regular';

COMMENT ON COLUMN public.chapters.content_type IS 'Content category: regular, nep_demo, etc.';
