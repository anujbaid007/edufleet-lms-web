import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { PageBreadcrumbs } from "@/components/dashboard/page-breadcrumbs";
import { getSubjectTheme } from "@/components/quiz/quiz-subject-theme";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import { createClient } from "@/lib/supabase/server";
import { getQuizMasteryClasses, getQuizMasteryLabel, getQuizMasteryLevel } from "@/lib/quiz";
import { getQuizSubjectHref, getQuizSubjectPageData } from "@/lib/quiz-hub";
import { getServerLang, t } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export const metadata = { title: "Subject Quizzes" };
export const dynamic = "force-dynamic";

function formatQuizRuns(count: number, lang: Lang): string {
  return `${count} ${count === 1 ? t(lang, "quiz.quizRun") : t(lang, "quiz.quizRuns")}`;
}

function formatStartedChapters(count: number, lang: Lang): string {
  return `${count} ${count === 1 ? t(lang, "quiz.chapterStarted") : t(lang, "quiz.chaptersStarted")}`;
}

export default async function QuizSubjectPage({ params }: { params: { subjectId: string } }) {
  const lang = getServerLang();
  noStore();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const quizSubjectPageData = await getQuizSubjectPageData(supabase, session.user.id, params.subjectId);
  if (!quizSubjectPageData) notFound();

  const { subject, subjectLinks } = quizSubjectPageData;

  const theme = getSubjectTheme(subject.name);

  return (
    <div className="space-y-6">
      <ScrollResetOnMount />
      <PageBreadcrumbs
        backHref="/dashboard/quizzes"
        backLabel={t(lang, "quiz.backToHub")}
        crumbs={[
          { href: "/dashboard/quizzes", label: t(lang, "nav.quiz") },
          { href: getQuizSubjectHref(subject.id), label: subject.name },
        ]}
      />

      <Header title={t(lang, "quiz.subjectTitle", { name: subject.name })} subtitle={t(lang, "quiz.subjectSubtitle")} />

      <ClayCard hover={false} className="overflow-hidden !p-0">
        <div className={`bg-gradient-to-r ${theme.sectionGradientClassName} px-6 py-6 sm:px-8 sm:py-8`}>
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

          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-3xl font-bold text-heading font-poppins">{subject.name} practice track</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
                {subject.completedVideos}/{subject.totalVideos} lesson videos completed across this subject. Retake weaker
                chapters and keep building toward mastery.
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-col items-center gap-2 rounded-[24px] bg-white/70 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                <ProgressRing percentage={subject.attemptRate} size={88} strokeWidth={7} color={theme.color}>
                  <span className="text-xs font-bold text-heading">{subject.attemptRate}%</span>
                </ProgressRing>
                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-body">{t(lang, "quiz.coverage")}</p>
                  <p className="text-xs text-body">
                    {t(lang, "quiz.startedOf", { done: subject.attemptedQuizzes, total: subject.totalQuizzes })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:min-w-[260px]">
                <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-body">{t(lang, "quiz.avgScore")}</p>
                  <p className="mt-1 text-lg font-bold text-heading">{subject.averageQuizScore}%</p>
                </div>
                <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-body">{t(lang, "quiz.mastered")}</p>
                  <p className="mt-1 text-lg font-bold text-heading">{subject.masteredQuizzes}</p>
                </div>
                <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-body">{t(lang, "quiz.lessonProgress")}</p>
                  <p className="mt-1 text-lg font-bold text-heading">{subject.lessonProgressPercent}%</p>
                </div>
                <div className="rounded-[20px] bg-white/85 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-body">{t(lang, "quiz.chaptersReady")}</p>
                  <p className="mt-1 text-lg font-bold text-heading">{subject.totalQuizzes}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {subjectLinks.map((section) => {
              const sectionTheme = getSubjectTheme(section.name);
              const isCurrent = section.id === subject.id;

              return (
                <Link
                  key={section.id}
                  href={getQuizSubjectHref(section.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] ${
                    isCurrent ? sectionTheme.badgeClassName : "bg-white/90 text-body"
                  }`}
                >
                  <span>{section.name}</span>
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-bold text-heading">
                    {section.totalQuizzes}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </ClayCard>

      <div className="grid gap-4 xl:grid-cols-2">
        {subject.quizzes.map((quiz) => (
          <div key={quiz.quizId} className="rounded-clay-sm bg-white/90 p-5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.badgeClassName}`}>
                Chapter {quiz.chapterNo}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-heading">
                {quiz.questionCount} questions
              </span>
              {quiz.totalAttempts > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-heading">
                  {formatQuizRuns(quiz.totalAttempts, lang)}
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
  );
}
