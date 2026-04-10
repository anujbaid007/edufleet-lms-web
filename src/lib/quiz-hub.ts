import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getFallbackQuizMeta, listFallbackAttemptsForUserByChapterIds } from "@/lib/dev-quiz-fallback";
import { getQuizMasteryLevel, isQuizSchemaUnavailableError } from "@/lib/quiz";

type AppSupabaseClient = SupabaseClient<Database>;

export type QuizCardData = {
  quizId: string;
  chapterId: string;
  chapterNo: number;
  chapterTitle: string;
  subjectId: string;
  subjectName: string;
  questionCount: number;
  totalVideos: number;
  completedVideos: number;
  lessonProgressPercent: number;
  totalAttempts: number;
  bestAttempt: {
    percent: number;
    correctAnswers: number;
    totalQuestions: number;
    completedAt: string;
  } | null;
};

export type SubjectSection = {
  id: string;
  name: string;
  quizzes: QuizCardData[];
  totalQuizzes: number;
  attemptedQuizzes: number;
  totalAttempts: number;
  masteredQuizzes: number;
  averageQuizScore: number;
  completedVideos: number;
  totalVideos: number;
  lessonProgressPercent: number;
  attemptRate: number;
};

export type QuizHubData = {
  quizCards: QuizCardData[];
  subjectSections: SubjectSection[];
  attemptedQuizzes: number;
  totalAttempts: number;
  masteredQuizzes: number;
  averageQuizScore: number;
};

export function getQuizSubjectHref(subjectId: string) {
  return `/dashboard/quizzes/${subjectId}`;
}

export async function getQuizHubData(supabase: AppSupabaseClient, userId: string): Promise<QuizHubData | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("class, board, medium, org_id")
    .eq("id", userId)
    .single();

  if (!profile) return null;

  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, title, title_hindi, chapter_no, subject_id, subjects(id, name)")
    .eq("class", profile.class ?? 0)
    .eq("board", profile.board ?? "CBSE")
    .eq("medium", profile.medium ?? "English")
    .order("chapter_no");

  let chapters = allChapters ?? [];

  if (profile.org_id) {
    const { data: restrictions } = await supabase
      .from("content_restrictions")
      .select("chapter_id")
      .eq("org_id", profile.org_id);
    const blockedIds = new Set(restrictions?.map((row) => row.chapter_id) ?? []);
    chapters = chapters.filter((chapter) => !blockedIds.has(chapter.id));
  }

  const chapterIds = chapters.map((chapter) => chapter.id);

  const { data: videos } = chapterIds.length > 0
    ? await supabase
        .from("videos")
        .select("id, chapter_id")
        .in("chapter_id", chapterIds)
    : { data: [] };

  const videoIds = videos?.map((video) => video.id) ?? [];
  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, completed")
        .eq("user_id", userId)
        .in("video_id", videoIds)
    : { data: [] };

  const completedVideoIds = new Set((progress ?? []).filter((row) => row.completed).map((row) => row.video_id));

  const { data: quizzes, error: quizzesError } = chapterIds.length > 0
    ? await supabase
        .from("chapter_quizzes")
        .select("id, chapter_id, question_count")
        .eq("is_published", true)
        .in("chapter_id", chapterIds)
    : { data: [] };

  const dbQuizRows = isQuizSchemaUnavailableError(quizzesError) ? [] : quizzes ?? [];
  const dbQuizByChapterId = new Map(dbQuizRows.map((quiz) => [quiz.chapter_id, quiz]));

  const fallbackQuizRows = (
    await Promise.all(
      chapters
        .filter((chapter) => !dbQuizByChapterId.has(chapter.id))
        .map(async (chapter) => {
          const subjectMeta = chapter.subjects as unknown as { id: string; name: string } | null;
          const meta = await getFallbackQuizMeta({
            id: chapter.id,
            class: profile.class ?? 0,
            medium: profile.medium ?? "English",
            chapterNo: chapter.chapter_no,
            title: chapter.title,
            titleHindi: chapter.title_hindi,
            subjectName: subjectMeta?.name ?? "",
          });

          return meta
            ? {
                id: meta.quizId,
                chapter_id: meta.chapterId,
                question_count: meta.questionCount,
              }
            : null;
        })
    )
  ).filter((quiz): quiz is { id: string; chapter_id: string; question_count: number } => Boolean(quiz));

  const quizRows = [...dbQuizRows, ...fallbackQuizRows];
  const dbQuizIds = dbQuizRows.map((quiz) => quiz.id);

  const { data: quizAttempts, error: quizAttemptsError } = dbQuizIds.length > 0
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id, percent, correct_answers, total_questions, completed_at")
        .eq("user_id", userId)
        .in("quiz_id", dbQuizIds)
        .order("completed_at", { ascending: false })
    : { data: [] };

  const fallbackQuizAttempts = fallbackQuizRows.length > 0
    ? await listFallbackAttemptsForUserByChapterIds(
        userId,
        fallbackQuizRows.map((quiz) => quiz.chapter_id)
      )
    : [];

  const quizAttemptRows = [
    ...(isQuizSchemaUnavailableError(quizAttemptsError) ? [] : quizAttempts ?? []),
    ...fallbackQuizAttempts.map((attempt) => ({
      quiz_id: attempt.quizId,
      percent: attempt.percent,
      correct_answers: attempt.correctAnswers,
      total_questions: attempt.totalQuestions,
      completed_at: attempt.completedAt,
    })),
  ].sort((left, right) => right.completed_at.localeCompare(left.completed_at));

  const bestQuizAttemptByQuizId = new Map<
    string,
    {
      percent: number;
      correctAnswers: number;
      totalQuestions: number;
      completedAt: string;
    }
  >();
  const attemptCountByQuizId = new Map<string, number>();

  for (const attempt of quizAttemptRows) {
    attemptCountByQuizId.set(attempt.quiz_id, (attemptCountByQuizId.get(attempt.quiz_id) ?? 0) + 1);
    const existing = bestQuizAttemptByQuizId.get(attempt.quiz_id);
    if (
      !existing ||
      attempt.percent > existing.percent ||
      (attempt.percent === existing.percent && attempt.completed_at > existing.completedAt)
    ) {
      bestQuizAttemptByQuizId.set(attempt.quiz_id, {
        percent: attempt.percent,
        correctAnswers: attempt.correct_answers,
        totalQuestions: attempt.total_questions,
        completedAt: attempt.completed_at,
      });
    }
  }

  const quizByChapterId = new Map(quizRows.map((quiz) => [quiz.chapter_id, quiz]));
  const quizCards = chapters
    .map((chapter) => {
      const quiz = quizByChapterId.get(chapter.id);
      if (!quiz) return null;

      const subjectMeta = chapter.subjects as unknown as { id: string; name: string } | null;
      const chapterVideos = videos?.filter((video) => video.chapter_id === chapter.id) ?? [];
      const completedVideos = chapterVideos.filter((video) => completedVideoIds.has(video.id)).length;
      const bestAttempt = bestQuizAttemptByQuizId.get(quiz.id) ?? null;
      const totalAttempts = attemptCountByQuizId.get(quiz.id) ?? 0;
      const lessonProgressPercent = chapterVideos.length > 0
        ? Math.round((completedVideos / chapterVideos.length) * 100)
        : 0;

      return {
        quizId: quiz.id,
        chapterId: chapter.id,
        chapterNo: chapter.chapter_no,
        chapterTitle: chapter.title,
        subjectId: subjectMeta?.id ?? chapter.subject_id,
        subjectName: subjectMeta?.name ?? "Subject",
        questionCount: quiz.question_count,
        totalVideos: chapterVideos.length,
        completedVideos,
        lessonProgressPercent,
        totalAttempts,
        bestAttempt,
      };
    })
    .filter((quiz): quiz is QuizCardData => Boolean(quiz))
    .sort((left, right) => left.subjectName.localeCompare(right.subjectName) || left.chapterNo - right.chapterNo);

  const subjectGroups = new Map<string, { id: string; name: string; quizzes: QuizCardData[] }>();
  for (const quiz of quizCards) {
    const key = quiz.subjectId || quiz.subjectName;
    if (!subjectGroups.has(key)) {
      subjectGroups.set(key, { id: quiz.subjectId, name: quiz.subjectName, quizzes: [] });
    }
    subjectGroups.get(key)!.quizzes.push(quiz);
  }

  const subjectSections: SubjectSection[] = Array.from(subjectGroups.values())
    .map((subject) => {
      const attemptedQuizzes = subject.quizzes.filter((quiz) => Boolean(quiz.bestAttempt)).length;
      const totalAttempts = subject.quizzes.reduce((sum, quiz) => sum + quiz.totalAttempts, 0);
      const masteredQuizzes = subject.quizzes.filter(
        (quiz) => quiz.bestAttempt && getQuizMasteryLevel(quiz.bestAttempt.percent) === "mastered"
      ).length;
      const averageQuizScore = attemptedQuizzes > 0
        ? Math.round(
            subject.quizzes.reduce((sum, quiz) => sum + (quiz.bestAttempt?.percent ?? 0), 0) / attemptedQuizzes
          )
        : 0;
      const completedVideos = subject.quizzes.reduce((sum, quiz) => sum + quiz.completedVideos, 0);
      const totalVideos = subject.quizzes.reduce((sum, quiz) => sum + quiz.totalVideos, 0);
      const lessonProgressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;
      const attemptRate = subject.quizzes.length > 0 ? Math.round((attemptedQuizzes / subject.quizzes.length) * 100) : 0;

      return {
        id: subject.id,
        name: subject.name,
        quizzes: subject.quizzes,
        totalQuizzes: subject.quizzes.length,
        attemptedQuizzes,
        totalAttempts,
        masteredQuizzes,
        averageQuizScore,
        completedVideos,
        totalVideos,
        lessonProgressPercent,
        attemptRate,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const attemptedQuizzes = Array.from(bestQuizAttemptByQuizId.values()).length;
  const totalAttempts = quizAttemptRows.length;
  const masteredQuizzes = Array.from(bestQuizAttemptByQuizId.values()).filter(
    (attempt) => getQuizMasteryLevel(attempt.percent) === "mastered"
  ).length;
  const averageQuizScore = attemptedQuizzes > 0
    ? Math.round(
        Array.from(bestQuizAttemptByQuizId.values()).reduce((sum, attempt) => sum + attempt.percent, 0) /
          attemptedQuizzes
      )
    : 0;

  return {
    quizCards,
    subjectSections,
    attemptedQuizzes,
    totalAttempts,
    masteredQuizzes,
    averageQuizScore,
  };
}
