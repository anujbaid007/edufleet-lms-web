import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { ArrowRight, BookOpen, Sparkles, Target, Trophy } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import { getSubjectTheme } from "@/components/quiz/quiz-subject-theme";
import { createClient } from "@/lib/supabase/server";
import { getQuizHubData, getQuizSubjectHref } from "@/lib/quiz-hub";
import { t, type Lang } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";

export const metadata = { title: "Quiz" };
export const dynamic = "force-dynamic";

function formatQuizRuns(count: number, lang: Lang): string {
  return `${count} ${count === 1 ? t(lang, "quiz.quizRun") : t(lang, "quiz.quizRuns")}`;
}

function formatStartedChapters(count: number, lang: Lang): string {
  return `${count} ${count === 1 ? t(lang, "quiz.chapterStarted") : t(lang, "quiz.chaptersStarted")}`;
}

export default async function QuizzesPage() {
  const lang = getServerLang();
  noStore();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const quizHubData = await getQuizHubData(supabase, session.user.id);
  if (!quizHubData) redirect("/login");

  const { totalQuizzes, subjectSections, attemptedQuizzes, totalAttempts, masteredQuizzes, averageQuizScore } = quizHubData;

  return (
    <div className="space-y-8">
      <ScrollResetOnMount />
      <Header title={t(lang, "nav.quiz")} />

      <ClayCard hover={false} className="overflow-hidden !p-0">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <div className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-orange-primary">
              {t(lang, "quiz.hubLabel")}
            </div>
            <div>
              <h2 className="max-w-2xl text-3xl font-bold leading-tight text-heading font-poppins">
                {t(lang, "quiz.hubTagline")}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-body">
                {t(lang, "quiz.hubDesc")}
              </p>
            </div>

            {subjectSections.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {subjectSections.map((subject) => {
                  const theme = getSubjectTheme(subject.name);
                  return (
                    <Link
                      key={subject.id}
                      href={getQuizSubjectHref(subject.id)}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] ${theme.badgeClassName}`}
                    >
                      <span>{subject.name}</span>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold text-heading">
                        {t(lang, "quiz.quizzesCount", { n: subject.totalQuizzes })}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-orange-primary/10 bg-white/35 px-6 py-6 sm:px-8 sm:py-8 xl:border-l xl:border-t-0">
            <ClayCard hover={false} className="!p-4 text-center">
              <Target className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{totalQuizzes}</p>
              <p className="text-xs font-medium text-body">{t(lang, "quiz.available")}</p>
            </ClayCard>
            <ClayCard hover={false} className="!p-4 text-center">
              <BookOpen className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{subjectSections.length}</p>
              <p className="text-xs font-medium text-body">{t(lang, "quiz.subjects")}</p>
            </ClayCard>
            <ClayCard hover={false} className="!p-4 text-center">
              <Trophy className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{totalAttempts}</p>
              <p className="text-xs font-medium text-body">{t(lang, "quiz.totalRuns")}</p>
            </ClayCard>
            <ClayCard hover={false} className="!p-4 text-center">
              <Sparkles className="mx-auto mb-2 h-7 w-7 text-orange-primary" />
              <p className="text-2xl font-bold text-heading">{averageQuizScore}%</p>
              <p className="text-xs font-medium text-body">
                {formatStartedChapters(attemptedQuizzes, lang)} · {masteredQuizzes} {t(lang, "quiz.mastered").toLowerCase()}
              </p>
            </ClayCard>
          </div>
        </div>
      </ClayCard>

      {subjectSections.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {subjectSections.map((subject) => {
            const theme = getSubjectTheme(subject.name);

            return (
              <Link key={subject.id} href={getQuizSubjectHref(subject.id)} className="group block h-full">
                <ClayCard hover className="h-full overflow-hidden !p-0">
                  <div className={`flex h-full flex-col bg-gradient-to-r ${theme.sectionGradientClassName} px-6 py-6 sm:px-8 sm:py-8`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.badgeClassName}`}>
                        {subject.name}
                      </span>
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-body shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                        {t(lang, "quiz.quizzesCount", { n: subject.totalQuizzes })}
                      </span>
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-body shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                        {formatStartedChapters(subject.attemptedQuizzes, lang)}
                      </span>
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-body shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                        {formatQuizRuns(subject.totalAttempts, lang)}
                      </span>
                    </div>

                    <div className="mt-5 flex flex-1 flex-col">
                      <div className="max-w-[30rem]">
                        <h2 className="text-[2rem] font-bold leading-tight text-heading font-poppins">
                          {subject.name}
                        </h2>
                        <p className="mt-3 text-sm leading-6 text-body">
                          {t(lang, "quiz.subjectDesc")}
                        </p>
                      </div>

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[24px] bg-white/84 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                          <div className="flex items-center gap-4">
                            <ProgressRing percentage={subject.attemptRate} size={68} strokeWidth={7} color={theme.color}>
                              <span className="text-[11px] font-bold text-heading">{subject.attemptRate}%</span>
                            </ProgressRing>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-body">
                                {t(lang, "quiz.coverage")}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-heading">
                                {t(lang, "quiz.startedOf", { done: subject.attemptedQuizzes, total: subject.totalQuizzes })}
                              </p>
                              <p className="mt-1 text-xs text-body">{t(lang, "quiz.runsLogged", { n: subject.totalAttempts })}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-[22px] bg-white/88 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-body">{t(lang, "quiz.avgScore")}</p>
                          <p className="mt-2 text-2xl font-bold text-heading">{subject.averageQuizScore}%</p>
                        </div>
                        <div className="rounded-[22px] bg-white/88 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-body">{t(lang, "quiz.mastered")}</p>
                          <p className="mt-2 text-2xl font-bold text-heading">{subject.masteredQuizzes}</p>
                        </div>
                        <div className="rounded-[22px] bg-white/88 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-body">{t(lang, "quiz.activity")}</p>
                          <p className="mt-2 text-2xl font-bold text-heading">{subject.totalAttempts}</p>
                        </div>
                        <div className="rounded-[22px] bg-white/88 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-body">{t(lang, "quiz.chaptersReady")}</p>
                          <p className="mt-2 text-2xl font-bold text-heading">{subject.totalQuizzes}</p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-[24px] bg-white/82 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-body">{t(lang, "quiz.lessonProgress")}</p>
                            <p className="mt-1 text-sm font-semibold text-heading">
                              {t(lang, "quiz.videosCompleted", { done: subject.completedVideos, total: subject.totalVideos })}
                            </p>
                          </div>
                          <div className="inline-flex items-center gap-2 self-start rounded-full bg-white/92 px-4 py-2.5 text-sm font-semibold text-orange-primary shadow-[inset_0_0_0_1px_rgba(232,135,30,0.18)] transition-transform duration-200 group-hover:translate-x-1">
                            <span>{t(lang, "quiz.openChapters")}</span>
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-orange-primary/10">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${subject.lessonProgressPercent}%`,
                              backgroundColor: theme.color,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </ClayCard>
              </Link>
            );
          })}
        </div>
      ) : (
        <ClayCard hover={false} className="!py-14 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-body" />
          <p className="text-base font-semibold text-heading">{t(lang, "quiz.empty")}</p>
          <p className="mt-2 text-sm text-body">
            {t(lang, "quiz.emptyDesc")}
          </p>
        </ClayCard>
      )}
    </div>
  );
}
