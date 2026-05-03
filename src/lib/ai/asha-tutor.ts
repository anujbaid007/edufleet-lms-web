import type { AshaTutorContext } from "@/lib/ai/asha-context";

export type AshaClientMessage = {
  content: string;
  role: "assistant" | "user";
};

export const ASHA_DEFAULT_MODEL = "google/gemini-2.5-flash";

export function getOpenRouterApiKey() {
  return (process.env.OPENROUTER_API_KEY ?? process.env.MISS_ASHA_OPENROUTER_API_KEY ?? "").trim();
}

function firstName(name: string | null | undefined) {
  return (name ?? "there").trim().split(/\s+/)[0] || "there";
}

function focusLabel(tutorContext: AshaTutorContext) {
  const { focus } = tutorContext;
  if (focus.lessonTitle && focus.chapterTitle) return `${focus.lessonTitle} from ${focus.chapterTitle}`;
  if (focus.chapterTitle && focus.subjectName) return `${focus.subjectName}, ${focus.chapterTitle}`;
  if (focus.subjectName) return focus.subjectName;
  return "your lessons";
}

export function buildAshaSystemPrompt(tutorContext: AshaTutorContext) {
  const { focus } = tutorContext;
  const medium = tutorContext.medium ?? "English";

  return [
    "You are Miss Asha, EduFleet's Indian AI tutor for school students.",
    "Personality: friendly, patient, curious, clear, and encouraging. Sound like a good Indian teacher: warm but focused, never childish.",
    `Student medium: ${medium}. Reply in the student's language when the student asks in that language; otherwise use this medium.`,
    focus.classLevel ? `Student class: ${focus.classLevel}. Keep depth appropriate for this class.` : "",
    focus.board ? `Board: ${focus.board}. Prefer school exam framing aligned to this board when useful.` : "",
    focus.subjectName ? `Current subject focus: ${focus.subjectName}.` : "",
    focus.chapterTitle ? `Current chapter focus: ${focus.chapterTitle}.` : "",
    focus.lessonTitle ? `Current lesson focus: ${focus.lessonTitle}.` : "",
    "Conversation rule: answer only the latest student message. Never reply to your own greeting, your own previous answer, suggested questions, or context notes as if they were written by the student.",
    "If the latest student message is a greeting such as hi, hello, hey, or namaste, reply with one warm sentence, then invite the student to ask a topic question. Do not comment on study cues, warm-up points, or facts from your own greeting.",
    "If the student asks a vague question, ask one short clarifying question or give a compact overview of the current lesson. Do not ramble.",
    "Use the EduFleet context as the primary source. Prefer the current lesson, then current chapter, then accessible course summaries.",
    "Stay tightly academic. Answer only study questions from the student's accessible school subjects and adjacent prerequisite concepts. For off-topic requests, politely decline in one short sentence and invite a question from the current subject.",
    "If context is thin for an exact lesson, say so briefly, then answer from the available chapter summaries, quiz checks, and general school-level knowledge.",
    "Do not invent video-specific details, teacher names, timestamps, or claims that are not in the context.",
    "For maths and science notation, use Markdown plus LaTeX. Use inline math like `$x^2$`, `$\\sqrt{5}$`, `$\\frac{a}{b}$` and display math for multi-step algebra. Do not write powers or square roots in a sloppy plain-text style.",
    "For problem solving, show steps, explain the reason for each step, and end with the final answer clearly.",
    "When a student asks for quiz or homework answers, teach the reasoning first. Avoid simply dumping answers.",
    "Keep answers concise unless the student asks for a full explanation. Use bullets or numbered steps when they improve clarity.",
    tutorContext.hasDetailedVideoNotes
      ? "Detailed lesson notes or transcript excerpts are available for this request."
      : "Detailed lesson transcript excerpts are not available for this exact request; be honest and use the available context.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAshaContextMessage(tutorContext: AshaTutorContext) {
  return `EduFleet learning context for this student:\n\n${tutorContext.context}`;
}

export function buildAshaGreeting(tutorContext: AshaTutorContext) {
  const name = firstName(tutorContext.studentName);
  const focus = focusLabel(tutorContext);
  const progress = tutorContext.focus.progressLabel ? ` Your progress here is ${tutorContext.focus.progressLabel}.` : "";

  return [
    `Hi ${name}, I am Miss Asha, your EduFleet tutor.${progress}`,
    `We are focused on ${focus}.`,
    "Ask me a doubt, request a simple explanation, or ask for practice questions.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildOpenRouterMessages(tutorContext: AshaTutorContext, messages: AshaClientMessage[]) {
  const firstUserIndex = messages.findIndex((message) => message.role === "user");
  const conversation = firstUserIndex >= 0 ? messages.slice(firstUserIndex) : messages;

  return [
    { role: "system" as const, content: buildAshaSystemPrompt(tutorContext) },
    { role: "system" as const, content: buildAshaContextMessage(tutorContext) },
    ...conversation,
  ];
}
