import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { QuizHubScrollManager } from "@/components/quiz/quiz-hub-scroll-manager";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import { ArrowRight, BookOpen, ChevronDown, Sparkles, Target, Trophy } from "lucide-react";
import {
  getQuizMasteryClasses,
  getQuizMasteryLabel,
  getQuizMasteryLevel,
  isQuizSchemaUnavailableError,
} from "@/lib/quiz";
import { getFallbackQuizMeta, listFallbackAttemptsForUserByChapterIds } from "@/lib/dev-quiz-fallback";

export const metadata = { title: "Quiz" };
export const dynamic = "force-dynamic";

type QuizCardData = {
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

type SubjectSection = {
  id: string;
  anchor: string;
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

const subjectThemes: Record<
  string,
  {
    color: string;
    badgeClassName: string;
    softBadgeClassName: string;
    sectionGradientClassName: string;
  }
> = {
  English: {
    color: "#8B5CF6",
    badgeClassName: "bg-violet-50 text-violet-700",
    softBadgeClassName: "bg-violet-100/80 text-violet-700",
    sectionGradientClassName: "from-violet-50 via-white to-white",
  },
  Mathematics: {
    color: "#3B82F6",
    badgeClassName: "bg-sky-50 text-sky-700",
    softBadgeClassName: "bg-sky-100/80 text-sky-700",
    sectionGradientClassName: "from-sky-50 via-white to-white",
  },
  Science: {
    color: "#10B981",
    badgeClassName: "bg-emerald-50 text-emerald-700",
    softBadgeClassName: "bg-emerald-100/80 text-emerald-700",
    sectionGradientClassName: "from-emerald-50 via-white to-white",
  },
  EVS: {
    color: "#16A34A",
    badgeClassName: "bg-green-50 text-green-700",
    softBadgeClassName: "bg-green-100/80 text-green-700",
    sectionGradientClassName: "from-green-50 via-white to-white",
  },
  Economics: {
    color: "#F97316",
    badgeClassName: "bg-orange-50 text-orange-700",
    softBadgeClassName: "bg-orange-100/80 text-orange-700",
    sectionGradientClassName: "from-orange-50 via-white to-white",
  },
  History: {
    color: "#F59E0B",
    badgeClassName: "bg-amber-50 text-amber-700",
    softBadgeClassName: "bg-amber-100/80 text-amber-700",
    sectionGradientClassName: "from-amber-50 via-white to-white",
  },
  Geography: {
    color: "#0EA5E9",
    badgeClassName: "bg-cyan-50 text-cyan-700",
    softBadgeClassName: "bg-cyan-100/80 text-cyan-700",
    sectionGradientClassName: "from-cyan-50 via-white to-white",
  },
  Civics: {
    color: "#EC4899",
    badgeClassName: "bg-pink-50 text-pink-700",
    softBadgeClassName: "bg-pink-100/80 text-pink-700",
    sectionGradientClassName: "from-pink-50 via-white to-white",
  },
  "Political Science": {
    color: "#EF4444",
    badgeClassName: "bg-rose-50 text-rose-700",
    softBadgeClassName: "bg-rose-100/80 text-rose-700",
    sectionGradientClassName: "from-rose-50 via-white to-white",
  },
  Accountancy: {
    color: "#8B5CF6",
    badgeClassName: "bg-violet-50 text-violet-700",
    softBadgeClassName: "bg-violet-100/80 text-violet-700",
    sectionGradientClassName: "from-violet-50 via-white to-white",
  },
  "Business Studies": {
    color: "#F97316",
    badgeClassName: "bg-orange-50 text-orange-700",
    softBadgeClassName: "bg-orange-100/80 text-orange-700",
    sectionGradientClassName: "from-orange-50 via-white to-white",
  },
  Physics: {
    color: "#6366F1",
    badgeClassName: "bg-indigo-50 text-indigo-700",
    softBadgeClassName: "bg-indigo-100/80 text-indigo-700",
    sectionGradientClassName: "from-indigo-50 via-white to-white",
  },
  Chemistry: {
    color: "#14B8A6",
    badgeClassName: "bg-teal-50 text-teal-700",
    softBadgeClassName: "bg-teal-100/80 text-teal-700",
    sectionGradientClassName: "from-teal-50 via-white to-white",
  },
  Biology: {
    color: "#22C55E",
    badgeClassName: "bg-lime-50 text-lime-700",
    softBadgeClassName: "bg-lime-100/80 text-lime-700",
    sectionGradientClassName: "from-lime-50 via-white to-white",
  },
  Computer: {
    color: "#8B5CF6",
    badgeClassName: "bg-fuchsia-50 text-fuchsia-700",
    softBadgeClassName: "bg-fuchsia-100/80 text-fuchsia-700",
    sectionGradientClassName: "from-fuchsia-50 via-white to-white",
  },
  default: {
    color: "#E8871E",
    badgeClassName: "bg-orange-50 text-orange-700",
    softBadgeClassName: "bg-orange-100/80 text-orange-700",
    sectionGradientClassName: "from-orange-50 via-white to-white",
  },
};

function getSubjectTheme(subjectName: string) {
  return subjectThemes[subjectName] ?? subjectThemes.default;
}

function getSubjectAnchor(subjectId: string, subjectName: string) {
  const slug = subjectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "subject"}-${subjectId || "group"}`;
}

export default async function QuizzesPage() {
  noStore();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("class, board, medium, org_id")
    .eq("id", userId)
    .single();

  if (!profile) redirect("/login");

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
        subjectId: subjectMeta?.id ?? subjectMeta?.name ?? chapter.subject_id,
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
        anchor: getSubjectAnchor(subject.id, subject.name),
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

  return (
    <div className="space-y-8">
      <ScrollResetOnMount />
      <QuizHubScrollManager />
      <Header title="Quiz" />

      <ClayCard hover={false} className="overflow-hidden !p-0">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <div className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-orange-primary">
              Quiz Hub
            </div>
            <div>
              <h2 className="max-w-2xl text-3xl font-bold leading-tight text-heading font-poppins">
                Master every chapter, one quiz at a time.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-body">
                Every matched chapter quiz is grouped by subject below, so you can revise one stream at a time and retake
                chapters where your score needs work.
              </p>
            </div>

            {subjectSections.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {subjectSections.map((subject) => {
                  const theme = getSubjectTheme(subject.name);
                  return (
                    <a
                      key={subject.anchor}
                      href={`#${subject.anchor}`}
                      data-quiz-subject-jump={subject.anchor}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] ${theme.badgeClassName}`}
                    >
                      <span>{subject.name}</span>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold text-heading">
                        {subject.totalQuizzes}
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-orange-primary/10 bg-white/35 px-6 py-6 sm:px-8 sm:py-8 xl:border-l xl:border-t-0">
            <ClayCard hover={false} className="!p-4 text-center">
              <Target className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{quizCards.length}</p>
              <p className="text-xs font-medium text-body">Available Quizzes</p>
            </ClayCard>
            <ClayCard hover={false} className="!p-4 text-center">
              <BookOpen className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{subjectSections.length}</p>
              <p className="text-xs font-medium text-body">Subjects</p>
            </ClayCard>
            <ClayCard hover={false} className="!p-4 text-center">
              <Trophy className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{totalAttempts}</p>
              <p className="text-xs font-medium text-body">Total Attempts</p>
            </ClayCard>
            <ClayCard hover={false} className="!p-4 text-center">
              <Sparkles className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{averageQuizScore}%</p>
              <p className="text-xs font-medium text-body">
                {attemptedQuizzes} chapters attempted · {masteredQuizzes} mastered
              </p>
            </ClayCard>
          </div>
        </div>
      </ClayCard>

      {subjectSections.length > 0 ? (
        <div className="space-y-6">
          {subjectSections.map((subject) => {
            const theme = getSubjectTheme(subject.name);

            return (
              <section key={subject.anchor} id={subject.anchor} className="scroll-mt-24">
                <ClayCard hover={false} className="overflow-hidden !p-0">
                  <details className="group" data-quiz-subject-section={subject.anchor}>
                    <summary className={`list-none cursor-pointer bg-gradient-to-r ${theme.sectionGradientClassName} marker:content-none`}>
                      <div className="flex flex-col gap-6 px-6 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.badgeClassName}`}>
                              {subject.name}
                            </span>
                            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-body shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                              {subject.totalQuizzes} quizzes
                            </span>
                            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-body shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                              {subject.attemptedQuizzes} chapters attempted
                            </span>
                            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-body shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                              {subject.totalAttempts} attempts
                            </span>
                          </div>
                          <h2 className="mt-4 text-2xl font-bold text-slate-950 font-poppins">
                            {subject.name} practice track
                          </h2>
                          <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
                            {subject.completedVideos}/{subject.totalVideos} lesson videos completed across this subject. Retake
                            weaker chapters and keep building toward mastery.
                          </p>
                        </div>

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <div className="flex flex-col items-center gap-2 rounded-[24px] bg-white/70 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                            <ProgressRing
                              percentage={subject.attemptRate}
                              size={88}
                              strokeWidth={7}
                              color={theme.color}
                            >
                              <span className="text-xs font-bold text-heading">{subject.attemptRate}%</span>
                            </ProgressRing>
                            <div className="text-center">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-body">Attempt rate</p>
                              <p className="text-xs text-body">
                                {subject.attemptedQuizzes} of {subject.totalQuizzes} chapters attempted
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
                            <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-body">Avg score</p>
                              <p className="mt-1 text-lg font-bold text-heading">{subject.averageQuizScore}%</p>
                            </div>
                            <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-body">Mastered</p>
                              <p className="mt-1 text-lg font-bold text-heading">{subject.masteredQuizzes}</p>
                            </div>
                            <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-body">Lesson progress</p>
                              <p className="mt-1 text-lg font-bold text-heading">{subject.lessonProgressPercent}%</p>
                            </div>
                            <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-body">Chapters ready</p>
                              <p className="mt-1 text-lg font-bold text-heading">{subject.totalQuizzes}</p>
                            </div>
                          </div>
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] transition-transform group-open:rotate-180">
                            <ChevronDown className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    </summary>

                    <div
                      className="border-t border-orange-primary/10 bg-white/35 px-4 py-4 sm:px-6 sm:py-6"
                      data-quiz-section-content={subject.anchor}
                    >
                      <div className="grid gap-4 xl:grid-cols-2">
                        {subject.quizzes.map((quiz, index) => (
                          <div
                            key={quiz.quizId}
                            data-quiz-first-card={index === 0 ? subject.anchor : undefined}
                            className="rounded-clay-sm bg-white/90 p-5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.badgeClassName}`}>
                                Chapter {quiz.chapterNo}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-heading">
                                {quiz.questionCount} questions
                              </span>
                              {quiz.totalAttempts > 0 ? (
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-heading">
                                  {quiz.totalAttempts} attempts
                                </span>
                              ) : null}
                              {quiz.bestAttempt ? (
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getQuizMasteryClasses(
                                    getQuizMasteryLevel(quiz.bestAttempt.percent)
                                  )}`}
                                >
                                  {getQuizMasteryLabel(getQuizMasteryLevel(quiz.bestAttempt.percent))}
                                </span>
                              ) : (
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.softBadgeClassName}`}>
                                  Ready to attempt
                                </span>
                              )}
                            </div>

                            <div className="mt-4">
                              <h3 className="text-xl font-bold text-heading font-poppins">{quiz.chapterTitle}</h3>
                              <p className="mt-1 text-sm text-body">
                                {quiz.completedVideos}/{quiz.totalVideos} videos completed · {quiz.lessonProgressPercent}% lesson progress
                              </p>
                            </div>

                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-orange-primary/10">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${quiz.lessonProgressPercent}%`,
                                  backgroundColor: theme.color,
                                }}
                              />
                            </div>

                            {quiz.bestAttempt ? (
                              <div className="mt-4 rounded-[18px] bg-slate-50 px-4 py-3 text-sm text-body shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]">
                                Best score <span className="font-bold text-heading">{quiz.bestAttempt.percent}%</span> ·{" "}
                                {quiz.bestAttempt.correctAnswers}/{quiz.bestAttempt.totalQuestions} correct
                              </div>
                            ) : null}

                            <div className="mt-5 flex flex-wrap gap-3">
                              <Link
                                href={`/dashboard/chapters/${quiz.chapterId}/quiz`}
                                className="inline-flex items-center gap-2 rounded-full bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange"
                              >
                                {quiz.bestAttempt ? "Retake quiz" : "Start quiz"}
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                              <Link
                                href={`/dashboard/chapters/${quiz.chapterId}`}
                                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]"
                              >
                                Open chapter
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                </ClayCard>
              </section>
            );
          })}
        </div>
      ) : (
        <ClayCard hover={false} className="!py-14 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-body" />
          <p className="text-base font-semibold text-heading">No quizzes available yet</p>
          <p className="mt-2 text-sm text-body">
            Matched MCQ quizzes will appear here automatically for the chapters available in your learning path.
          </p>
        </ClayCard>
      )}
    </div>
  );
}
