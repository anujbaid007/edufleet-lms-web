-- ============================================================
-- Add multi-class support for teachers and multi-teacher support for students
-- ============================================================

-- Teachers can teach multiple classes (e.g., Class 10, 11, 12) or ALL classes
-- NULL or empty array = ALL classes (no restriction)
ALTER TABLE public.profiles
ADD COLUMN classes integer[];

-- Students can have multiple teachers
-- Replaces the old single teacher_id FK
ALTER TABLE public.profiles
ADD COLUMN teacher_ids uuid[] NOT NULL DEFAULT '{}';

-- Migrate existing teacher_id data to teacher_ids array
UPDATE public.profiles
SET teacher_ids = ARRAY[teacher_id]
WHERE teacher_id IS NOT NULL;

-- Migrate existing class data to classes array for teachers
UPDATE public.profiles
SET classes = ARRAY[class]
WHERE role = 'teacher' AND class IS NOT NULL;

-- Index for querying students by teacher (GIN index for array containment)
CREATE INDEX idx_profiles_teacher_ids ON public.profiles USING GIN (teacher_ids);

-- Index for querying teachers by classes they teach
CREATE INDEX idx_profiles_classes ON public.profiles USING GIN (classes);

COMMENT ON COLUMN public.profiles.classes IS 'Classes a teacher can teach. NULL or empty = ALL classes. Only used for teacher role.';
COMMENT ON COLUMN public.profiles.teacher_ids IS 'Array of teacher IDs assigned to this student. Empty array = no teachers assigned.';

-- ============================================================
-- Update RLS policies that reference teacher_id
-- ============================================================

-- Drop old teacher profile policies
DROP POLICY IF EXISTS "teacher_read_own_and_students" ON public.profiles;

-- Recreate with teacher_ids array support
CREATE POLICY "teacher_read_own_and_students" ON public.profiles
  FOR SELECT USING (
    public.current_user_role() = 'teacher'
    AND (id = auth.uid() OR auth.uid() = ANY(teacher_ids))
  );

-- Drop old teacher video progress policy
DROP POLICY IF EXISTS "teacher_read_own_and_students_progress" ON public.video_progress;

-- Recreate with teacher_ids array support
CREATE POLICY "teacher_read_own_and_students_progress" ON public.video_progress
  FOR SELECT USING (
    public.current_user_role() = 'teacher'
    AND (
      user_id = auth.uid()
      OR user_id IN (SELECT id FROM public.profiles WHERE auth.uid() = ANY(teacher_ids))
    )
  );
