import { NextRequest, NextResponse } from "next/server";
import { buildAshaTutorContext, type AshaPageContext } from "@/lib/ai/asha-context";
import {
  ASHA_DEFAULT_MODEL,
  buildAshaGreeting,
  buildOpenRouterMessages,
  getOpenRouterApiKey,
  type AshaClientMessage,
} from "@/lib/ai/asha-tutor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2400;
const ASSISTANT_GREETING_PATTERNS = [
  /^hi\b[\s\S]{0,120}\bi am miss asha\b/i,
  /^hello\b[\s\S]{0,120}\bi am miss asha\b/i,
  /\ba few useful starting points from this lesson\b/i,
  /\ba few fun facts to warm up\b/i,
];

function sanitizeMessages(value: unknown) {
  if (!Array.isArray(value)) return [] as AshaClientMessage[];

  const messages = value
    .filter((item): item is AshaClientMessage => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<AshaClientMessage>;
      return (
        (candidate.role === "assistant" || candidate.role === "user") &&
        typeof candidate.content === "string" &&
        candidate.content.trim().length > 0
      );
    })
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_MESSAGE_CHARS),
    }));

  const withoutBootstrapGreeting = messages.filter(
    (message, index) =>
      !(
        index === 0 &&
        message.role === "assistant" &&
        ASSISTANT_GREETING_PATTERNS.some((pattern) => pattern.test(message.content))
      )
  );

  const firstUserIndex = withoutBootstrapGreeting.findIndex((message) => message.role === "user");
  return firstUserIndex >= 0 ? withoutBootstrapGreeting.slice(firstUserIndex) : withoutBootstrapGreeting;
}

function cleanContextValue(value: unknown, maxLength = 120) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function sanitizePageContext(value: unknown): AshaPageContext {
  if (!value || typeof value !== "object") return {};
  const candidate = value as AshaPageContext;

  return {
    currentChapterId: cleanContextValue(candidate.currentChapterId),
    currentPath: cleanContextValue(candidate.currentPath, 240),
    currentSubjectId: cleanContextValue(candidate.currentSubjectId),
    currentVideoId: cleanContextValue(candidate.currentVideoId),
  };
}

function getModel() {
  return process.env.OPENROUTER_MODEL || ASHA_DEFAULT_MODEL;
}

async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { session, supabase };
}

function serializeFocus(tutorContext: NonNullable<Awaited<ReturnType<typeof buildAshaTutorContext>>>) {
  const { focus } = tutorContext;
  return {
    chapterTitle: focus.chapterTitle,
    lessonTitle: focus.lessonTitle,
    progressLabel: focus.progressLabel,
    subjectName: focus.subjectName,
  };
}

function hasFocusedTopic(tutorContext: NonNullable<Awaited<ReturnType<typeof buildAshaTutorContext>>>) {
  const { focus } = tutorContext;
  return Boolean(focus.lessonTitle || focus.chapterTitle || focus.subjectName);
}

function isDashboardTopicRequest(message: string) {
  return (
    /\b(this|current)\s+(topic|lesson|chapter|subject)\b/i.test(message) &&
    /\b(practice|question|questions|quiz|exam|explain|points?)\b/i.test(message)
  );
}

function isGreetingOnly(message: string) {
  return /^(hi|hello|hey|namaste|good\s+(morning|afternoon|evening))[\s!.?,]*$/i.test(message.trim());
}

function cleanAssistantAnswer(answer: string, latestUserMessage: string) {
  const trimmedAnswer = answer.trim();
  if (isGreetingOnly(latestUserMessage)) return trimmedAnswer;

  let cleaned = trimmedAnswer;
  for (let count = 0; count < 4; count += 1) {
    const firstSentence = cleaned.match(/^([^.!?\n]+[.!?])\s*/);
    if (!firstSentence) break;

    const sentence = firstSentence[1].toLowerCase();
    const isIntroSentence =
      /^(hi|hello|hey|namaste)[!.]?$/i.test(firstSentence[1].trim()) ||
      sentence.includes("miss asha") ||
      sentence.includes("edufleet") ||
      sentence.includes("ai tutor") ||
      sentence.includes("here to help") ||
      sentence.includes("ready to help");

    if (!isIntroSentence) break;
    cleaned = cleaned.slice(firstSentence[0].length).trimStart();
  }

  return cleaned || trimmedAnswer;
}

export async function GET(request: NextRequest) {
  const { session, supabase } = await getSessionContext();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const pageContext = sanitizePageContext({
    currentChapterId: searchParams.get("currentChapterId"),
    currentPath: searchParams.get("currentPath"),
    currentSubjectId: searchParams.get("currentSubjectId"),
    currentVideoId: searchParams.get("currentVideoId"),
  });
  const tutorContext = await buildAshaTutorContext(supabase, session.user.id, pageContext);

  if (!tutorContext) {
    return NextResponse.json({ error: "Unable to load your learning context." }, { status: 404 });
  }

  return NextResponse.json({
    focus: serializeFocus(tutorContext),
    greeting: buildAshaGreeting(tutorContext),
    model: getModel(),
    suggestions: tutorContext.suggestedQuestions.slice(0, 4),
  });
}

export async function POST(request: NextRequest) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    console.error("[Miss Asha] Missing OpenRouter API key in the server runtime.");
    return NextResponse.json(
      { error: "Miss Asha is not connected to her tutor model yet. Please try again shortly." },
      { status: 503 }
    );
  }

  const { session, supabase } = await getSessionContext();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const payload = body as { messages?: unknown; pageContext?: unknown };
  const messages = sanitizeMessages(payload.messages);
  const pageContext = sanitizePageContext(payload.pageContext);
  const latestUserMessage = messages.filter((message) => message.role === "user").at(-1);

  if (!latestUserMessage) {
    return NextResponse.json({ error: "Please send a question for Miss Asha." }, { status: 400 });
  }

  const tutorContext = await buildAshaTutorContext(supabase, session.user.id, pageContext, latestUserMessage.content);
  if (!tutorContext) {
    return NextResponse.json({ error: "Unable to load your learning context." }, { status: 404 });
  }

  const model = getModel();

  if (!hasFocusedTopic(tutorContext) && isDashboardTopicRequest(latestUserMessage.content)) {
    return NextResponse.json({
      focus: serializeFocus(tutorContext),
      message:
        "Please open a subject, chapter, or lesson first, then I can give you practice questions from that exact topic.",
      model,
    });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://edufleet.in",
        "X-Title": "EduFleet Miss Asha",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1100,
        temperature: 0.28,
        top_p: 0.9,
        user: session.user.id,
        messages: buildOpenRouterMessages(tutorContext, messages),
      }),
    });

    if (!response.ok) {
      await response.text();
      return NextResponse.json(
        { error: "Miss Asha could not answer right now. Please try again in a moment." },
        { status: response.status }
      );
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;

    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ error: "Miss Asha returned an empty answer." }, { status: 502 });
    }

    return NextResponse.json({
      focus: serializeFocus(tutorContext),
      message: cleanAssistantAnswer(answer, latestUserMessage.content),
      model: data?.model ?? model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Miss Asha is unavailable right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
