CREATE TABLE public.content_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_org_chapter UNIQUE (org_id, chapter_id)
);

CREATE INDEX idx_content_restrictions_org ON public.content_restrictions (org_id);

COMMENT ON TABLE public.content_restrictions IS 'Chapters blocked for specific orgs. No row = chapter is accessible.';
