-- ============================================================
-- Add online/offline mode to centres
-- Offline centres track class-wise student counts instead of
-- individual student accounts (used for Android TV pen drive setup)
-- ============================================================

ALTER TABLE public.centres
ADD COLUMN mode text NOT NULL DEFAULT 'online'
  CONSTRAINT valid_centre_mode CHECK (mode IN ('online', 'offline'));

-- Class-wise student counts for offline centres
-- Format: {"0": 15, "1": 20, "10": 30} where keys are class numbers (0=KG, 1-12)
ALTER TABLE public.centres
ADD COLUMN offline_student_counts jsonb;

CREATE INDEX idx_centres_mode ON public.centres (mode);

COMMENT ON COLUMN public.centres.mode IS 'online = students have individual accounts; offline = pen drive based, student counts tracked at centre level';
COMMENT ON COLUMN public.centres.offline_student_counts IS 'Class-wise student counts for offline centres. Keys are class numbers (0=KG, 1-12), values are counts.';
