export type QuizMasteryLevel = "mastered" | "proficient" | "developing" | "needs_practice";

export function getQuizMasteryLevel(percent: number): QuizMasteryLevel {
  if (percent >= 85) return "mastered";
  if (percent >= 70) return "proficient";
  if (percent >= 40) return "developing";
  return "needs_practice";
}

export function getQuizMasteryLabel(level: QuizMasteryLevel) {
  switch (level) {
    case "mastered":
      return "Mastered";
    case "proficient":
      return "Proficient";
    case "developing":
      return "Developing";
    case "needs_practice":
      return "Needs practice";
  }
}

export function getQuizMasteryClasses(level: QuizMasteryLevel) {
  switch (level) {
    case "mastered":
      return "bg-emerald-100 text-emerald-700";
    case "proficient":
      return "bg-blue-100 text-blue-700";
    case "developing":
      return "bg-amber-100 text-amber-700";
    case "needs_practice":
      return "bg-rose-100 text-rose-700";
  }
}

export function isQuizSchemaUnavailableError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return (
    message.includes("Could not find the table 'public.chapter_quizzes' in the schema cache") ||
    message.includes("Could not find the table 'public.quiz_questions' in the schema cache") ||
    message.includes("Could not find the table 'public.quiz_attempts' in the schema cache") ||
    message.includes("Could not find the table 'public.quiz_attempt_answers' in the schema cache")
  );
}
