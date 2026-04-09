import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { PageBreadcrumbs } from "@/components/dashboard/page-breadcrumbs";
import { Play, CheckCircle2, Trophy } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import {
  getQuizMasteryClasses,
  getQuizMasteryLabel,
  getQuizMasteryLevel,
  isQuizSchemaUnavailableError,
} from "@/lib/quiz";
import { getFallbackQuizMeta, listFallbackAttemptsForUser } from "@/lib/dev-quiz-fallback";

export default async function ChapterPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, title_hindi, class, medium, chapter_no, subject_id, subjects(id, name)")
    .eq("id", params.id)
    .single();

  if (!chapter) redirect("/dashboard");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, duration_seconds, sort_order")
    .eq("chapter_id", chapter.id)
    .order("sort_order");

  const videoIds = videos?.map((v) => v.id) ?? [];
  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed")
        .eq("user_id", userId)
        .in("video_id", videoIds)
    : { data: [] };

  const progressMap = new Map(progress?.map((p) => [p.video_id, p]) ?? []);
  // Need to cast the subjects join result
  const subjectMeta = chapter.subjects as unknown as { id: string; name: string } | null;
  const subjectName = subjectMeta?.name ?? "Subject";
  const subjectId = subjectMeta?.id ?? "";

  const { data: quiz, error: quizError } = await supabase
    .from("chapter_quizzes")
    .select("id, question_count")
    .eq("chapter_id", chapter.id)
    .eq("is_published", true)
    .maybeSingle();
  const activeQuiz = isQuizSchemaUnavailableError(quizError) ? null : quiz;
  const fallbackQuiz = !activeQuiz
    ? await getFallbackQuizMeta({
        id: chapter.id,
        class: chapter.class,
        medium: chapter.medium,
        chapterNo: chapter.chapter_no,
        title: chapter.title,
        titleHindi: chapter.title_hindi,
        subjectName,
      })
    : null;

  const { data: quizAttempts, error: quizAttemptsError } = activeQuiz
    ? await supabase
        .from("quiz_attempts")
        .select("percent, correct_answers, total_questions, completed_at")
        .eq("quiz_id", activeQuiz.id)
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
    : { data: [] };
  const fallbackAttemptRows = !activeQuiz && fallbackQuiz ? await listFallbackAttemptsForUser(userId, chapter.id) : [];
  const quizAttemptRows = isQuizSchemaUnavailableError(quizAttemptsError)
    ? fallbackAttemptRows.map((attempt) => ({
        percent: attempt.percent,
        correct_answers: attempt.correctAnswers,
        total_questions: attempt.totalQuestions,
        completed_at: attempt.completedAt,
      }))
    : quizAttempts ?? [];

  let bestAttempt: (typeof quizAttemptRows)[number] | null = null;

  for (const attempt of quizAttemptRows) {
    if (
      !bestAttempt ||
      attempt.percent > bestAttempt.percent ||
      (attempt.percent === bestAttempt.percent && attempt.completed_at > bestAttempt.completed_at)
    ) {
      bestAttempt = attempt;
    }
  }

  return (
    <div>
      <ScrollResetOnMount />
      <PageBreadcrumbs
        backHref={subjectId ? `/dashboard/subjects/${subjectId}` : "/dashboard/subjects"}
        backLabel={subjectId ? `${subjectName} Chapters` : "All Subjects"}
        crumbs={[
          { href: "/dashboard/subjects", label: "Subjects" },
          ...(subjectId ? [{ href: `/dashboard/subjects/${subjectId}`, label: subjectName }] : []),
          { href: `/dashboard/chapters/${chapter.id}`, label: `Ch. ${chapter.chapter_no}` },
        ]}
      />
      <Header
        title={`Ch. ${chapter.chapter_no}: ${chapter.title}`}
        subtitle={`${subjectName} · ${videos?.length ?? 0} lessons`}
      />

      <div className="space-y-3">
        {(videos ?? []).map((video) => {
          const prog = progressMap.get(video.id);
          const isCompleted = prog?.completed ?? false;
          const watchedPct = prog?.watched_percentage ?? 0;

          return (
            <Link key={video.id} href={`/dashboard/watch/${video.id}`}>
              <ClayCard className="!p-4 group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isCompleted
                      ? "bg-green-100 text-green-600"
                      : "clay-surface shadow-clay-pill group-hover:clay-surface-orange group-hover:shadow-clay-orange group-hover:text-white"
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Play className="w-4 h-4 text-orange-primary group-hover:text-white ml-0.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-heading">{video.title}</p>
                    <p className="mt-0.5 text-xs text-body">{formatDuration(video.duration_seconds)}</p>
                    {watchedPct > 0 && !isCompleted && (
                      <div className="mt-2 h-1 bg-orange-primary/10 rounded-full overflow-hidden w-32">
                        <div
                          className="h-full bg-orange-primary rounded-full"
                          style={{ width: `${watchedPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-body">
                    {isCompleted ? "Done" : watchedPct > 0 ? `${watchedPct}%` : ""}
                  </span>
                </div>
              </ClayCard>
            </Link>
          );
        })}
      </div>

      {activeQuiz || fallbackQuiz ? (
        <div className="mt-6">
          <ClayCard hover={false} className="!p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-orange-primary">Chapter Quiz</p>
                <h2 className="mt-2 text-lg font-bold text-heading font-poppins">
                  Test your understanding of Chapter {chapter.chapter_no}
                </h2>
                <p className="mt-1 text-sm text-body">
                  {(activeQuiz?.question_count ?? fallbackQuiz?.questionCount ?? 0)} questions · Available any time while you work through this chapter
                </p>
                {bestAttempt ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getQuizMasteryClasses(getQuizMasteryLevel(bestAttempt.percent))}`}>
                      {getQuizMasteryLabel(getQuizMasteryLevel(bestAttempt.percent))}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                      Best score: {bestAttempt.percent}% · {bestAttempt.correct_answers}/{bestAttempt.total_questions}
                    </span>
                  </div>
                ) : null}
              </div>

              <Link
                href={`/dashboard/chapters/${chapter.id}/quiz`}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange"
              >
                <Trophy className="h-4 w-4" />
                {bestAttempt ? "Retake quiz" : "Start quiz"}
              </Link>
            </div>
          </ClayCard>
        </div>
      ) : null}
    </div>
  );
}
