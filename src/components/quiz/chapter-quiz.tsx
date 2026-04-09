"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  Loader2,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { submitChapterQuizAttempt } from "@/lib/actions/quiz";
import {
  getQuizMasteryClasses,
  getQuizMasteryLabel,
  type QuizMasteryLevel,
} from "@/lib/quiz";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { cn } from "@/lib/utils";

type QuizQuestionView = {
  id: string;
  questionText: string;
  options: string[];
  difficulty: string | null;
  cognitiveLevel: string | null;
  correctOption: 1 | 2 | 3 | 4;
};

type QuizAttemptSummary = {
  id: string;
  percent: number;
  correctAnswers: number;
  totalQuestions: number;
  masteryLevel: QuizMasteryLevel;
  completedAt: string;
};

type AttemptSummary = QuizAttemptSummary | null;

function isValidSelectedOption(value: number | undefined) {
  return value !== undefined && value >= 1 && value <= 4;
}

function getAttemptKey(attempt: AttemptSummary | null) {
  return attempt ? `${attempt.id}:${attempt.completedAt}:${attempt.percent}:${attempt.correctAnswers}` : null;
}

function mergeRecentAttempts(entries: Array<QuizAttemptSummary | null | undefined>) {
  const seen = new Set<string>();
  const deduped: QuizAttemptSummary[] = [];

  for (const attempt of entries) {
    if (!attempt) continue;
    const key = getAttemptKey(attempt);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(attempt);
    if (deduped.length === 3) break;
  }

  return deduped;
}

export function ChapterQuiz({
  quizId,
  chapterTitle,
  chapterNo,
  subjectName,
  questions,
  latestAttempt,
  bestAttempt,
  attemptCount,
  recentAttempts,
}: {
  quizId: string;
  chapterTitle: string;
  chapterNo: number;
  subjectName: string;
  questions: QuizQuestionView[];
  latestAttempt: AttemptSummary;
  bestAttempt: AttemptSummary;
  attemptCount: number;
  recentAttempts: QuizAttemptSummary[];
}) {
  const router = useRouter();
  const pageTopRef = useRef<HTMLDivElement | null>(null);
  const questionPanelRef = useRef<HTMLDivElement | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submittedAttempt, setSubmittedAttempt] = useState<AttemptSummary>(null);
  const [visibleAttemptCount, setVisibleAttemptCount] = useState(attemptCount);
  const [visibleRecentAttempts, setVisibleRecentAttempts] = useState<QuizAttemptSummary[]>(recentAttempts);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [pendingAutoAdvanceQuestionId, setPendingAutoAdvanceQuestionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((value) => isValidSelectedOption(value)).length,
    [answers]
  );
  const unansweredCount = questions.length - answeredCount;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const canSubmit = questions.length > 0 && unansweredCount === 0 && !isPending;
  const hasSubmittedCurrentRun = Boolean(submittedAttempt);
  const currentAttemptNumber = hasSubmittedCurrentRun
    ? Math.max(visibleAttemptCount, 1)
    : Math.max(visibleAttemptCount + 1, 1);
  const mergedRecentAttempts = useMemo(
    () => mergeRecentAttempts([submittedAttempt, ...visibleRecentAttempts]),
    [submittedAttempt, visibleRecentAttempts]
  );
  const activeAttempt = submittedAttempt ?? visibleRecentAttempts[0] ?? latestAttempt;
  const effectiveBestAttempt = useMemo(() => {
    if (!submittedAttempt) return bestAttempt;
    if (!bestAttempt) return submittedAttempt;
    if (submittedAttempt.percent > bestAttempt.percent) return submittedAttempt;
    if (submittedAttempt.percent === bestAttempt.percent && submittedAttempt.completedAt > bestAttempt.completedAt) {
      return submittedAttempt;
    }
    return bestAttempt;
  }, [bestAttempt, submittedAttempt]);
  const activeQuestion = questions[currentQuestionIndex] ?? null;
  const currentSelection = activeQuestion ? answers[activeQuestion.id] ?? null : null;

  const firstIncorrectQuestionIndex = useMemo(
    () => questions.findIndex((question) => answers[question.id] !== question.correctOption),
    [answers, questions]
  );

  const clearAutoAdvance = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    setPendingAutoAdvanceQuestionId(null);
  };

  const scrollToElement = (element: HTMLElement | null) => {
    if (!element) return;

    requestAnimationFrame(() => {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const scrollToPageTop = () => {
    scrollToElement(pageTopRef.current);
  };

  const scrollToQuestionPanel = () => {
    scrollToElement(questionPanelRef.current);
  };

  useEffect(() => () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    setVisibleAttemptCount((current) => Math.max(current, attemptCount));
  }, [attemptCount]);

  useEffect(() => {
    setVisibleRecentAttempts((current) => mergeRecentAttempts([...recentAttempts, ...current]));
  }, [recentAttempts]);

  const goToQuestion = (index: number, options?: { scrollToQuestion?: boolean }) => {
    if (questions.length === 0) return;
    clearAutoAdvance();
    const nextIndex = Math.max(0, Math.min(index, questions.length - 1));
    setCurrentQuestionIndex(nextIndex);
    if (options?.scrollToQuestion) {
      scrollToQuestionPanel();
    }
  };

  const handleAnswerChange = (questionId: string, selectedOption: number) => {
    if (isReviewMode) return;

    clearAutoAdvance();
    setAnswers((current) => ({
      ...current,
      [questionId]: selectedOption,
    }));
    setSubmissionError(null);

    if (currentQuestionIndex < questions.length - 1) {
      setPendingAutoAdvanceQuestionId(questionId);
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        autoAdvanceTimeoutRef.current = null;
        setPendingAutoAdvanceQuestionId(null);
        setCurrentQuestionIndex((current) => Math.min(current + 1, questions.length - 1));
      }, 800);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    clearAutoAdvance();
    setSubmissionError(null);
    startTransition(async () => {
      const result = await submitChapterQuizAttempt(
        quizId,
        questions.map((question) => ({
          questionId: question.id,
          selectedOption: answers[question.id] ?? null,
        }))
      );

      if (result?.error) {
        setSubmissionError(result.error);
        return;
      }

      if (result?.attempt) {
        setSubmittedAttempt(result.attempt);
        setVisibleAttemptCount((current) => current + 1);
        setVisibleRecentAttempts((current) => mergeRecentAttempts([result.attempt, ...current]));
        setIsReviewMode(false);
        setCurrentQuestionIndex(0);
        scrollToPageTop();
        router.refresh();
      }
    });
  };

  const handleRetake = () => {
    clearAutoAdvance();
    setAnswers({});
    setSubmissionError(null);
    setSubmittedAttempt(null);
    setIsReviewMode(false);
    setCurrentQuestionIndex(0);
    scrollToQuestionPanel();
  };

  const handleOpenReview = () => {
    clearAutoAdvance();
    setIsReviewMode(true);
    goToQuestion(firstIncorrectQuestionIndex === -1 ? 0 : firstIncorrectQuestionIndex, {
      scrollToQuestion: true,
    });
  };

  const handleCloseReview = () => {
    clearAutoAdvance();
    setIsReviewMode(false);
    scrollToPageTop();
  };

  if (!activeQuestion) {
    return (
      <ClayCard hover={false} className="!p-6">
        <p className="text-sm font-medium text-body">This quiz does not have any questions yet.</p>
      </ClayCard>
    );
  }

  const isOnFirstQuestion = currentQuestionIndex === 0;
  const isOnLastQuestion = currentQuestionIndex === questions.length - 1;
  const incorrectAnswers = submittedAttempt ? submittedAttempt.totalQuestions - submittedAttempt.correctAnswers : 0;
  const currentQuestionAutoAdvancing = pendingAutoAdvanceQuestionId === activeQuestion.id;
  const attemptHistoryCard =
    mergedRecentAttempts.length > 0 ? (
      <div className="rounded-[28px] bg-white/90 px-6 py-5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-body">Latest 3 results</p>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
            {visibleAttemptCount} total
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {mergedRecentAttempts.map((attempt, index) => {
            const attemptNumber = Math.max(visibleAttemptCount - index, 1);
            return (
              <div
                key={getAttemptKey(attempt) ?? `${attempt.completedAt}-${index}`}
                className="rounded-[22px] bg-slate-50 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-heading">Attempt {attemptNumber}</p>
                    <p className="mt-1 text-xs text-body">
                      {attempt.correctAnswers}/{attempt.totalQuestions} correct
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-heading">{attempt.percent}%</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getQuizMasteryClasses(
                        attempt.masteryLevel
                      )}`}
                    >
                      {getQuizMasteryLabel(attempt.masteryLevel)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <div ref={pageTopRef} className="space-y-6">
      <ClayCard hover={false} className="!p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-orange-primary">Chapter Quiz</p>
            <h2 className="mt-2 text-2xl font-bold text-heading font-poppins">
              Ch. {chapterNo}: {chapterTitle}
            </h2>
            <p className="mt-1 text-sm text-body">
              {subjectName} · {questions.length} questions · Move one question at a time and jump freely when you need to.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Attempt {currentAttemptNumber}
            </span>
            {effectiveBestAttempt ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getQuizMasteryClasses(effectiveBestAttempt.masteryLevel)}`}
              >
                Best: {effectiveBestAttempt.percent}% · {getQuizMasteryLabel(effectiveBestAttempt.masteryLevel)}
              </span>
            ) : null}
            {activeAttempt ? (
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                Latest: {activeAttempt.percent}% · {activeAttempt.correctAnswers}/{activeAttempt.totalQuestions}
              </span>
            ) : null}
          </div>
        </div>
      </ClayCard>

      <div className="grid gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
        <ClayCard hover={false} className="!p-5 order-last xl:order-first">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-heading">Question navigator</p>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                  {isReviewMode ? "Review mode" : hasSubmittedCurrentRun ? "Results view" : "Attempt mode"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-body">
                {answeredCount}/{questions.length} answered · {unansweredCount} remaining
              </p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-orange-primary/10">
              <div
                className="h-full rounded-full bg-orange-primary transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((question, index) => {
                const selectedOption = answers[question.id];
                const answered = isValidSelectedOption(selectedOption);
                const isCurrent = index === currentQuestionIndex;
                const isCorrect = answered && selectedOption === question.correctOption;
                const isIncorrect = answered && selectedOption !== question.correctOption;

                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => goToQuestion(index, { scrollToQuestion: true })}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold transition-all",
                      hasSubmittedCurrentRun
                        ? isCorrect
                          ? "bg-emerald-50 text-emerald-700 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.22)]"
                          : isIncorrect
                            ? "bg-rose-50 text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.22)]"
                            : "bg-white text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]"
                        : answered
                          ? "bg-orange-50 text-orange-700 shadow-[inset_0_0_0_1px_rgba(232,135,30,0.18)]"
                          : "bg-white text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]",
                      isCurrent && "ring-2 ring-slate-900/80 ring-offset-2 ring-offset-white"
                    )}
                    aria-label={`Go to question ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 rounded-[24px] bg-white/85 p-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
              <p className="text-sm font-semibold text-heading">
                {hasSubmittedCurrentRun ? "Attempt summary" : "Attempt status"}
              </p>
              {hasSubmittedCurrentRun ? (
                <div className="space-y-2 text-sm text-body">
                  <p>
                    Score: <span className="font-semibold text-heading">{submittedAttempt!.percent}%</span>
                  </p>
                  <p>
                    Correct:{" "}
                    <span className="font-semibold text-heading">
                      {submittedAttempt!.correctAnswers}/{submittedAttempt!.totalQuestions}
                    </span>
                  </p>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getQuizMasteryClasses(
                      submittedAttempt!.masteryLevel
                    )}`}
                  >
                    {getQuizMasteryLabel(submittedAttempt!.masteryLevel)}
                  </span>
                </div>
              ) : (
                <p className="text-sm leading-6 text-body">
                  Answer everything, then submit once you are ready. Your best score feeds progress and mastery.
                </p>
              )}
            </div>

            {!hasSubmittedCurrentRun ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-primary px-4 py-3 text-sm font-semibold text-white shadow-clay-orange transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Trophy className="h-4 w-4" />
                      Submit quiz
                    </>
                  )}
                </button>
                {submissionError ? <p className="text-sm font-medium text-rose-600">{submissionError}</p> : null}
              </div>
            ) : null}

            {!hasSubmittedCurrentRun ? attemptHistoryCard : null}
          </div>
        </ClayCard>

        <div ref={questionPanelRef} className="order-first xl:order-last">
        {hasSubmittedCurrentRun && !isReviewMode ? (
          <ClayCard hover={false} className="!p-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <div>
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-2xl font-bold text-heading font-poppins">Quiz results</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-body">
                    You scored {submittedAttempt!.correctAnswers}/{submittedAttempt!.totalQuestions} with{" "}
                    {submittedAttempt!.percent}%. Review every answer to understand where you were strong and where the
                    chapter needs another pass.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[150px_repeat(3,minmax(0,1fr))]">
                  <div className="flex min-w-0 items-center justify-center rounded-[28px] bg-white/85 px-5 py-6 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                    <ProgressRing percentage={submittedAttempt!.percent} size={110} strokeWidth={9}>
                      <div className="text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-body">Score</p>
                        <p className="mt-1 text-2xl font-bold text-heading">{submittedAttempt!.percent}%</p>
                      </div>
                    </ProgressRing>
                  </div>

                  <div className="min-w-0 rounded-[28px] bg-emerald-50 px-5 py-5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.12)]">
                    <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-emerald-700">
                      Correct
                    </p>
                    <p className="mt-3 text-3xl font-bold text-emerald-800">{submittedAttempt!.correctAnswers}</p>
                    <p className="mt-2 text-sm text-emerald-800/80">Questions answered correctly</p>
                  </div>

                  <div className="min-w-0 rounded-[28px] bg-rose-50 px-5 py-5 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.12)]">
                    <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-rose-700">
                      Incorrect
                    </p>
                    <p className="mt-3 text-3xl font-bold text-rose-800">{incorrectAnswers}</p>
                    <p className="mt-2 text-sm text-rose-800/80">Questions to revisit</p>
                  </div>

                  <div className="min-w-0 rounded-[28px] bg-sky-50 px-5 py-5 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.12)]">
                    <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-sky-700">
                      Attempt
                    </p>
                    <p className="mt-3 text-3xl font-bold text-sky-800">{submittedAttempt!.totalQuestions}</p>
                    <p className="mt-2 text-sm text-sky-800/80">Questions completed in this run</p>
                  </div>
                </div>

                <div className="rounded-[28px] bg-white/85 px-5 py-5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-heading">Performance split</p>
                    <p className="text-sm text-body">
                      {submittedAttempt!.correctAnswers} correct · {incorrectAnswers} incorrect
                    </p>
                  </div>
                  <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-100">
                    <div className="flex h-full w-full">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${(submittedAttempt!.correctAnswers / submittedAttempt!.totalQuestions) * 100}%`,
                        }}
                      />
                      <div
                        className="h-full bg-rose-400"
                        style={{
                          width: `${(incorrectAnswers / submittedAttempt!.totalQuestions) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] bg-emerald-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        Stronger zone
                      </p>
                      <p className="mt-2 text-sm leading-6 text-emerald-900">
                        {submittedAttempt!.correctAnswers} answers landed correctly. Use review mode to lock in the
                        reasoning behind them.
                      </p>
                    </div>
                    <div className="rounded-[22px] bg-rose-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">
                        Needs another look
                      </p>
                      <p className="mt-2 text-sm leading-6 text-rose-900">
                        {incorrectAnswers} answers need revision. Review first, then retake the quiz when you are ready.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] bg-slate-50 px-6 py-5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-body">Mastery</p>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span
                      className={`rounded-full px-4 py-2 text-sm font-semibold ${getQuizMasteryClasses(
                        submittedAttempt!.masteryLevel
                      )}`}
                    >
                      {getQuizMasteryLabel(submittedAttempt!.masteryLevel)}
                    </span>
                    <span className="text-2xl font-bold text-heading">{submittedAttempt!.percent}%</span>
                  </div>
                </div>

                <div className="rounded-[28px] bg-white/90 px-6 py-5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-body">Next step</p>
                  <p className="mt-3 text-sm leading-6 text-body">
                    Review your answers first to see the exact mistakes, then retake the quiz if you want to improve the
                    score and mastery level.
                  </p>
                  <div className="mt-5 space-y-3">
                    <button
                      type="button"
                      onClick={handleOpenReview}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-primary px-4 py-3 text-sm font-semibold text-white shadow-clay-orange"
                    >
                      <Eye className="h-4 w-4" />
                      Review answers
                    </button>
                    <button
                      type="button"
                      onClick={handleRetake}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.1)]"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Retake quiz
                    </button>
                  </div>
                </div>

                {attemptHistoryCard}
              </div>
            </div>
          </ClayCard>
        ) : (
          <ClayCard hover={false} className="!p-6">
            <div className="space-y-6">
              {/* Mobile-only progress strip — shows answer count since navigator is below on mobile */}
              <div className="xl:hidden">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-body">
                  <span>{answeredCount}/{questions.length} answered</span>
                  <span className="text-orange-primary">{progressPercent}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-orange-primary/10">
                  <div
                    className="h-full rounded-full bg-orange-primary transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-primary">
                    {isReviewMode ? "Reviewing" : "Question"} {currentQuestionIndex + 1} of {questions.length}
                  </p>
                  <h3 className="mt-2 text-2xl font-bold leading-8 text-slate-950 font-poppins">
                    {activeQuestion.questionText}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeQuestion.difficulty ? (
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-semibold text-orange-700">
                      {activeQuestion.difficulty}
                    </span>
                  ) : null}
                  {activeQuestion.cognitiveLevel ? (
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]">
                      {activeQuestion.cognitiveLevel}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3">
                {activeQuestion.options.map((option, optionIndex) => {
                  const optionNumber = optionIndex + 1;
                  const selected = currentSelection === optionNumber;
                  const isCorrectOption = activeQuestion.correctOption === optionNumber;
                  const isWrongSelection = isReviewMode && selected && !isCorrectOption;
                  const isCorrectHighlight = isReviewMode && isCorrectOption;

                  return (
                    <motion.button
                      key={`${activeQuestion.id}-${optionNumber}`}
                      type="button"
                      onClick={() => handleAnswerChange(activeQuestion.id, optionNumber)}
                      disabled={isReviewMode}
                      whileTap={isReviewMode ? undefined : { scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className={cn(
                        "flex items-start gap-4 rounded-[24px] px-4 py-4 text-left transition-colors",
                        isReviewMode
                          ? isCorrectHighlight
                            ? "bg-emerald-50 shadow-[inset_0_0_0_2px_rgba(16,185,129,0.22)]"
                            : isWrongSelection
                              ? "bg-rose-50 shadow-[inset_0_0_0_2px_rgba(244,63,94,0.18)]"
                              : "bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]"
                          : selected
                            ? "bg-orange-50 shadow-[inset_0_0_0_2px_rgba(232,135,30,0.18)]"
                            : "bg-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] hover:-translate-y-0.5"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                          isReviewMode
                            ? isCorrectHighlight
                              ? "bg-emerald-600 text-white"
                              : isWrongSelection
                                ? "bg-rose-600 text-white"
                                : "bg-slate-100 text-heading"
                            : selected
                              ? "bg-orange-primary text-white"
                              : "bg-slate-100 text-heading"
                        )}
                      >
                        {optionNumber}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-6 text-slate-900">{option}</p>
                        {isReviewMode && isCorrectHighlight ? (
                          <p className="mt-2 text-xs font-semibold text-emerald-700">Correct answer</p>
                        ) : null}
                        {isReviewMode && isWrongSelection ? (
                          <p className="mt-2 text-xs font-semibold text-rose-700">Your answer</p>
                        ) : null}
                        {!isReviewMode && selected ? (
                          <p className="mt-2 text-xs font-semibold text-orange-700">
                            {currentQuestionAutoAdvancing ? "Selected · moving to next question..." : "Selected"}
                          </p>
                        ) : null}
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-4 border-t border-orange-primary/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-heading">
                    {isReviewMode
                      ? `Reviewing question ${currentQuestionIndex + 1} of ${questions.length}`
                      : `Question ${currentQuestionIndex + 1} of ${questions.length}`}
                  </p>
                  <p className="mt-1 text-sm text-body">
                    {isReviewMode
                      ? "Green shows the correct option. Red marks any answer you selected incorrectly."
                      : currentQuestionAutoAdvancing
                        ? "Selection saved. Moving to the next question..."
                      : unansweredCount === 0
                        ? "All questions are answered. You can submit now or revisit any question."
                        : `${unansweredCount} question${unansweredCount === 1 ? "" : "s"} still need answers before submission.`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {hasSubmittedCurrentRun && isReviewMode ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCloseReview}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.1)]"
                      >
                        <Eye className="h-4 w-4" />
                        Back to results
                      </button>
                      <button
                        type="button"
                        onClick={handleRetake}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.1)]"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Retake quiz
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => goToQuestion(currentQuestionIndex - 1)}
                    disabled={isOnFirstQuestion}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-heading shadow-[inset_0_0_0_1px_rgba(15,23,42,0.1)] transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Previous
                  </button>

                  {isReviewMode ? (
                    <button
                      type="button"
                      onClick={() => goToQuestion(currentQuestionIndex + 1)}
                      disabled={isOnLastQuestion}
                      className="inline-flex items-center gap-2 rounded-full bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : isOnLastQuestion ? (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="inline-flex items-center gap-2 rounded-full bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Trophy className="h-4 w-4" />
                          Submit quiz
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => goToQuestion(currentQuestionIndex + 1)}
                      className="inline-flex items-center gap-2 rounded-full bg-orange-primary px-4 py-2.5 text-sm font-semibold text-white shadow-clay-orange"
                    >
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </ClayCard>
        )}
        </div>
      </div>
    </div>
  );
}
