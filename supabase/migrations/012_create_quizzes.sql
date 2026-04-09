-- ============================================================
-- CHAPTER_QUIZZES
-- ============================================================

CREATE TABLE public.chapter_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL UNIQUE REFERENCES public.chapters(id) ON DELETE CASCADE,
  source_path text,
  source_medium text,
  source_subject text,
  question_count integer NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chapter_quizzes_chapter_id_idx ON public.chapter_quizzes(chapter_id);

-- ============================================================
-- QUIZ_QUESTIONS
-- ============================================================

CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.chapter_quizzes(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option smallint NOT NULL CHECK (correct_option BETWEEN 1 AND 4),
  difficulty text,
  cognitive_level text,
  source_row integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, sort_order)
);

CREATE INDEX quiz_questions_quiz_id_idx ON public.quiz_questions(quiz_id);

-- ============================================================
-- QUIZ_ATTEMPTS
-- ============================================================

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.chapter_quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_questions integer NOT NULL CHECK (total_questions >= 0),
  correct_answers integer NOT NULL CHECK (correct_answers >= 0),
  percent integer NOT NULL CHECK (percent BETWEEN 0 AND 100),
  mastery_level text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quiz_attempts_quiz_id_idx ON public.quiz_attempts(quiz_id);
CREATE INDEX quiz_attempts_user_id_idx ON public.quiz_attempts(user_id);
CREATE INDEX quiz_attempts_user_quiz_idx ON public.quiz_attempts(user_id, quiz_id);

-- ============================================================
-- QUIZ_ATTEMPT_ANSWERS
-- ============================================================

CREATE TABLE public.quiz_attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  selected_option smallint CHECK (selected_option BETWEEN 1 AND 4),
  is_correct boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX quiz_attempt_answers_attempt_id_idx ON public.quiz_attempt_answers(attempt_id);
CREATE INDEX quiz_attempt_answers_question_id_idx ON public.quiz_attempt_answers(question_id);

-- ============================================================
-- RLS: QUIZ CONTENT
-- ============================================================

ALTER TABLE public.chapter_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_all_chapter_quizzes" ON public.chapter_quizzes
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "authenticated_read_chapter_quizzes" ON public.chapter_quizzes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "platform_admin_all_quiz_questions" ON public.quiz_questions
  FOR ALL USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "authenticated_read_quiz_questions" ON public.quiz_questions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- RLS: QUIZ ATTEMPTS
-- ============================================================

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_read_all_quiz_attempts" ON public.quiz_attempts
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_read_org_quiz_attempts" ON public.quiz_attempts
  FOR SELECT USING (
    public.current_user_role() = 'org_admin'
    AND user_id IN (
      SELECT id FROM public.profiles WHERE org_id = public.current_user_org_id()
    )
  );

CREATE POLICY "centre_admin_read_centre_quiz_attempts" ON public.quiz_attempts
  FOR SELECT USING (
    public.current_user_role() = 'centre_admin'
    AND user_id IN (
      SELECT id FROM public.profiles WHERE centre_id = public.current_user_centre_id()
    )
  );

CREATE POLICY "teacher_read_own_and_students_quiz_attempts" ON public.quiz_attempts
  FOR SELECT USING (
    public.current_user_role() = 'teacher'
    AND (
      user_id = auth.uid()
      OR user_id IN (SELECT id FROM public.profiles WHERE teacher_id = auth.uid())
    )
  );

CREATE POLICY "user_insert_own_quiz_attempts" ON public.quiz_attempts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "student_read_own_quiz_attempts" ON public.quiz_attempts
  FOR SELECT USING (
    public.current_user_role() = 'student'
    AND user_id = auth.uid()
  );

CREATE POLICY "platform_admin_read_all_quiz_attempt_answers" ON public.quiz_attempt_answers
  FOR SELECT USING (public.current_user_role() = 'platform_admin');

CREATE POLICY "org_admin_read_org_quiz_attempt_answers" ON public.quiz_attempt_answers
  FOR SELECT USING (
    public.current_user_role() = 'org_admin'
    AND attempt_id IN (
      SELECT id FROM public.quiz_attempts
      WHERE user_id IN (
        SELECT id FROM public.profiles WHERE org_id = public.current_user_org_id()
      )
    )
  );

CREATE POLICY "centre_admin_read_centre_quiz_attempt_answers" ON public.quiz_attempt_answers
  FOR SELECT USING (
    public.current_user_role() = 'centre_admin'
    AND attempt_id IN (
      SELECT id FROM public.quiz_attempts
      WHERE user_id IN (
        SELECT id FROM public.profiles WHERE centre_id = public.current_user_centre_id()
      )
    )
  );

CREATE POLICY "teacher_read_own_and_students_quiz_attempt_answers" ON public.quiz_attempt_answers
  FOR SELECT USING (
    public.current_user_role() = 'teacher'
    AND attempt_id IN (
      SELECT id FROM public.quiz_attempts
      WHERE user_id = auth.uid()
         OR user_id IN (SELECT id FROM public.profiles WHERE teacher_id = auth.uid())
    )
  );

CREATE POLICY "user_insert_own_quiz_attempt_answers" ON public.quiz_attempt_answers
  FOR INSERT WITH CHECK (
    attempt_id IN (
      SELECT id FROM public.quiz_attempts WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "student_read_own_quiz_attempt_answers" ON public.quiz_attempt_answers
  FOR SELECT USING (
    public.current_user_role() = 'student'
    AND attempt_id IN (
      SELECT id FROM public.quiz_attempts WHERE user_id = auth.uid()
    )
  );
