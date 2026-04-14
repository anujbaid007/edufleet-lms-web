import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { MetricInfo } from "@/components/ui/metric-info";
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
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";
import { getLearnerScopeManifest, getLearnerVideoState } from "@/lib/learner-scope";
import { createRequestProfiler } from "@/lib/perf";

export const metadata = { title: "My Progress" };

export default async function ProgressPage() {
  const lang = getServerLang();
  const perf = createRequestProfiler("dashboard.progress", { lang });
  const metricInfo =
    lang === "hi"
      ? {
          chapterCompletion: "आपकी वर्तमान पढ़ाई सीमा में ऐसे अध्यायों का प्रतिशत जिनके सभी पाठ वीडियो पूरे हो चुके हैं।",
          chaptersCompleted: "ऐसे अध्यायों की संख्या जिनके सभी पाठ वीडियो आपने पूरे कर लिए हैं।",
          totalWatchTime: "आपकी सेव की गई वीडियो प्रगति के आधार पर पाठ वीडियो देखने में बिताया गया कुल समय।",
          currentStreak: "लगातार कितने दिनों तक आपने कम से कम एक पाठ वीडियो देखा है।",
          quizzesAttempted: "आपकी वर्तमान सीमा में उपलब्ध अध्याय क्विज़ में से आपने कितने क्विज़ शुरू किए हैं।",
          avgScore: "हर अध्याय क्विज़ में आपके सर्वश्रेष्ठ स्कोर का औसत।",
          quizzesMastered: "ऐसे अध्याय क्विज़ की संख्या जिनमें आपका सर्वश्रेष्ठ स्कोर महारत की सीमा तक पहुंचा।",
          latestQuiz: "आपका सबसे हाल का क्विज़ परिणाम, जिसमें नवीनतम स्कोर और महारत स्तर दिखता है।",
        }
      : {
          chapterCompletion: "Percentage of trackable chapters where every lesson video has been completed in your current scope.",
          chaptersCompleted: "Number of chapters where you have finished all lesson videos.",
          totalWatchTime: "Combined time spent inside lesson videos based on your saved watch positions.",
          currentStreak: "How many consecutive days you have watched at least one lesson.",
          quizzesAttempted: "How many chapter quizzes you have started out of the quizzes available in your current scope.",
          avgScore: "Average of your best score in each chapter quiz you have attempted.",
          quizzesMastered: "Number of chapter quizzes where your best score reached the mastery threshold.",
          latestQuiz: "Your most recent quiz result, shown as the latest score and mastery band.",
        };
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;
  perf.mark("auth");

  const scope = await getLearnerScopeManifest(supabase, userId);
  if (!scope) redirect("/login");
  const { profile, chapters, chapterIds, subjects } = scope;
  perf.record("subjectCount", subjects.length);
  perf.record("chapterCount", chapters.length);
  perf.mark("scope");

  const {
    videos,
    videosByChapterId,
    progressRows,
    progressByVideoId,
  } = await getLearnerVideoState(
    supabase,
    userId,
    chapterIds,
    "id, chapter_id, duration_seconds"
  );
  perf.record("videoCount", videos.length);
  perf.record("progressRowCount", progressRows.length);
  perf.mark("video-state");

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
  perf.record("quizCount", quizRows.length);
  perf.record("quizAttemptCount", quizAttemptRows.length);
  perf.mark("quiz-data");

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
  const totalWatchTime = progressRows.reduce((sum, progress) => sum + (progress.last_position || 0), 0);
  const chapterStats = chapters.map((chapter) => {
    const chapterVideos = videosByChapterId.get(chapter.id) ?? [];
    const chapterCompletedVideos = chapterVideos.filter((video) => progressByVideoId.get(video.id)?.completed).length;
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
  const chapterStatsById = new Map(chapterStats.map((chapter) => [chapter.id, chapter]));
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
    progressRows.map((p) => p.last_watched_at?.split("T")[0]).filter(Boolean).sort().reverse()
  )) as string[];
  let streak = 0;
  for (let i = 0; i < watchDates.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    if (watchDates[i] === expected) streak++;
    else break;
  }

  const subjectStats = subjects.map((subject) => {
    const subjectVideos = subject.chapters.flatMap((chapter) => videosByChapterId.get(chapter.id) ?? []);
    const subCompleted = subjectVideos.filter((video) => progressByVideoId.get(video.id)?.completed).length;
    const subjectChapterStats = subject.chapters
      .map((chapter) => chapterStatsById.get(chapter.id))
      .filter((chapter): chapter is NonNullable<typeof chapterStats[number]> => Boolean(chapter));
    const trackableSubjectChapters = subjectChapterStats.filter((chapter) => chapter.totalVideos > 0);
    const completedSubjectChapters = trackableSubjectChapters.filter((chapter) => chapter.completed).length;
    const percent = trackableSubjectChapters.length > 0
      ? Math.round((completedSubjectChapters / trackableSubjectChapters.length) * 100)
      : 0;
    const subjectQuizzes = subject.chapters.flatMap((chapter) => {
      const quiz = quizByChapterId.get(chapter.id);
      return quiz ? [quiz] : [];
    });
    const subjectBestAttempts = subjectQuizzes
      .map((quiz) => bestQuizAttemptByQuizId.get(quiz.id))
      .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));
    const averageSubjectQuizScore = subjectBestAttempts.length > 0
      ? Math.round(subjectBestAttempts.reduce((sum, attempt) => sum + attempt.percent, 0) / subjectBestAttempts.length)
      : 0;

    return {
      id: subject.id,
      name: subject.name,
      totalVideos: subjectVideos.length,
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
  perf.record("subjectStatsCount", subjectStats.length);
  perf.mark("aggregation");
  perf.flush();

  return (
    <div className="space-y-8">
      <ScrollResetOnMount />
      <Header title={t(lang, "progress.title")} subtitle={t(lang, "progress.subtitle")} />

      {/* Overall Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayCard hover={false} className="relative !p-5 text-center">
          <MetricInfo
            className="absolute right-4 top-4"
            label={t(lang, "progress.chapterCompletion")}
            description={metricInfo.chapterCompletion}
          />
          <ProgressRing percentage={overallPercent} size={72} strokeWidth={7}>
            <span className="text-sm font-bold text-heading">{overallPercent}%</span>
          </ProgressRing>
          <p className="mt-2 text-xs text-body">{t(lang, "progress.chapterCompletion")}</p>
        </ClayCard>
        <ClayCard hover={false} className="relative !p-5 flex flex-col items-center justify-center">
          <MetricInfo
            className="absolute right-4 top-4"
            label={t(lang, "progress.chaptersCompleted")}
            description={metricInfo.chaptersCompleted}
          />
          <Trophy className="w-8 h-8 text-orange-primary mb-2" />
          <p className="text-2xl font-bold text-heading">{completedChapters}</p>
          <p className="text-xs text-body">{t(lang, "progress.chaptersCompleted")}</p>
        </ClayCard>
        <ClayCard hover={false} className="relative !p-5 flex flex-col items-center justify-center">
          <MetricInfo
            className="absolute right-4 top-4"
            label={t(lang, "progress.totalWatchTime")}
            description={metricInfo.totalWatchTime}
          />
          <Clock className="w-8 h-8 text-orange-primary mb-2" />
          <p className="text-2xl font-bold text-heading">{formatDuration(totalWatchTime)}</p>
          <p className="text-xs text-body">{t(lang, "progress.totalWatchTime")}</p>
        </ClayCard>
        <ClayCard hover={false} className="relative !p-5 flex flex-col items-center justify-center">
          <MetricInfo
            className="absolute right-4 top-4"
            label={t(lang, "progress.currentStreak")}
            description={metricInfo.currentStreak}
          />
          <Flame className="w-8 h-8 text-orange-500 mb-2" />
          <p className="text-2xl font-bold text-heading">{t(lang, "progress.days", { n: streak })}</p>
          <p className="text-xs text-body">{t(lang, "progress.currentStreak")}</p>
        </ClayCard>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-heading font-poppins">{t(lang, "progress.quizAnalytics")}</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ClayCard hover={false} className="relative !p-5 flex flex-col items-center justify-center">
            <MetricInfo
              className="absolute right-4 top-4"
              label={t(lang, "progress.quizzesAttempted")}
              description={metricInfo.quizzesAttempted}
            />
            <Target className="mb-2 h-8 w-8 text-orange-primary" />
            <p className="text-2xl font-bold text-heading">{attemptedQuizzes}/{totalQuizzes}</p>
            <p className="text-xs text-body">{t(lang, "progress.quizzesAttempted")}</p>
          </ClayCard>
          <ClayCard hover={false} className="relative !p-5 flex flex-col items-center justify-center">
            <MetricInfo
              className="absolute right-4 top-4"
              label={t(lang, "progress.avgScore")}
              description={metricInfo.avgScore}
            />
            <Trophy className="mb-2 h-8 w-8 text-orange-primary" />
            <p className="text-2xl font-bold text-heading">{averageQuizScore}%</p>
            <p className="text-xs text-body">{t(lang, "progress.avgScore")}</p>
          </ClayCard>
          <ClayCard hover={false} className="relative !p-5 flex flex-col items-center justify-center">
            <MetricInfo
              className="absolute right-4 top-4"
              label={t(lang, "progress.quizzesMastered")}
              description={metricInfo.quizzesMastered}
            />
            <Flame className="mb-2 h-8 w-8 text-orange-500" />
            <p className="text-2xl font-bold text-heading">{masteredQuizzes}</p>
            <p className="text-xs text-body">{t(lang, "progress.quizzesMastered")}</p>
          </ClayCard>
          <ClayCard hover={false} className="relative !p-5 flex flex-col items-center justify-center">
            <MetricInfo
              className="absolute right-4 top-4"
              label={t(lang, "progress.latestQuiz")}
              description={metricInfo.latestQuiz}
            />
            <Clock className="mb-2 h-8 w-8 text-orange-primary" />
            <p className="text-2xl font-bold text-heading">
              {latestQuizAttempt ? `${latestQuizAttempt.percent}%` : "—"}
            </p>
            <p className="text-xs text-body">
              {latestQuizAttempt ? getQuizMasteryLabel(latestQuizAttempt.masteryLevel) : t(lang, "progress.latestQuiz")}
            </p>
          </ClayCard>
        </div>
      </div>

      {/* Per-Subject Progress */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-heading font-poppins">{t(lang, "progress.subjectProgress")}</h2>
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
                          {t(lang, "progress.chaptersCompletedOf", { done: sub.completedChapters, total: sub.totalChapters })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-body">
                        <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                          {t(lang, "progress.videosOf", { done: sub.completedVideos, total: sub.totalVideos })}
                        </span>
                        <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                          {sub.percent === 100 ? t(lang, "progress.masteredLabel") : t(lang, "progress.chaptersToGo", { n: sub.totalChapters - sub.completedChapters })}
                        </span>
                        {sub.totalQuizzes > 0 ? (
                          <>
                            <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                              {t(lang, "progress.quizzesTaken", { done: sub.attemptedQuizzes, total: sub.totalQuizzes })}
                            </span>
                            <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                              {t(lang, "progress.avgQuiz", { pct: sub.averageQuizScore })}
                            </span>
                            <span className="rounded-full bg-white/80 px-3 py-1 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                              {t(lang, "progress.masteredCount", { n: sub.masteredQuizzes })}
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
                                {t(lang, "progress.chapterNo", { n: ch.chapter_no })}: {ch.title}
                              </p>
                              <p className="text-xs text-body">
                                {t(lang, "progress.videosComplete", { done: ch.completedVideos, total: ch.totalVideos })}
                              </p>
                              {ch.quizId ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
                                    {t(lang, "progress.quizQuestions", { n: ch.quizQuestionCount })}
                                  </span>
                                  {ch.quizBestAttempt ? (
                                    <>
                                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getQuizMasteryClasses(getQuizMasteryLevel(ch.quizBestAttempt.percent))}`}>
                                        {getQuizMasteryLabel(getQuizMasteryLevel(ch.quizBestAttempt.percent))}
                                      </span>
                                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                                        {t(lang, "progress.best", { pct: ch.quizBestAttempt.percent })}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-heading">
                                      {t(lang, "progress.quizReady")}
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
                                {ch.completed ? t(lang, "progress.completed") : ch.completedVideos > 0 ? t(lang, "progress.inProgress") : t(lang, "progress.notStarted")}
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
