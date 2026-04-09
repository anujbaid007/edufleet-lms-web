"use server";

import { createClient } from "@/lib/supabase/server";
import { getQuizMasteryLevel, isQuizSchemaUnavailableError } from "@/lib/quiz";
import { loadFallbackQuiz, saveFallbackQuizAttempt } from "@/lib/dev-quiz-fallback";

type SubmittedAnswer = {
  questionId: string;
  selectedOption: number | null;
};

export async function submitChapterQuizAttempt(
  quizId: string,
  answers: SubmittedAnswer[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("class, board, medium, org_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { error: profileError?.message ?? "Profile not found" };
  }

  if (quizId.startsWith("fallback:")) {
    const chapterId = quizId.replace(/^fallback:/, "");
    const { data: chapterRow, error: chapterError } = await supabase
      .from("chapters")
      .select("id, class, board, medium, chapter_no, title, title_hindi, subjects(name)")
      .eq("id", chapterId)
      .single();

    if (chapterError || !chapterRow) {
      return { error: chapterError?.message ?? "Quiz chapter not found" };
    }

    const subjectMeta = Array.isArray(chapterRow.subjects) ? chapterRow.subjects[0] : chapterRow.subjects;
    const fallbackQuiz = await loadFallbackQuiz({
      id: chapterRow.id,
      class: chapterRow.class,
      medium: chapterRow.medium,
      chapterNo: chapterRow.chapter_no,
      title: chapterRow.title,
      titleHindi: chapterRow.title_hindi,
      subjectName: subjectMeta?.name ?? "",
    });

    if (!fallbackQuiz) {
      return { error: "Quiz is not available for this chapter yet" };
    }

    if (profile.class !== null && chapterRow.class !== profile.class) {
      return { error: "Quiz is not available for your class" };
    }
    if (profile.board && chapterRow.board !== profile.board) {
      return { error: "Quiz is not available for your board" };
    }
    if (profile.medium && chapterRow.medium !== profile.medium) {
      return { error: "Quiz is not available for your medium" };
    }

    if (profile.org_id) {
      const { data: restriction } = await supabase
        .from("content_restrictions")
        .select("id")
        .eq("org_id", profile.org_id)
        .eq("chapter_id", chapterRow.id)
        .maybeSingle();

      if (restriction) {
        return { error: "Quiz is not available for your organization" };
      }
    }

    const answerMap = new Map(
      answers.map((answer) => [
        answer.questionId,
        answer.selectedOption !== null && answer.selectedOption >= 1 && answer.selectedOption <= 4
          ? answer.selectedOption
          : null,
      ])
    );

    const totalQuestions = fallbackQuiz.questions.length;
    const correctAnswers = fallbackQuiz.questions.reduce((sum, question) => {
      return sum + (answerMap.get(question.id) === question.correctOption ? 1 : 0);
    }, 0);
    const percent = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

    const attempt = await saveFallbackQuizAttempt({
      quizId,
      chapterId: chapterRow.id,
      userId: user.id,
      answers: fallbackQuiz.questions.map((question) => {
        const selectedOption = answerMap.get(question.id) ?? null;
        return {
          questionId: question.id,
          selectedOption,
          isCorrect: selectedOption === question.correctOption,
        };
      }),
      correctAnswers,
      totalQuestions,
      percent,
    });

    return {
      success: true,
      attempt: {
        id: attempt.id,
        percent: attempt.percent,
        correctAnswers: attempt.correctAnswers,
        totalQuestions: attempt.totalQuestions,
        masteryLevel: attempt.masteryLevel,
        completedAt: attempt.completedAt,
      },
    };
  }

  const { data: quizRow, error: quizError } = await supabase
    .from("chapter_quizzes")
    .select("id, chapter_id, chapters(id, class, board, medium, title)")
    .eq("id", quizId)
    .eq("is_published", true)
    .single();

  if (quizError || !quizRow) {
    if (isQuizSchemaUnavailableError(quizError)) {
      return { error: "Quizzes are being enabled for your LMS. Please try again shortly." };
    }
    return { error: quizError?.message ?? "Quiz not found" };
  }

  const chapter = Array.isArray(quizRow.chapters) ? quizRow.chapters[0] : quizRow.chapters;
  if (!chapter) {
    return { error: "Quiz chapter not found" };
  }

  if (profile.class !== null && chapter.class !== profile.class) {
    return { error: "Quiz is not available for your class" };
  }
  if (profile.board && chapter.board !== profile.board) {
    return { error: "Quiz is not available for your board" };
  }
  if (profile.medium && chapter.medium !== profile.medium) {
    return { error: "Quiz is not available for your medium" };
  }

  if (profile.org_id) {
    const { data: restriction } = await supabase
      .from("content_restrictions")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("chapter_id", chapter.id)
      .maybeSingle();

    if (restriction) {
      return { error: "Quiz is not available for your organization" };
    }
  }

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, correct_option")
    .eq("quiz_id", quizId)
    .order("sort_order");

  if (questionsError) {
    if (isQuizSchemaUnavailableError(questionsError)) {
      return { error: "Quiz questions are still syncing. Please try again shortly." };
    }
    return { error: questionsError.message };
  }

  if (!questions || questions.length === 0) {
    return { error: "Quiz questions are not available yet" };
  }

  const answerMap = new Map(
    answers.map((answer) => [
      answer.questionId,
      answer.selectedOption !== null && answer.selectedOption >= 1 && answer.selectedOption <= 4
        ? answer.selectedOption
        : null,
    ])
  );

  const totalQuestions = questions.length;
  const correctAnswers = questions.reduce((sum, question) => {
    return sum + (answerMap.get(question.id) === question.correct_option ? 1 : 0);
  }, 0);
  const percent = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const masteryLevel = getQuizMasteryLevel(percent);

  const now = new Date().toISOString();

  const { data: attempt, error: attemptError } = await supabase
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      user_id: user.id,
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      percent,
      mastery_level: masteryLevel,
      started_at: now,
      completed_at: now,
    })
    .select("id, percent, correct_answers, total_questions, mastery_level, completed_at")
    .single();

  if (attemptError || !attempt) {
    if (isQuizSchemaUnavailableError(attemptError)) {
      return { error: "Quiz results could not be saved right now. Please try again shortly." };
    }
    return { error: attemptError?.message ?? "Failed to save quiz attempt" };
  }

  const answerRows = questions.map((question) => {
    const selectedOption = answerMap.get(question.id) ?? null;
    return {
      attempt_id: attempt.id,
      question_id: question.id,
      selected_option: selectedOption,
      is_correct: selectedOption === question.correct_option,
    };
  });

  const { error: answersError } = await supabase
    .from("quiz_attempt_answers")
    .insert(answerRows);

  if (answersError) {
    if (isQuizSchemaUnavailableError(answersError)) {
      return { error: "Quiz answers could not be saved right now. Please try again shortly." };
    }
    return { error: answersError.message };
  }

  return {
    success: true,
    attempt: {
      id: attempt.id,
      percent: attempt.percent,
      correctAnswers: attempt.correct_answers,
      totalQuestions: attempt.total_questions,
      masteryLevel: attempt.mastery_level,
      completedAt: attempt.completed_at,
    },
  };
}
