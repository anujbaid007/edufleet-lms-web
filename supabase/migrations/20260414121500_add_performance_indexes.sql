CREATE INDEX IF NOT EXISTS idx_chapters_scope
ON public.chapters (class, board, medium, subject_id, chapter_no);

CREATE INDEX IF NOT EXISTS idx_chapter_quizzes_chapter_published
ON public.chapter_quizzes (chapter_id, is_published);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_quiz_completed
ON public.quiz_attempts (user_id, quiz_id, completed_at DESC);
