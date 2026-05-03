import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLearnerScopeManifest,
  getLearnerVideoState,
  type LearnerScopeChapter,
  type LearnerScopeSubject,
  type LearnerVideoProgressRow,
  type LearnerVideoRow,
} from "@/lib/learner-scope";
import type { Database } from "@/lib/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export type AshaPageContext = {
  currentChapterId?: string | null;
  currentPath?: string | null;
  currentSubjectId?: string | null;
  currentVideoId?: string | null;
};

export type AshaPageFocus = {
  board: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  classLevel: number | null;
  completedLessons: number;
  lessonTitle: string | null;
  medium: string | null;
  progressLabel: string | null;
  progressPercent: number | null;
  studentName: string | null;
  subjectName: string | null;
  totalLessons: number;
};

export type AshaTutorContext = {
  context: string;
  focus: AshaPageFocus;
  hasDetailedVideoNotes: boolean;
  medium: string | null;
  quickFacts: string[];
  studentName: string | null;
  suggestedQuestions: string[];
};

type VideoNoteSummary = {
  video_id: string;
  language: string;
  summary: string | null;
  key_points: string | null;
};

type VideoNoteDetail = VideoNoteSummary & {
  transcript: string | null;
};

type QuizQuestion = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: number;
  sort_order: number;
};

const FETCH_CHUNK_SIZE = 450;
const MAX_CATALOG_VIDEOS = 240;
const MAX_DETAIL_NOTES = 14;
const MAX_SUMMARY_NOTES = 120;
const MAX_TRANSCRIPT_CHARS = 5200;
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "answer",
  "chapter",
  "class",
  "could",
  "does",
  "explain",
  "from",
  "give",
  "have",
  "into",
  "lesson",
  "make",
  "please",
  "question",
  "solve",
  "student",
  "tell",
  "that",
  "their",
  "there",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "your",
]);

function compactText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function getChapterTitle(chapter: LearnerScopeChapter, medium: string | null | undefined) {
  return medium === "Hindi" && chapter.title_hindi ? chapter.title_hindi : chapter.title;
}

function getChapterLabel(chapter: LearnerScopeChapter, medium: string | null | undefined) {
  return `${chapter.subjects?.name ?? "Subject"}, Chapter ${chapter.chapter_no}: ${getChapterTitle(
    chapter,
    medium
  )}`;
}

function getVideoTitle(video: LearnerVideoRow, medium: string | null | undefined) {
  const maybeHindi = video as LearnerVideoRow & { title_hindi?: string | null };
  return medium === "Hindi" && maybeHindi.title_hindi ? maybeHindi.title_hindi : video.title ?? "Untitled lesson";
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  ).slice(0, 28);
}

function buildCatalogLines(
  chapters: LearnerScopeChapter[],
  videosByChapterId: Map<string, LearnerVideoRow[]>,
  medium: string | null | undefined
) {
  const lines: string[] = [];
  let videoCount = 0;

  for (const chapter of chapters) {
    const videos = videosByChapterId.get(chapter.id) ?? [];
    if (!videos.length) continue;

    const lessonTitles = videos
      .slice(0, Math.max(0, MAX_CATALOG_VIDEOS - videoCount))
      .map((video) => {
        videoCount += 1;
        const duration = formatDuration(video.duration_seconds);
        return `${video.sort_order ?? "?"}. ${getVideoTitle(video, medium)}${duration ? ` (${duration})` : ""}`;
      });

    if (lessonTitles.length) {
      lines.push(`${getChapterLabel(chapter, medium)}\nLessons: ${lessonTitles.join("; ")}`);
    }

    if (videoCount >= MAX_CATALOG_VIDEOS) {
      lines.push("Catalog truncated for this request.");
      break;
    }
  }

  return lines;
}

async function fetchVideoNotes(
  supabase: AppSupabaseClient,
  videoIds: string[],
  includeTranscript: boolean
) {
  const orderedIds = uniqueValues(videoIds);
  if (!orderedIds.length) return [] as Array<VideoNoteSummary | VideoNoteDetail>;

  const rows: Array<VideoNoteSummary | VideoNoteDetail> = [];

  for (const ids of chunkValues(orderedIds, FETCH_CHUNK_SIZE)) {
    if (includeTranscript) {
      const { data, error } = await supabase
        .from("ai_video_notes")
        .select("video_id, language, summary, key_points, transcript")
        .in("video_id", ids);

      if (!error && data) rows.push(...((data ?? []) as VideoNoteDetail[]));
      continue;
    }

    const { data, error } = await supabase
      .from("ai_video_notes")
      .select("video_id, language, summary, key_points")
      .in("video_id", ids);

    if (!error && data) rows.push(...((data ?? []) as VideoNoteSummary[]));
  }

  const order = new Map(orderedIds.map((id, index) => [id, index]));
  return rows.sort((left, right) => (order.get(left.video_id) ?? 0) - (order.get(right.video_id) ?? 0));
}

async function fetchQuizQuestions(supabase: AppSupabaseClient, chapterId: string | null) {
  if (!chapterId) return [] as QuizQuestion[];

  const { data: quiz } = await supabase
    .from("chapter_quizzes")
    .select("id")
    .eq("chapter_id", chapterId)
    .eq("is_published", true)
    .maybeSingle();

  if (!quiz?.id) return [];

  const { data, error } = await supabase
    .from("quiz_questions")
    .select("question_text, option_a, option_b, option_c, option_d, correct_option, sort_order")
    .eq("quiz_id", quiz.id)
    .order("sort_order")
    .limit(24);

  if (error) return [];
  return (data ?? []) as QuizQuestion[];
}

function sortRecentProgress(rows: LearnerVideoProgressRow[]) {
  return rows.slice().sort((left, right) => {
    const leftTime = left.last_watched_at ? new Date(left.last_watched_at).getTime() : 0;
    const rightTime = right.last_watched_at ? new Date(right.last_watched_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

function findSubject(scopeSubjects: LearnerScopeSubject[], subjectId: string | null | undefined) {
  if (!subjectId) return undefined;
  return scopeSubjects.find((subject) => subject.id === subjectId);
}

function findRecentChapterForSubject(
  subject: LearnerScopeSubject | undefined,
  recentRows: LearnerVideoProgressRow[],
  videoById: Map<string, LearnerVideoRow>,
  chaptersById: Map<string, LearnerScopeChapter>
) {
  if (!subject) return undefined;
  const chapterIds = new Set(subject.chapters.map((chapter) => chapter.id));

  for (const row of recentRows) {
    const video = videoById.get(row.video_id);
    if (video && chapterIds.has(video.chapter_id)) {
      return chaptersById.get(video.chapter_id);
    }
  }

  return subject.chapters[0];
}

function sortChaptersForContext(
  chapters: LearnerScopeChapter[],
  currentChapter: LearnerScopeChapter | undefined,
  currentSubject: LearnerScopeSubject | undefined
) {
  const currentSubjectChapterIds = new Set(currentSubject?.chapters.map((chapter) => chapter.id) ?? []);

  return chapters.slice().sort((left, right) => {
    if (currentChapter && left.id === currentChapter.id) return -1;
    if (currentChapter && right.id === currentChapter.id) return 1;

    const leftInSubject = currentSubjectChapterIds.has(left.id);
    const rightInSubject = currentSubjectChapterIds.has(right.id);
    if (leftInSubject !== rightInSubject) return leftInSubject ? -1 : 1;

    const subjectCompare = (left.subjects?.name ?? "").localeCompare(right.subjects?.name ?? "");
    if (subjectCompare !== 0) return subjectCompare;
    return left.chapter_no - right.chapter_no;
  });
}

function scoreNote(
  note: VideoNoteSummary,
  options: {
    currentChapterId: string | null;
    currentSubjectChapterIds: Set<string>;
    currentVideoId: string | null;
    medium: string | null | undefined;
    queryTokens: string[];
    recentVideoIds: Set<string>;
    videoById: Map<string, LearnerVideoRow>;
  }
) {
  const video = options.videoById.get(note.video_id);
  if (!video) return -1000;

  let score = 0;
  if (options.currentVideoId && video.id === options.currentVideoId) score += 520;
  if (options.currentChapterId && video.chapter_id === options.currentChapterId) score += 260;
  if (options.currentSubjectChapterIds.has(video.chapter_id)) score += 90;
  if (options.recentVideoIds.has(video.id)) score += 70;
  if (compactText(note.summary)) score += 10;
  if (compactText(note.key_points)) score += 10;

  const haystack = [
    getVideoTitle(video, options.medium),
    compactText(note.summary),
    compactText(note.key_points),
  ]
    .join(" ")
    .toLowerCase();

  for (const token of options.queryTokens) {
    if (haystack.includes(token)) score += 18;
  }

  return score;
}

function selectPrimaryDetailVideoIds(
  currentChapterVideos: LearnerVideoRow[],
  requestedVideo: LearnerVideoRow | undefined,
  recentProgressVideoIds: string[],
  completedVideoIds: Set<string>
) {
  if (!currentChapterVideos.length) return requestedVideo ? [requestedVideo.id] : recentProgressVideoIds.slice(0, 8);

  const ids: string[] = [];
  const chapterVideoIds = new Set(currentChapterVideos.map((video) => video.id));

  if (requestedVideo) {
    const requestedIndex = currentChapterVideos.findIndex((video) => video.id === requestedVideo.id);
    for (const index of [requestedIndex - 1, requestedIndex, requestedIndex + 1]) {
      if (index >= 0 && currentChapterVideos[index]) ids.push(currentChapterVideos[index].id);
    }
  }

  for (const recentVideoId of recentProgressVideoIds) {
    if (chapterVideoIds.has(recentVideoId)) ids.push(recentVideoId);
  }

  const firstUnfinished = currentChapterVideos.find((video) => !completedVideoIds.has(video.id));
  if (firstUnfinished) ids.push(firstUnfinished.id);

  ids.push(...currentChapterVideos.slice(0, 8).map((video) => video.id));
  return uniqueValues(ids).slice(0, 10);
}

function buildNoteLines(
  notes: Array<VideoNoteSummary | VideoNoteDetail>,
  options: {
    chaptersById: Map<string, LearnerScopeChapter>;
    medium: string | null | undefined;
    videoById: Map<string, LearnerVideoRow>;
  }
) {
  return notes
    .slice(0, MAX_SUMMARY_NOTES)
    .map((note) => {
      const video = options.videoById.get(note.video_id);
      const chapter = video ? options.chaptersById.get(video.chapter_id) : undefined;
      const title = video ? getVideoTitle(video, options.medium) : "Unknown lesson";
      const summary = compactText(note.summary);
      const keyPoints = compactText(note.key_points);
      const transcript =
        "transcript" in note && note.transcript
          ? `\nTranscript excerpt: ${compactText(note.transcript).slice(0, MAX_TRANSCRIPT_CHARS)}`
          : "";

      return [
        chapter ? `Chapter: ${getChapterLabel(chapter, options.medium)}` : "",
        `Lesson: ${title}`,
        note.language ? `Language: ${note.language}` : "",
        summary ? `Summary: ${summary}` : "",
        keyPoints ? `Key points: ${keyPoints}` : "",
        transcript,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .filter(Boolean);
}

function buildQuizLines(questions: QuizQuestion[]) {
  return questions.map((question) => {
    const options = [question.option_a, question.option_b, question.option_c, question.option_d];
    return [
      `Q${question.sort_order || ""}: ${question.question_text}`,
      `Options: ${options.map((option, index) => `${index + 1}) ${option}`).join(" | ")}`,
      `Correct option: ${question.correct_option}`,
    ].join("\n");
  });
}

function splitKnowledgeBits(value: string | null | undefined) {
  return compactText(value)
    .replace(/\b\d+\.\s*/g, " ")
    .split(/(?:;|•|\.\s+|\n| - | \| )/)
    .map((part) => part.replace(/^[-*•\s]+/, "").trim())
    .filter((part) => part.length >= 35 && part.length <= 220);
}

function buildQuickFacts(notes: VideoNoteSummary[]) {
  const facts: string[] = [];

  for (const note of notes) {
    for (const bit of [...splitKnowledgeBits(note.key_points), ...splitKnowledgeBits(note.summary)]) {
      const normalized = bit.toLowerCase();
      if (!facts.some((fact) => fact.toLowerCase() === normalized)) {
        facts.push(bit);
      }
      if (facts.length >= 3) return facts;
    }
  }

  return facts;
}

function buildSuggestedQuestions(focus: AshaPageFocus) {
  const chapterName = focus.chapterTitle ?? focus.subjectName;
  const lessonName = focus.lessonTitle ?? chapterName;

  if (!chapterName) {
    return [
      "Help me choose what to study next.",
      "Show my recent lessons.",
      "Which subject should I revise first?",
      "Give me a quick study plan for today.",
    ];
  }

  return [
    `Explain ${lessonName ?? chapterName} in simple words.`,
    `What are the most important exam points from ${chapterName}?`,
    `Give me 3 practice questions from ${chapterName}.`,
    focus.subjectName ? `How is ${chapterName} connected to ${focus.subjectName}?` : null,
  ].filter((question): question is string => Boolean(question));
}

export async function buildAshaTutorContext(
  supabase: AppSupabaseClient,
  userId: string,
  pageContext: AshaPageContext,
  latestQuestion = ""
): Promise<AshaTutorContext | null> {
  const scope = await getLearnerScopeManifest(supabase, userId);
  if (!scope) return null;

  const videoState = await getLearnerVideoState(
    supabase,
    userId,
    scope.chapterIds,
    "id, title, title_hindi, chapter_id, sort_order, duration_seconds, duration_seconds_hindi"
  );

  const medium = scope.profile.medium;
  const videoById = new Map(videoState.videos.map((video) => [video.id, video]));
  const requestedVideo = pageContext.currentVideoId ? videoById.get(pageContext.currentVideoId) : undefined;
  const recentProgressRows = sortRecentProgress(videoState.progressRows);
  const recentProgressVideoIds = recentProgressRows.slice(0, 24).map((row) => row.video_id);
  const currentSubject = findSubject(scope.subjects, pageContext.currentSubjectId);
  const subjectFromVideo = requestedVideo
    ? scope.chaptersById.get(requestedVideo.chapter_id)?.subjects?.id
    : undefined;
  const subjectFromChapter = pageContext.currentChapterId
    ? scope.chaptersById.get(pageContext.currentChapterId)?.subjects?.id
    : undefined;
  const inferredSubject =
    currentSubject ??
    findSubject(scope.subjects, subjectFromVideo) ??
    findSubject(scope.subjects, subjectFromChapter);

  const requestedChapterId =
    requestedVideo?.chapter_id ??
    pageContext.currentChapterId ??
    findRecentChapterForSubject(inferredSubject, recentProgressRows, videoById, scope.chaptersById)?.id ??
    null;
  const currentChapter = requestedChapterId ? scope.chaptersById.get(requestedChapterId) : undefined;
  const currentChapterVideos = currentChapter ? videoState.videosByChapterId.get(currentChapter.id) ?? [] : [];
  const currentSubjectChapterIds = new Set(inferredSubject?.chapters.map((chapter) => chapter.id) ?? []);
  const sortedContextChapters = sortChaptersForContext(scope.chapters, currentChapter, inferredSubject);

  const summaryNoteIds = uniqueValues([...currentChapterVideos.map((video) => video.id), ...recentProgressVideoIds, ...videoState.videoIds]);
  const summaryNotes = (await fetchVideoNotes(supabase, summaryNoteIds, false)) as VideoNoteSummary[];
  const queryTokens = tokenize(
    [
      latestQuestion,
      requestedVideo ? getVideoTitle(requestedVideo, medium) : "",
      currentChapter ? getChapterTitle(currentChapter, medium) : "",
      inferredSubject?.name ?? "",
    ].join(" ")
  );
  const recentVideoIdSet = new Set(recentProgressVideoIds);
  const rankedSummaryNotes = summaryNotes
    .slice()
    .sort(
      (left, right) =>
        scoreNote(right, {
          currentChapterId: currentChapter?.id ?? null,
          currentSubjectChapterIds,
          currentVideoId: requestedVideo?.id ?? null,
          medium,
          queryTokens,
          recentVideoIds: recentVideoIdSet,
          videoById,
        }) -
        scoreNote(left, {
          currentChapterId: currentChapter?.id ?? null,
          currentSubjectChapterIds,
          currentVideoId: requestedVideo?.id ?? null,
          medium,
          queryTokens,
          recentVideoIds: recentVideoIdSet,
          videoById,
        })
    );

  const primaryDetailVideoIds = selectPrimaryDetailVideoIds(
    currentChapterVideos,
    requestedVideo,
    recentProgressVideoIds,
    videoState.completedVideoIds
  );
  const detailNoteIds = uniqueValues([
    ...primaryDetailVideoIds,
    ...rankedSummaryNotes.slice(0, 10).map((note) => note.video_id),
    ...recentProgressVideoIds.slice(0, 4),
  ]).slice(0, MAX_DETAIL_NOTES);

  const [detailNotes, quizQuestions] = await Promise.all([
    fetchVideoNotes(supabase, detailNoteIds, true) as Promise<VideoNoteDetail[]>,
    fetchQuizQuestions(supabase, currentChapter?.id ?? null),
  ]);

  const completedLessons = currentChapterVideos.filter((video) => {
    const progress = videoState.progressByVideoId.get(video.id);
    return videoState.completedVideoIds.has(video.id) || (progress?.watched_percentage ?? 0) >= 95;
  }).length;
  const totalLessons = currentChapterVideos.length;
  const progressPercent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : null;
  const focus: AshaPageFocus = {
    board: scope.profile.board,
    chapterNumber: currentChapter?.chapter_no ?? null,
    chapterTitle: currentChapter ? getChapterTitle(currentChapter, medium) : null,
    classLevel: scope.profile.class,
    completedLessons,
    lessonTitle: requestedVideo ? getVideoTitle(requestedVideo, medium) : null,
    medium,
    progressLabel:
      totalLessons > 0
        ? `${completedLessons}/${totalLessons} lessons completed${progressPercent !== null ? ` (${progressPercent}%)` : ""}`
        : null,
    progressPercent,
    studentName: scope.profile.name,
    subjectName: inferredSubject?.name ?? currentChapter?.subjects?.name ?? null,
    totalLessons,
  };

  const catalogLines = buildCatalogLines(sortedContextChapters, videoState.videosByChapterId, medium);
  const summaryLines = buildNoteLines(rankedSummaryNotes.slice(0, MAX_SUMMARY_NOTES), {
    chaptersById: scope.chaptersById,
    medium,
    videoById,
  });
  const detailLines = buildNoteLines(detailNotes, {
    chaptersById: scope.chaptersById,
    medium,
    videoById,
  });
  const quizLines = buildQuizLines(quizQuestions);
  const quickFacts = buildQuickFacts(
    rankedSummaryNotes.filter((note) => {
      const video = videoById.get(note.video_id);
      return Boolean(video && (!currentChapter || video.chapter_id === currentChapter.id));
    })
  );
  const suggestedQuestions = buildSuggestedQuestions(focus);

  const context = [
    "Student profile:",
    `Name: ${scope.profile.name ?? "Learner"}`,
    `Class: ${scope.profile.class ?? "Unknown"}`,
    `Board: ${scope.profile.board ?? "Unknown"}`,
    `Medium: ${scope.profile.medium ?? "Unknown"}`,
    pageContext.currentPath ? `Current page: ${pageContext.currentPath}` : "",
    "",
    "Current learning focus:",
    focus.subjectName ? `Subject: ${focus.subjectName}` : "",
    focus.chapterTitle
      ? `Chapter: ${focus.chapterNumber ? `${focus.chapterNumber}. ` : ""}${focus.chapterTitle}`
      : "",
    focus.lessonTitle ? `Lesson: ${focus.lessonTitle}` : "",
    focus.progressLabel ? `Progress: ${focus.progressLabel}` : "",
    quickFacts.length ? `Useful quick facts: ${quickFacts.join(" | ")}` : "",
    "",
    "Accessible course catalog:",
    catalogLines.join("\n\n") || "No accessible lesson catalog found.",
    "",
    detailLines.length ? "Detailed notes and transcript excerpts for the most relevant current lessons:" : "",
    detailLines.join("\n\n"),
    "",
    summaryLines.length ? "Ranked lesson summaries across the student's accessible videos:" : "",
    summaryLines.join("\n\n"),
    "",
    quizLines.length ? "Chapter quiz knowledge checks:" : "",
    quizLines.join("\n\n"),
  ]
    .filter((part) => part !== "")
    .join("\n");

  return {
    context,
    focus,
    hasDetailedVideoNotes: detailNotes.some((note) => Boolean(note.transcript)) || summaryLines.length > 0,
    medium,
    quickFacts,
    studentName: scope.profile.name,
    suggestedQuestions,
  };
}
