"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  AlertCircle,
  BookOpenCheck,
  Loader2,
  Minimize2,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/language-context";

type ChatMessage = {
  content: string;
  id: string;
  isBootstrap?: boolean;
  role: "assistant" | "user";
};

type PageContext = {
  currentChapterId: string | null;
  currentPath: string;
  currentSubjectId: string | null;
  currentVideoId: string | null;
};

type BootstrapFocus = {
  chapterTitle?: string | null;
  lessonTitle?: string | null;
  progressLabel?: string | null;
  subjectName?: string | null;
};

type StoredChatState = {
  focus: BootstrapFocus | null;
  messages: ChatMessage[];
  suggestions: string[];
};

const FALLBACK_MESSAGE =
  "Hi, I am Miss Asha, your EduFleet tutor. Ask me anything from your current lesson or chapter.";
const CHAT_STORAGE_KEY = "edufleet:miss-asha-chat:v3:global";
const PREVIOUS_GLOBAL_CHAT_STORAGE_KEY = "edufleet:miss-asha-chat:v2:global";
const LEGACY_CHAT_STORAGE_PREFIX = "edufleet:miss-asha-chat:v1";
const DASHBOARD_SUGGESTIONS = [
  "Help me choose what to study next.",
  "Show my recent lessons.",
  "Which subject should I revise first?",
  "Give me a quick study plan for today.",
];
const MAX_STORED_MESSAGES = 10;

function parsePageContext(pathname: string): PageContext {
  const watchMatch = pathname.match(/^\/dashboard\/watch\/([^/]+)/);
  const chapterMatch = pathname.match(/^\/dashboard\/chapters\/([^/]+)/);
  const subjectMatch = pathname.match(/^\/dashboard\/subjects\/([^/]+)/);

  return {
    currentChapterId: chapterMatch?.[1] ?? null,
    currentPath: pathname,
    currentSubjectId: subjectMatch?.[1] ?? null,
    currentVideoId: watchMatch?.[1] ?? null,
  };
}

function newMessageId(prefix = "asha") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function AshaAvatar({ small = false }: { small?: boolean }) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full border border-orange-primary/20 bg-[#FFF4E5] shadow-[inset_3px_3px_7px_rgba(255,255,255,0.85),inset_-5px_-5px_10px_rgba(214,145,74,0.16),0_12px_26px_rgba(122,75,25,0.16)]",
        small ? "h-9 w-9" : "h-12 w-12"
      )}
      aria-hidden="true"
    >
      <Image
        alt=""
        className="h-full w-full object-cover"
        height={small ? 36 : 48}
        priority={!small}
        src="/miss-asha-avatar.webp"
        width={small ? 36 : 48}
      />
    </div>
  );
}

function AshaMessageContent({ content, role }: { content: string; role: ChatMessage["role"] }) {
  const isUser = role === "user";

  return (
    <div className={cn("asha-message min-w-0 break-words text-sm leading-6", isUser ? "text-white" : "text-heading")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ children, href }) => (
            <a
              className={cn("font-semibold underline underline-offset-4", isUser ? "text-white" : "text-orange-primary")}
              href={href}
              rel="noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          code: ({ children, className, ...props }) => (
            <code
              className={cn(
                className,
                className
                  ? "text-[0.85rem]"
                  : "rounded-md px-1.5 py-0.5 text-[0.82rem] font-semibold",
                !className && (isUser ? "bg-white/18 text-white" : "bg-orange-primary/10 text-heading")
              )}
              {...props}
            >
              {children}
            </code>
          ),
          li: ({ children }) => <li className="pl-1">{children}</li>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          pre: ({ children }) => (
            <pre
              className={cn(
                "my-3 max-w-full overflow-x-auto rounded-xl p-3 text-xs",
                isUser ? "bg-white/15 text-white" : "bg-[#2E251D] text-[#FFF8F0]"
              )}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-orange-primary/15">
              <table className="w-full min-w-[320px] border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-orange-primary/10">{children}</tbody>,
          td: ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
          th: ({ children }) => <th className="bg-orange-primary/10 px-3 py-2 font-bold">{children}</th>,
          thead: ({ children }) => <thead>{children}</thead>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function buildQueryString(pageContext: PageContext) {
  const params = new URLSearchParams();
  Object.entries(pageContext).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === "string" &&
    typeof message.content === "string" &&
    (message.role === "assistant" || message.role === "user") &&
    (message.isBootstrap === undefined || typeof message.isBootstrap === "boolean")
  );
}

function hasFocusedTopic(focus: BootstrapFocus | null) {
  return Boolean(focus?.lessonTitle || focus?.chapterTitle || focus?.subjectName);
}

function normalizeStoredSuggestions(focus: BootstrapFocus | null, suggestions: string[]) {
  if (!hasFocusedTopic(focus)) return DASHBOARD_SUGGESTIONS;
  return suggestions.map((suggestion) => suggestion.replace(/^Ask me 3 practice questions/i, "Give me 3 practice questions"));
}

function cleanStoredAssistantMessage(message: ChatMessage) {
  if (message.role !== "assistant" || message.isBootstrap) return message;

  const content = message.content
    .replace(
      /^(?:hello|hi|hey|namaste)[!.]?\s*(?:i['’]?m|i am)\s+miss asha,\s+your\s+(?:ai\s+)?tutor\s+from\s+edufleet\.\s*/i,
      ""
    )
    .replace(/^i['’]?m\s+(?:here|ready)\s+to\s+help\s+you\s+(?:with|understand)[^.!?]*[.!?]\s*/i, "")
    .trim();

  return content ? { ...message, content } : message;
}

function readStoredChatState(pageContextKey: string): StoredChatState | null {
  if (typeof window === "undefined") return null;

  try {
    const rawState =
      window.localStorage.getItem(CHAT_STORAGE_KEY) ??
      window.localStorage.getItem(PREVIOUS_GLOBAL_CHAT_STORAGE_KEY) ??
      window.localStorage.getItem(`${LEGACY_CHAT_STORAGE_PREFIX}:${pageContextKey}`);
    if (!rawState) return null;

    const state = JSON.parse(rawState) as Partial<StoredChatState>;
    const messages = Array.isArray(state.messages)
      ? state.messages.filter(isChatMessage).map(cleanStoredAssistantMessage).slice(-MAX_STORED_MESSAGES)
      : [];
    const suggestions = Array.isArray(state.suggestions)
      ? state.suggestions.filter((suggestion): suggestion is string => typeof suggestion === "string").slice(0, 4)
      : [];

    if (!messages.length) return null;
    const focus = state.focus && typeof state.focus === "object" ? state.focus : null;

    return {
      focus,
      messages,
      suggestions: normalizeStoredSuggestions(focus, suggestions),
    };
  } catch {
    return null;
  }
}

function writeStoredChatState(state: StoredChatState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({
        focus: state.focus,
        messages: state.messages.slice(-MAX_STORED_MESSAGES),
        suggestions: state.suggestions.slice(0, 4),
      })
    );
  } catch {
    // Storage can be blocked in private mode; the chat should still work normally.
  }
}

function clearStoredChatState(pageContextKey: string) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
    window.localStorage.removeItem(PREVIOUS_GLOBAL_CHAT_STORAGE_KEY);
    window.localStorage.removeItem(`${LEGACY_CHAT_STORAGE_PREFIX}:${pageContextKey}`);
  } catch {
    // Ignore storage failures; refresh still resets the in-memory chat.
  }
}

export function MissAshaChat() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrappedKey, setBootstrappedKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [focus, setFocus] = useState<BootstrapFocus | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const pageContext = useMemo(() => parsePageContext(pathname), [pathname]);
  const pageContextKey = useMemo(() => JSON.stringify(pageContext), [pageContext]);
  const inputPlaceholder = lang === "hi" ? "अपना सवाल पूछें..." : "Ask from this lesson...";
  const topicText = focus?.lessonTitle ?? focus?.chapterTitle ?? focus?.subjectName ?? null;
  const disableInput = isSending || (isBootstrapping && messages.length === 0);

  useEffect(() => {
    if (!open || bootstrappedKey === pageContextKey) return;

    let cancelled = false;

    async function loadGreeting() {
      setIsBootstrapping(true);
      setError(null);

      try {
        const storedState = readStoredChatState(pageContextKey);
        if (storedState) {
          if (cancelled) return;
          setMessages(storedState.messages);
          setSuggestions(storedState.suggestions);
          setFocus(storedState.focus);
          setBootstrappedKey(pageContextKey);
        }

        const response = await fetch(`/api/asha/chat?${buildQueryString(pageContext)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Miss Asha could not load your lesson context.");
        }

        if (cancelled) return;

        if (!storedState) {
          setMessages([
            {
              content: data?.greeting || FALLBACK_MESSAGE,
              id: newMessageId("greeting"),
              isBootstrap: true,
              role: "assistant",
            },
          ]);
        }
        setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions.slice(0, 4) : []);
        setFocus(data?.focus ?? null);
        setBootstrappedKey(pageContextKey);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Miss Asha could not load your lesson context.";
        setMessages((current) =>
          current.length
            ? current
            : [{ content: FALLBACK_MESSAGE, id: newMessageId("fallback"), isBootstrap: true, role: "assistant" }]
        );
        setSuggestions([]);
        setError(message);
        setBootstrappedKey(pageContextKey);
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      }
    }

    loadGreeting();

    return () => {
      cancelled = true;
    };
  }, [bootstrappedKey, open, pageContext, pageContextKey]);

  useEffect(() => {
    if (!bootstrappedKey || bootstrappedKey !== pageContextKey || messages.length === 0) return;
    writeStoredChatState({ focus, messages, suggestions });
  }, [bootstrappedKey, focus, messages, pageContextKey, suggestions]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [isBootstrapping, isSending, messages, open]);

  async function sendQuestion(question: string) {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || disableInput) return;

    const nextUserMessage: ChatMessage = {
      content: trimmedQuestion,
      id: newMessageId("user"),
      role: "user",
    };
    const nextMessages = [...messages, nextUserMessage];

    setMessages(nextMessages);
    setDraft("");
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/asha/chat", {
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => !message.isBootstrap)
            .map(({ role, content }) => ({ role, content })),
          pageContext,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        const rawMessage = data?.error || "Miss Asha could not answer right now.";
        const safeMessage =
          typeof rawMessage === "string" && /OPENROUTER|API[_ -]?KEY|SECRET/i.test(rawMessage)
            ? "Miss Asha is connecting to her tutor model. Please try again shortly."
            : rawMessage;
        throw new Error(safeMessage);
      }

      setMessages((current) => [
        ...current,
        {
          content: data.message,
          id: newMessageId("assistant"),
          role: "assistant",
        },
      ]);
      if (data?.focus) setFocus(data.focus);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Miss Asha could not answer right now.";
      setError(message);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    sendQuestion(draft);
  }

  function resetConversation() {
    clearStoredChatState(pageContextKey);
    setBootstrappedKey(null);
    setMessages([]);
    setSuggestions([]);
    setError(null);
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6">
      {open ? (
        <section
          aria-label="Miss Asha chat"
          className="flex h-[min(700px,calc(100dvh-8rem))] w-[min(460px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-white/75 bg-[#FFF9F1] shadow-[0_28px_80px_rgba(122,75,25,0.24)]"
        >
          <header className="border-b border-orange-primary/10 bg-[#FFF2DE] px-4 py-3">
            <div className="flex items-start gap-3">
              <AshaAvatar />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="shrink-0 font-poppins text-lg font-bold leading-tight text-heading">Miss Asha</h2>
                  <span className="rounded-full border border-orange-primary/15 bg-white/70 px-2 py-0.5 text-[11px] font-bold text-orange-primary">
                    AI Tutor
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs font-semibold text-muted">EduFleet learning companion</p>
                {topicText ? (
                  <span className="mt-2 inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-orange-primary/15 bg-white/70 px-2.5 text-[11px] font-bold text-orange-primary shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8)]">
                    <BookOpenCheck className="h-3 w-3 shrink-0" />
                    <span className="truncate">{topicText}</span>
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  aria-label="Refresh Miss Asha context"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-white/80 hover:text-heading"
                  onClick={resetConversation}
                  type="button"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  aria-label="Minimize Miss Asha"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-white/80 hover:text-heading"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  aria-label="Close Miss Asha"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-white/80 hover:text-heading"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="asha-scrollbar flex-1 space-y-4 overflow-y-auto bg-[#FFFDF8] px-4 py-4">
            {isBootstrapping && messages.length === 0 ? (
              <div className="flex justify-start gap-2">
                <AshaAvatar small />
                <div className="inline-flex items-center gap-2 rounded-[20px] border border-orange-primary/10 bg-white px-4 py-3 text-sm font-semibold text-muted shadow-[0_10px_24px_rgba(200,160,120,0.13)]">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-primary" />
                  Getting your lesson ready
                </div>
              </div>
            ) : null}

            {messages.map((message) => (
              <div
                className={cn("flex gap-2", message.role === "user" ? "justify-end" : "justify-start")}
                key={message.id}
              >
                {message.role === "assistant" ? <AshaAvatar small /> : null}
                <div
                  className={cn(
                    "max-w-[84%] rounded-[22px] px-4 py-3 shadow-[0_12px_28px_rgba(122,75,25,0.11)]",
                    message.role === "user"
                      ? "bg-orange-primary text-white shadow-[0_16px_30px_rgba(232,135,30,0.28)]"
                      : "border border-orange-primary/10 bg-white"
                  )}
                >
                  <AshaMessageContent content={message.content} role={message.role} />
                </div>
              </div>
            ))}

            {isSending ? (
              <div className="flex justify-start gap-2">
                <AshaAvatar small />
                <div className="inline-flex items-center gap-2 rounded-[20px] border border-orange-primary/10 bg-white px-4 py-3 text-sm font-semibold text-muted shadow-[0_10px_24px_rgba(200,160,120,0.13)]">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-primary" />
                  Thinking
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          {suggestions.length ? (
            <div className="border-t border-orange-primary/10 bg-[#FFF8EE] px-3 py-2">
              <div className="asha-scrollbar flex gap-2 overflow-x-auto pb-1">
                {suggestions.map((suggestion) => (
                  <button
                    className="shrink-0 rounded-2xl border border-orange-primary/15 bg-white px-3 py-2 text-left text-xs font-bold text-heading shadow-[0_8px_18px_rgba(122,75,25,0.08)] transition hover:-translate-y-0.5 hover:border-orange-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={disableInput}
                    key={suggestion}
                    onClick={() => sendQuestion(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
              <span className="inline-flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </span>
            </div>
          ) : null}

          <form className="border-t border-orange-primary/10 bg-white p-3" onSubmit={sendMessage}>
            <div className="flex items-end gap-2 rounded-[22px] border border-orange-primary/15 bg-[#FFF8F0] p-2 shadow-[inset_4px_4px_9px_rgba(200,160,120,0.09),inset_-4px_-4px_9px_rgba(255,255,255,0.78)]">
              <textarea
                className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-heading outline-none placeholder:text-muted"
                disabled={disableInput}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={inputPlaceholder}
                ref={inputRef}
                rows={1}
                value={draft}
              />
              <button
                aria-label="Send message to Miss Asha"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-primary text-white shadow-clay-orange transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
                disabled={!draft.trim() || disableInput}
                type="submit"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        aria-label="Open Miss Asha chat"
        className="group relative flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-white/80 bg-white/92 px-2 py-1.5 pr-3 text-left shadow-[0_18px_44px_rgba(122,75,25,0.24)] backdrop-blur transition hover:-translate-y-1 hover:border-orange-primary/20 hover:shadow-[0_24px_54px_rgba(232,135,30,0.28)]"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        type="button"
      >
        <span className="relative flex h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-white bg-[#FFF2DE] shadow-[0_14px_28px_rgba(232,135,30,0.28)]">
          <Image
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            height={48}
            priority
            src="/miss-asha-avatar.webp"
            width={48}
          />
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-primary" />
        </span>
        <span className="whitespace-nowrap font-poppins text-xs font-bold leading-none text-heading">
          Ask Miss Asha
        </span>
      </button>
    </div>
  );
}
