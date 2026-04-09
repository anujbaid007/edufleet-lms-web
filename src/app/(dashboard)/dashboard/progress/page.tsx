import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatDuration } from "@/lib/utils";
import { ChevronDown, Clock, Flame, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import {
  getQuizMasteryClasses,
  getQuizMasteryLabel,
  getQuizMasteryLevel,
  isQuizSchemaUnavailableError,
} from "@/lib/quiz";
import { getFallbackQuizMeta, listFallbackAttemptsForUserByChapterIds } from "@/lib/dev-quiz-fallback";

export const metadata = { title: "My Progress" };

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("class, board, medium, org_id")
    .eq("id", userId)
    .single();
  if (!profile) redirect("/login");

  // Get all chapters for user's class
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

  const chapterIds = chapters?.map((c) => c.id) ?? [];

  const { data: videos } = chapterIds.length > 0
    ? await supabase.from("videos").select("id, chapter_id, duration_seconds").in("chapter_id", chapterIds)
    : { data: [] };

  const videoIds = videos?.map((v) => v.id) ?? [];

  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed, last_position, last_watched_at")
        .eq("user_id", userId)
        .in("video_id", videoIds)
    : { data: [] };

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
        .select("quiz_id, percent, correct_answers, total_questions, mastery_level, completed_at")
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
      mastery_level: attempt.masteryLevel,
      completed_at: attempt.completedAt,
    })),
  ].sort((left, right) => right.completed_at.localeCompare(left.completed_at));

  const progressMap = new Map(progress?.map((p) => [p.video_id, p]) ?? []);
  const quizByChapterId = new Map(quizRows.map((quiz) => [quiz.chapter_id, quiz]));
  const bestQuizAttemptByQuizId = new Map<
    string,
    {
      percent: number;
      correctAnswers: number;
      totalQuestions: number;
      masteryLevel: string;
      completedAt: string;
    }
  >();

  for (const attempt of quizAttemptRows) {
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
        masteryLevel: attempt.mastery_level,
        completedAt: attempt.completed_at,
      });
    }
  }

  // Global stats
  const totalWatchTime = progress?.reduce((sum, p) => sum + (p.last_position || 0), 0) ?? 0;
  const chapterStats = (chapters ?? []).map((chapter) => {
    const chapterVideos = videos?.filter((video) => video.chapter_id === chapter.id) ?? [];
    const chapterCompletedVideos = chapterVideos.filter((video) => progressMap.get(video.id)?.completed).length;
    const percent = chapterVideos.length > 0 ? Math.round((chapterCompletedVideos / chapterVideos.length) * 100) : 0;
    const quiz = quizByChapterId.get(chapter.id);
    const bestQuizAttempt = quiz ? bestQuizAttemptByQuizId.get(quiz.id) ?? null : null;
    return {
      ...chapter,
      totalVideos: chapterVideos.length,
      completedVideos: chapterCompletedVideos,
      percent,
      completed: chapterVideos.length > 0 && chapterCompletedVideos === chapterVideos.length,
      quizId: quiz?.id ?? null,
      quizQuestionCount: quiz?.question_count ?? 0,
      quizBestAttempt: bestQuizAttempt,
    };
  });
  const trackableChapterStats = chapterStats.filter((chapter) => chapter.totalVideos > 0);
  const totalChapters = trackableChapterStats.length;
  const completedChapters = trackableChapterStats.filter((chapter) => chapter.completed).length;
  const overallPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
  const totalQuizzes = quizRows.length;
  const attemptedQuizzes = bestQuizAttemptByQuizId.size;
  const masteredQuizzes = Array.from(bestQuizAttemptByQuizId.values()).filter(
    (attempt) => getQuizMasteryLevel(attempt.percent) === "mastered"
  ).length;
  const averageQuizScore = attemptedQuizzes > 0
    ? Math.round(Array.from(bestQuizAttemptByQuizId.values()).reduce((sum, attempt) => sum + attempt.percent, 0) / attemptedQuizzes)
    : 0;
  const latestQuizAttempt = quizAttemptRows[0]
    ? {
        percent: quizAttemptRows[0].percent,
        masteryLevel: getQuizMasteryLevel(quizAttemptRows[0].percent),
      }
    : null;

  // Streak
  const watchDates = Array.from(new Set(
    progress?.map((p) => p.last_watched_at?.split("T")[0]).filter(Boolean).sort().reverse() ?? []
  )) as string[];
  let streak = 0;
  for (let i = 0; i < watchDates.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    if (watchDates[i] === expected) streak++;
    else break;
  }

  // Group by subject
  const subjectMap = new Map<string, { id: string; name: string; chapters: typeof chapters }>();
  chapters?.forEach((ch) => {
    const sub = ch.subjects as unknown as { id: string; name: string } | null;
    const subName = sub?.name ?? "Unknown";
    const subId = sub?.id ?? "";
    if (!subjectMap.has(subName)) subjectMap.set(subName, { id: subId, name: subName, chapters: [] });
    subjectMap.get(subName)!.chapters!.push(ch);
  });

  const subjectStats = Array.from(subjectMap.values()).map((sub) => {
    const subChapterIds = sub.chapters!.map((c: { id: string }) => c.id);
    const subVideos = videos?.filter((v) => subChapterIds.includes(v.chapter_id)) ?? [];
    const subCompleted = subVideos.filter((v) => progressMap.get(v.id)?.completed).length;
    const subjectChapterStats = chapterStats.filter((chapter) => subChapterIds.includes(chapter.id));
    const trackableSubjectChapters = subjectChapterStats.filter((chapter) => chapter.totalVideos > 0);
    const completedSubjectChapters = trackableSubjectChapters.filter((chapter) => chapter.completed).length;
    const percent = trackableSubjectChapters.length > 0
      ? Math.round((completedSubjectChapters / trackableSubjectChapters.length) * 100)
      : 0;
    const subjectQuizzes = quizRows.filter((quiz) => subChapterIds.includes(quiz.chapter_id));
    const subjectBestAttempts = subjectQuizzes
      .map((quiz) => bestQuizAttemptByQuizId.get(quiz.id))
      .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));
    const averageSubjectQuizScore = subjectBestAttempts.length > 0
      ? Math.round(subjectBestAttempts.reduce((sum, attempt) => sum + attempt.percent, 0) / subjectBestAttempts.length)
      : 0;

    return {
      ...sub,
      totalVideos: subVideos.length,
      completedVideos: subCompleted,
      totalChapters: trackableSubjectChapters.length,
      completedChapters: completedSubjectChapters,
      percent,
      chapterStats: trackableSubjectChapters,
      totalQuizzes: subjectQuizzes.length,
      attemptedQuizzes: subjectBestAttempts.length,
      masteredQuizzes: subjectBestAttempts.filter((attempt) => getQuizMasteryLevel(attempt.percent) === "mastered").length,
      averageQuizScore: averageSubjectQuizScore,
    };
  }).filter((subject) => subject.totalChapters > 0 || subject.totalVideos > 0);

  return (
    <div className="space-y-8">
      <ScrollResetOnMount />
      <Header title="My Progress" subtitle="Track your learning journey" />

      {/* Overall Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayCard hover={false} className="!p-5 text-center">
          <ProgressRing percentage={overallPercent} size={72} strokeWidth={7}>
            <span className="text-sm font-bold text-heading">{overallPercent}%</span>
          </ProgressRing>
          <p className="mt-2 text-xs text-body">Chapter Completion</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
          <Trophy className="w-8 h-8 text-orange-primary mb-2" />
          <p className="text-2xl font-bold text-heading">{completedChapters}</p>
          <p className="text-xs text-body">Chapters Completed</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
          <Clock className="w-8 h-8 text-orange-primary mb-2" />
          <p className="text-2xl font-bold text-heading">{formatDuration(totalWatchTime)}</p>
          <p className="text-xs text-body">Total Watch Time</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
          <Flame className="w-8 h-8 text-orange-500 mb-2" />
          <p className="text-2xl font-bold text-heading">{streak} days</p>
          <p className="text-xs text-body">Current Streak</p>
        </ClayCard>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-heading font-poppins">Quiz Analytics</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
            <Target className="mb-2 h-8 w-8 text-orange-primary" />
            <p className="text-2xl font-bold text-heading">{attemptedQuizzes}/{totalQuizzes}</p>
            <p className="text-xs text-body">Quizzes Attempted</p>
          </ClayCard>
          <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
            <Trophy className="mb-2 h-8 w-8 text-orange-primary" />
            <p className="text-2xl font-bold text-heading">{averageQuizScore}%</p>
            <p className="text-xs text-body">Average Quiz Score</p>
          </ClayCard>
          <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
            <Flame className="mb-2 h-8 w-8 text-orange-500" />
            <p className="text-2xl font-bold text-heading">{masteredQuizzes}</p>
            <p className="text-xs text-body">Quizzes Mastered</p>
          </ClayCard>
          <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
            <Clock className="mb-2 h-8 w-8 text-orange-primary" />
            <p className="text-2xl font-bold text-heading">
              {latestQuizAttempt ? `${latestQuizAttempt.percent}%` : "—"}
            </p>
            <p className="text-xs text-body">
              {latestQuizAttempt ? getQuizMasteryLabel(latestQuizAttempt.masteryLevel) : "Latest Quiz"}
            </p>
          </ClayCard>
        </div>
      </div>

      {/* Per-Subject Progress */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-heading font-poppins">Subject Progress</h2>
        <div className="space-y-4">
          {subjectStats.map((sub) => (
            <ClayCard key={sub.id} hover={false} className="overflow-hidden !p-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-6 py-5 marker:content-none">
                  <ProgressRing percentage={sub.percent} size={58} strokeWidth={6}>
                    <span className="text-xs font-bold text-heading">{sub.percent}%</span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-poppins text-lg font-bold text-heading">{sub.name}</h3>
                        <p className="text-sm text-body">
                          {sub.completedChapters}/{sub.totalChapters} chapters completed
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-body">
                        <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                          {sub.completedVideos}/{sub.totalVideos} videos
                        </span>
                        <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                          {sub.percent === 100 ? "Mastered" : `${sub.totalChapters - sub.completedChapters} chapters to go`}
                        </span>
                        {sub.totalQuizzes > 0 ? (
                          <>
                            <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                              {sub.attemptedQuizzes}/{sub.totalQuizzes} quizzes taken
                            </span>
                            <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                              Avg quiz {sub.averageQuizScore}%
                            </span>
                            <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                              {sub.masteredQuizzes} mastered
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] transition-transform group-open:rotate-180">
                    <ChevronDown className="h-4 w-4 text-body" />
                  </div>
                </summary>

                <div className="border-t border-white/70 bg-white/35 px-4 py-4 sm:px-6">
                  <div className="space-y-3">
                    {sub.chapterStats.map((ch) => (
                      <Link
                        key={ch.id}
                        href={`/dashboard/chapters/${ch.id}`}
                        className="group/chapter flex items-center gap-4 rounded-[24px] bg-white/85 px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(232,135,30,0.12)]"
                      >
                        <ProgressRing percentage={ch.percent} size={48} strokeWidth={5}>
                          <span className="text-[10px] font-bold text-heading">{ch.percent}%</span>
                        </ProgressRing>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-heading">
                                Chapter {ch.chapter_no}: {ch.title}
                              </p>
                              <p className="text-xs text-body">
                                {ch.completedVideos}/{ch.totalVideos} videos complete
                              </p>
                              {ch.quizId ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                                    Quiz · {ch.quizQuestionCount} questions
                                  </span>
                                  {ch.quizBestAttempt ? (
                                    <>
                                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getQuizMasteryClasses(getQuizMasteryLevel(ch.quizBestAttempt.percent))}`}>
                                        {getQuizMasteryLabel(getQuizMasteryLevel(ch.quizBestAttempt.percent))}
                                      </span>
                                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                                        Best {ch.quizBestAttempt.percent}%
                                      </span>
                                    </>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-heading">
                                      Quiz ready
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span
                                className={`rounded-full px-2.5 py-1 font-semibold ${
                                  ch.completed
                                    ? "bg-emerald-100 text-emerald-700"
                                    : ch.completedVideos > 0
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {ch.completed ? "Completed" : ch.completedVideos > 0 ? "In progress" : "Not started"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </details>
            </ClayCard>
          ))}
        </div>
      </div>
    </div>
  );
}
