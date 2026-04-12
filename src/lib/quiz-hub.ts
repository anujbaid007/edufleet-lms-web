import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getFallbackQuizMeta, listFallbackAttemptsForUserByChapterIds } from "@/lib/dev-quiz-fallback";
import { getLearnerScopeManifest, type LearnerScopeChapter, type LearnerScopeProfile } from "@/lib/learner-scope";
import { getQuizMasteryLevel, isQuizSchemaUnavailableError } from "@/lib/quiz";

type AppSupabaseClient = SupabaseClient<Database>;

type QuizRow = {
  id: string;
  chapter_id: string;
  question_count: number;
};

type QuizAttemptRow = {
  quiz_id: string;
  percent: number;
  correct_answers: number;
  total_questions: number;
  completed_at: string;
};

type VideoRow = {
  id: string;
  chapter_id: string;
};

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
  totalQuizzes: number;
  subjectSections: SubjectSection[];
  attemptedQuizzes: number;
  totalAttempts: number;
  masteredQuizzes: number;
  averageQuizScore: number;
};

export type QuizSubjectLink = {
  id: string;
  name: string;
  totalQuizzes: number;
};

export type QuizSubjectPageData = {
  subject: SubjectSection;
  subjectLinks: QuizSubjectLink[];
};

export function getQuizSubjectHref(subjectId: string) {
  return `/dashboard/quizzes/${subjectId}`;
}

async function getQuizRowsForChapters(
  supabase: AppSupabaseClient,
  profile: LearnerScopeProfile,
  chapters: LearnerScopeChapter[]
) {
  const chapterIds = chapters.map((chapter) => chapter.id);
  const { data: quizzes, error: quizzesError } = chapterIds.length > 0
    ? await supabase
        .from("chapter_quizzes")
        .select("id, chapter_id, question_count")
        .eq("is_published", true)
        .in("chapter_id", chapterIds)
    : { data: [] };

  const dbQuizRows = (isQuizSchemaUnavailableError(quizzesError) ? [] : quizzes ?? []) as QuizRow[];
  const dbQuizByChapterId = new Map(dbQuizRows.map((quiz) => [quiz.chapter_id, quiz]));

  const fallbackQuizRows = (
    await Promise.all(
      chapters
        .filter((chapter) => !dbQuizByChapterId.has(chapter.id))
        .map(async (chapter) => {
          const subjectName = chapter.subjects?.name ?? "Subject";
          const meta = await getFallbackQuizMeta({
            id: chapter.id,
            class: profile.class ?? 0,
            medium: profile.medium ?? "English",
            chapterNo: chapter.chapter_no,
            title: chapter.title,
            titleHindi: chapter.title_hindi,
            subjectName,
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
  ).filter((quiz): quiz is QuizRow => Boolean(quiz));

  return {
    dbQuizRows,
    fallbackQuizRows,
    quizRows: [...dbQuizRows, ...fallbackQuizRows],
  };
}

async function getQuizAttemptState(
  supabase: AppSupabaseClient,
  userId: string,
  dbQuizRows: QuizRow[],
  fallbackQuizRows: QuizRow[]
) {
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
    ...(isQuizSchemaUnavailableError(quizAttemptsError) ? [] : (quizAttempts ?? [])),
    ...fallbackQuizAttempts.map((attempt) => ({
      quiz_id: attempt.quizId,
      percent: attempt.percent,
      correct_answers: attempt.correctAnswers,
      total_questions: attempt.totalQuestions,
      completed_at: attempt.completedAt,
    })),
  ].sort((left, right) => right.completed_at.localeCompare(left.completed_at)) as QuizAttemptRow[];

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

  return {
    quizAttemptRows,
    bestQuizAttemptByQuizId,
    attemptCountByQuizId,
  };
}

function buildVideosByChapterId(videos: VideoRow[]) {
  const videosByChapterId = new Map<string, VideoRow[]>();

  for (const video of videos) {
    if (!videosByChapterId.has(video.chapter_id)) {
      videosByChapterId.set(video.chapter_id, []);
    }
    videosByChapterId.get(video.chapter_id)!.push(video);
  }

  return videosByChapterId;
}

function buildQuizCards(params: {
  chapters: LearnerScopeChapter[];
  videosByChapterId: Map<string, VideoRow[]>;
  completedVideoIds: Set<string>;
  quizRows: QuizRow[];
  bestQuizAttemptByQuizId: Map<
    string,
    {
      percent: number;
      correctAnswers: number;
      totalQuestions: number;
      completedAt: string;
    }
  >;
  attemptCountByQuizId: Map<string, number>;
}) {
  const { chapters, videosByChapterId, completedVideoIds, quizRows, bestQuizAttemptByQuizId, attemptCountByQuizId } = params;
  const quizByChapterId = new Map(quizRows.map((quiz) => [quiz.chapter_id, quiz]));

  return chapters
    .map((chapter) => {
      const quiz = quizByChapterId.get(chapter.id);
      if (!quiz) return null;

      const chapterVideos = videosByChapterId.get(chapter.id) ?? [];
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
        subjectId: chapter.subjects?.id ?? chapter.subject_id,
        subjectName: chapter.subjects?.name ?? "Subject",
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
}

function buildSubjectSections(quizCards: QuizCardData[]) {
  const subjectGroups = new Map<string, { id: string; name: string; quizzes: QuizCardData[] }>();

  for (const quiz of quizCards) {
    const key = quiz.subjectId || quiz.subjectName;
    if (!subjectGroups.has(key)) {
      subjectGroups.set(key, { id: quiz.subjectId, name: quiz.subjectName, quizzes: [] });
    }
    subjectGroups.get(key)!.quizzes.push(quiz);
  }

  return Array.from(subjectGroups.values())
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
    .sort((left, right) => left.name.localeCompare(right.name)) satisfies SubjectSection[];
}

function buildSubjectLinks(chapters: LearnerScopeChapter[], quizRows: QuizRow[]) {
  const subjectByChapterId = new Map(
    chapters.map((chapter) => [
      chapter.id,
      {
        id: chapter.subjects?.id ?? chapter.subject_id,
        name: chapter.subjects?.name ?? "Subject",
      },
    ])
  );

  const countsBySubjectId = new Map<string, QuizSubjectLink>();
  for (const quiz of quizRows) {
    const subject = subjectByChapterId.get(quiz.chapter_id);
    if (!subject) continue;

    const existing = countsBySubjectId.get(subject.id);
    if (existing) {
      existing.totalQuizzes += 1;
    } else {
      countsBySubjectId.set(subject.id, { ...subject, totalQuizzes: 1 });
    }
  }

  return Array.from(countsBySubjectId.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export async function getQuizHubData(supabase: AppSupabaseClient, userId: string): Promise<QuizHubData | null> {
  const scope = await getLearnerScopeManifest(supabase, userId);
  if (!scope) return null;

  const [{ quizRows, dbQuizRows, fallbackQuizRows }, { data: videos }] = await Promise.all([
    getQuizRowsForChapters(supabase, scope.profile, scope.chapters),
    scope.chapterIds.length > 0
      ? supabase.from("videos").select("id, chapter_id").in("chapter_id", scope.chapterIds)
      : Promise.resolve({ data: [] as VideoRow[] }),
  ]);

  const videoRows = (videos ?? []) as VideoRow[];
  const videoIds = videoRows.map((video) => video.id);

  const [{ bestQuizAttemptByQuizId, attemptCountByQuizId, quizAttemptRows }, { data: progress }] = await Promise.all([
    getQuizAttemptState(supabase, userId, dbQuizRows, fallbackQuizRows),
    videoIds.length > 0
      ? supabase.from("video_progress").select("video_id, completed").eq("user_id", userId).in("video_id", videoIds)
      : Promise.resolve({ data: [] as Array<{ video_id: string; completed: boolean }> }),
  ]);

  const completedVideoIds = new Set((progress ?? []).filter((row) => row.completed).map((row) => row.video_id));
  const videosByChapterId = buildVideosByChapterId(videoRows);
  const quizCards = buildQuizCards({
    chapters: scope.chapters,
    videosByChapterId,
    completedVideoIds,
    quizRows,
    bestQuizAttemptByQuizId,
    attemptCountByQuizId,
  });
  const subjectSections = buildSubjectSections(quizCards);

  const attemptedQuizzes = bestQuizAttemptByQuizId.size;
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
    totalQuizzes: quizCards.length,
    subjectSections,
    attemptedQuizzes,
    totalAttempts,
    masteredQuizzes,
    averageQuizScore,
  };
}

export async function getQuizSubjectPageData(
  supabase: AppSupabaseClient,
  userId: string,
  subjectId: string
): Promise<QuizSubjectPageData | null> {
  const scope = await getLearnerScopeManifest(supabase, userId);
  if (!scope) return null;

  const subjectChapters = scope.chaptersBySubjectId.get(subjectId) ?? [];
  if (subjectChapters.length === 0) return null;

  const [{ quizRows: allQuizRows }, { quizRows: subjectQuizRows, dbQuizRows, fallbackQuizRows }, { data: videos }] =
    await Promise.all([
      getQuizRowsForChapters(supabase, scope.profile, scope.chapters),
      getQuizRowsForChapters(supabase, scope.profile, subjectChapters),
      supabase.from("videos").select("id, chapter_id").in("chapter_id", subjectChapters.map((chapter) => chapter.id)),
    ]);

  const subjectLinks = buildSubjectLinks(scope.chapters, allQuizRows);
  const subjectVideoRows = (videos ?? []) as VideoRow[];
  const subjectVideoIds = subjectVideoRows.map((video) => video.id);

  const [{ bestQuizAttemptByQuizId, attemptCountByQuizId }, { data: progress }] = await Promise.all([
    getQuizAttemptState(supabase, userId, dbQuizRows, fallbackQuizRows),
    subjectVideoIds.length > 0
      ? supabase.from("video_progress").select("video_id, completed").eq("user_id", userId).in("video_id", subjectVideoIds)
      : Promise.resolve({ data: [] as Array<{ video_id: string; completed: boolean }> }),
  ]);

  const completedVideoIds = new Set((progress ?? []).filter((row) => row.completed).map((row) => row.video_id));
  const videosByChapterId = buildVideosByChapterId(subjectVideoRows);
  const quizCards = buildQuizCards({
    chapters: subjectChapters,
    videosByChapterId,
    completedVideoIds,
    quizRows: subjectQuizRows,
    bestQuizAttemptByQuizId,
    attemptCountByQuizId,
  });
  const [subject] = buildSubjectSections(quizCards);

  if (!subject) return null;

  return {
    subject,
    subjectLinks,
  };
}
