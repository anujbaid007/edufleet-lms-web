import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { PageBreadcrumbs } from "@/components/dashboard/page-breadcrumbs";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import { ChapterQuiz } from "@/components/quiz/chapter-quiz";
import {
  getQuizMasteryLevel,
  isQuizSchemaUnavailableError,
  type QuizMasteryLevel,
} from "@/lib/quiz";
import { listFallbackAttemptsForUser, loadFallbackQuiz } from "@/lib/dev-quiz-fallback";

export const metadata = { title: "Chapter Quiz" };
export const dynamic = "force-dynamic";

export default async function ChapterQuizPage({ params }: { params: { id: string } }) {
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

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, title_hindi, chapter_no, class, board, medium, subject_id, subjects(id, name)")
    .eq("id", params.id)
    .single();

  if (!chapter) redirect("/dashboard");

  if (profile.class !== null && chapter.class !== profile.class) redirect(`/dashboard/chapters/${params.id}`);
  if (profile.board && chapter.board !== profile.board) redirect(`/dashboard/chapters/${params.id}`);
  if (profile.medium && chapter.medium !== profile.medium) redirect(`/dashboard/chapters/${params.id}`);

  if (profile.org_id) {
    const { data: restriction } = await supabase
      .from("content_restrictions")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("chapter_id", chapter.id)
      .maybeSingle();

    if (restriction) redirect("/dashboard");
  }

  const subjectMeta = chapter.subjects as unknown as { id: string; name: string } | null;
  const subjectId = subjectMeta?.id ?? "";
  const subjectName = subjectMeta?.name ?? "Subject";

  const { data: quiz, error: quizError } = await supabase
    .from("chapter_quizzes")
    .select("id, question_count")
    .eq("chapter_id", chapter.id)
    .eq("is_published", true)
    .maybeSingle();
  const activeQuiz = isQuizSchemaUnavailableError(quizError) ? null : quiz;
  const fallbackQuiz = !activeQuiz
    ? await loadFallbackQuiz({
        id: chapter.id,
        class: chapter.class,
        medium: chapter.medium,
        chapterNo: chapter.chapter_no,
        title: chapter.title,
        titleHindi: chapter.title_hindi,
        subjectName,
      })
    : null;

  const { data: questions, error: questionsError } = activeQuiz
    ? await supabase
        .from("quiz_questions")
        .select("id, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, cognitive_level, sort_order")
        .eq("quiz_id", activeQuiz.id)
        .order("sort_order")
    : { data: [] };
  const questionRows = isQuizSchemaUnavailableError(questionsError) ? [] : questions ?? [];

  const { data: attempts, error: attemptsError } = activeQuiz
    ? await supabase
        .from("quiz_attempts")
        .select("id, percent, correct_answers, total_questions, completed_at")
        .eq("quiz_id", activeQuiz.id)
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
    : { data: [] };
  const fallbackAttemptRows = !activeQuiz && fallbackQuiz ? await listFallbackAttemptsForUser(userId, chapter.id) : [];
  const normalizedFallbackAttemptRows = fallbackAttemptRows.map((attempt) => ({
    id: attempt.id,
    percent: attempt.percent,
    correct_answers: attempt.correctAnswers,
    total_questions: attempt.totalQuestions,
    completed_at: attempt.completedAt,
  }));
  const attemptRows = (
    activeQuiz
      ? isQuizSchemaUnavailableError(attemptsError)
        ? normalizedFallbackAttemptRows
        : attempts ?? []
      : normalizedFallbackAttemptRows
  ) as Array<{
      id: string;
      percent: number;
      correct_answers: number;
      total_questions: number;
      completed_at: string;
    }>;

  const recentAttempts = attemptRows.slice(0, 3).map((attempt) => ({
    id: attempt.id,
    percent: attempt.percent,
    correctAnswers: attempt.correct_answers,
    totalQuestions: attempt.total_questions,
    masteryLevel: getQuizMasteryLevel(attempt.percent) as QuizMasteryLevel,
    completedAt: attempt.completed_at,
  }));

  const latestAttempt = attemptRows[0]
    ? {
        id: attemptRows[0].id,
        percent: attemptRows[0].percent,
        correctAnswers: attemptRows[0].correct_answers,
        totalQuestions: attemptRows[0].total_questions,
        masteryLevel: getQuizMasteryLevel(attemptRows[0].percent) as QuizMasteryLevel,
        completedAt: attemptRows[0].completed_at,
      }
    : null;

  let bestAttemptRow: (typeof attemptRows)[number] | null = null;

  for (const attempt of attemptRows) {
    if (
      !bestAttemptRow ||
      attempt.percent > bestAttemptRow.percent ||
      (attempt.percent === bestAttemptRow.percent && attempt.completed_at > bestAttemptRow.completed_at)
    ) {
      bestAttemptRow = attempt;
    }
  }

  const bestAttempt = bestAttemptRow
    ? {
        id: bestAttemptRow.id,
        percent: bestAttemptRow.percent,
        correctAnswers: bestAttemptRow.correct_answers,
        totalQuestions: bestAttemptRow.total_questions,
        masteryLevel: getQuizMasteryLevel(bestAttemptRow.percent) as QuizMasteryLevel,
        completedAt: bestAttemptRow.completed_at,
      }
    : null;

  return (
    <div className="space-y-6">
      <ScrollResetOnMount />
      <PageBreadcrumbs
        backHref={`/dashboard/chapters/${chapter.id}`}
        backLabel={`Back to Chapter ${chapter.chapter_no}`}
        crumbs={[
          { href: "/dashboard/subjects", label: "Subjects" },
          ...(subjectId ? [{ href: `/dashboard/subjects/${subjectId}`, label: subjectName }] : []),
          { href: `/dashboard/chapters/${chapter.id}`, label: `Ch. ${chapter.chapter_no}` },
          { href: `/dashboard/chapters/${chapter.id}/quiz`, label: "Quiz" },
        ]}
      />

      <Header
        title={`Chapter Quiz · Ch. ${chapter.chapter_no}`}
        subtitle={`${subjectName} · ${chapter.title}`}
      />

      {!activeQuiz && !fallbackQuiz ? (
        <ClayCard hover={false} className="!p-6">
          <h2 className="text-lg font-bold text-heading">Quiz coming soon</h2>
          <p className="mt-2 text-sm text-body">
            This chapter does not have an MCQ quiz yet. We currently support quiz content from class 6 onward where MCQs are available.
          </p>
          <Link
            href={`/dashboard/chapters/${chapter.id}`}
            className="mt-4 inline-flex rounded-full bg-orange-primary px-4 py-2 text-sm font-semibold text-white shadow-clay-orange"
          >
            Back to chapter
          </Link>
        </ClayCard>
      ) : (
        <ChapterQuiz
          quizId={activeQuiz?.id ?? fallbackQuiz!.quizId}
          chapterTitle={chapter.title}
          chapterNo={chapter.chapter_no}
          subjectName={subjectName}
          questionPool={
            activeQuiz
              ? questionRows.map((question) => ({
                  id: question.id,
                  questionText: question.question_text,
                  options: [question.option_a, question.option_b, question.option_c, question.option_d],
                  correctOption: question.correct_option as 1 | 2 | 3 | 4,
                  difficulty: question.difficulty,
                  cognitiveLevel: question.cognitive_level,
                }))
              : (fallbackQuiz?.questions ?? []).map((question) => ({
                  id: question.id,
                  questionText: question.questionText,
                  options: question.options,
                  correctOption: question.correctOption,
                  difficulty: question.difficulty,
                  cognitiveLevel: question.cognitiveLevel,
                }))
          }
          latestAttempt={latestAttempt}
          bestAttempt={bestAttempt}
          attemptCount={attemptRows.length}
          recentAttempts={recentAttempts}
        />
      )}
    </div>
  );
}
