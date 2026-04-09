import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import * as xlsx from "xlsx";
import { getQuizMasteryLevel, type QuizMasteryLevel } from "@/lib/quiz";

type ChapterInput = {
  id: string;
  class: number;
  medium: string;
  chapterNo: number;
  title: string;
  titleHindi?: string | null;
  subjectName: string;
};

type CatalogEntry = {
  filePath: string;
  relativePath: string;
  medium: string;
  classNum: number;
  subjectName: string;
  chapterNo: number | null;
  sourceTitle: string;
  declaredQuestionCount: number | null;
};

export type FallbackQuizQuestion = {
  id: string;
  questionText: string;
  options: string[];
  difficulty: string | null;
  cognitiveLevel: string | null;
  correctOption: 1 | 2 | 3 | 4;
};

export type FallbackQuiz = {
  quizId: string;
  chapterId: string;
  questionCount: number;
  questions: FallbackQuizQuestion[];
  sourcePath: string;
  sourceMedium: string;
  sourceSubject: string;
};

export type FallbackQuizAttempt = {
  id: string;
  quizId: string;
  chapterId: string;
  userId: string;
  percent: number;
  correctAnswers: number;
  totalQuestions: number;
  masteryLevel: QuizMasteryLevel;
  completedAt: string;
};

type AttemptStore = {
  attempts: Array<
    FallbackQuizAttempt & {
      answers: Array<{
        questionId: string;
        selectedOption: number | null;
        isCorrect: boolean;
      }>;
    }
  >;
};

const MCQ_ROOT = resolve(process.cwd(), "MCQ");
const ATTEMPT_STORE_PATH = resolve(process.cwd(), ".local-data", "quiz-attempts.json");

const SUBJECT_ALIASES = new Map<string, string>([
  ["accountancy", "Accountancy"],
  ["biology", "Biology"],
  ["business studies", "Business Studies"],
  ["chemistry", "Chemistry"],
  ["civics", "Civics"],
  ["computer", "Computer"],
  ["economics", "Economics"],
  ["geography", "Geography"],
  ["history", "History"],
  ["maths", "Mathematics"],
  ["mathematics", "Mathematics"],
  ["physics", "Physics"],
  ["political science", "Political Science"],
  ["science", "Science"],
  ["statistics", "Statistics"],
]);

function isDevelopmentLikeRuntime() {
  return process.env.NODE_ENV !== "production";
}

export function isDevQuizFallbackEnabled() {
  return isDevelopmentLikeRuntime();
}

function cleanCell(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r?\n+/g, " ").replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[()[\]{}.,/\\:_\-–—'"!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getSubjectName(folderSubject: string) {
  return SUBJECT_ALIASES.get(normalizeKey(folderSubject)) ?? null;
}

function parseCorrectOption(value: unknown): 1 | 2 | 3 | 4 | null {
  const raw = cleanCell(value);
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) {
    return numeric as 1 | 2 | 3 | 4;
  }

  const normalized = raw.toLowerCase();
  if (normalized === "a" || normalized === "option a") return 1;
  if (normalized === "b" || normalized === "option b") return 2;
  if (normalized === "c" || normalized === "option c") return 3;
  if (normalized === "d" || normalized === "option d") return 4;
  return null;
}

function getQuestionSignature(question: {
  questionText: string;
  options: [string, string, string, string];
  correctOption: 1 | 2 | 3 | 4;
}) {
  return [
    normalizeKey(question.questionText),
    ...question.options.map((option) => normalizeKey(option)),
    String(question.correctOption),
  ].join("::");
}

function parseCatalogEntry(filePath: string): CatalogEntry | null {
  const relativePath = filePath.replace(`${MCQ_ROOT}/`, "");
  const parts = relativePath.split("/");
  if (parts.length < 4) return null;

  const [medium, classToken, subjectToken, maybeNestedSubject] = parts;
  const classNum = Number(classToken);
  if (!Number.isInteger(classNum)) return null;

  const effectiveSubjectToken = subjectToken === "SST" && maybeNestedSubject ? maybeNestedSubject : subjectToken;
  const subjectName = getSubjectName(effectiveSubjectToken);
  if (!subjectName) return null;

  const rawName = basename(filePath, extname(filePath)).replace(/^~\$/, "");
  const chapterNoMatch = rawName.match(/^(\d+(?:\.\d+)?)/);
  const chapterNo = chapterNoMatch ? Math.trunc(Number(chapterNoMatch[1])) : null;
  const declaredQuestionCountMatch = rawName.match(/_(\d+)$/);
  const declaredQuestionCount = declaredQuestionCountMatch ? Number(declaredQuestionCountMatch[1]) : null;
  const sourceTitle = rawName
    .replace(/_\d+$/, "")
    .replace(/_+$/, "")
    .replace(/^\d+(?:\.\d+)?[.\-_ ]*/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    filePath,
    relativePath,
    medium,
    classNum,
    subjectName,
    chapterNo,
    sourceTitle,
    declaredQuestionCount,
  };
}

async function walkWorkbookFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkWorkbookFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!/\.(xlsx|xls|xlsm)$/i.test(entry.name)) continue;
    if (entry.name.startsWith("~$")) continue;
    files.push(fullPath);
  }

  return files;
}

declare global {
  // eslint-disable-next-line no-var
  var __edufleetMcqCatalogPromise: Promise<CatalogEntry[]> | undefined;
}

async function getCatalog() {
  if (!isDevQuizFallbackEnabled()) return [];

  if (!global.__edufleetMcqCatalogPromise) {
    global.__edufleetMcqCatalogPromise = walkWorkbookFiles(MCQ_ROOT).then((files) =>
      files
        .map((filePath) => parseCatalogEntry(filePath))
        .filter((entry): entry is CatalogEntry => Boolean(entry))
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    );
  }

  return global.__edufleetMcqCatalogPromise;
}

async function readWorkbookFromDisk(filePath: string) {
  const fileBuffer = await readFile(filePath);
  return xlsx.read(fileBuffer, { type: "buffer", cellDates: false });
}

function matchCatalogEntry(chapter: ChapterInput, entries: CatalogEntry[]) {
  const scopedEntries = entries.filter(
    (entry) =>
      entry.medium === chapter.medium &&
      entry.classNum === chapter.class &&
      entry.subjectName === chapter.subjectName
  );

  if (scopedEntries.length === 0) return null;

  if (chapter.chapterNo !== null) {
    const chapterNoMatches = scopedEntries.filter((entry) => entry.chapterNo === chapter.chapterNo);
    if (chapterNoMatches.length === 1) return chapterNoMatches[0];

    if (chapterNoMatches.length > 1) {
      const normalizedTitle = normalizeKey(chapter.medium === "Hindi" ? chapter.titleHindi ?? chapter.title : chapter.title);
      const titleMatch = chapterNoMatches.find((entry) => normalizeKey(entry.sourceTitle) === normalizedTitle);
      if (titleMatch) return titleMatch;
    }
  }

  const normalizedEnglishTitle = normalizeKey(chapter.title);
  const normalizedHindiTitle = normalizeKey(chapter.titleHindi ?? "");
  const titleMatches = scopedEntries.filter((entry) => {
    const normalizedSourceTitle = normalizeKey(entry.sourceTitle);
    return (
      normalizedSourceTitle === normalizedEnglishTitle ||
      (normalizedHindiTitle.length > 0 && normalizedSourceTitle === normalizedHindiTitle) ||
      normalizedSourceTitle.includes(normalizedEnglishTitle) ||
      normalizedEnglishTitle.includes(normalizedSourceTitle) ||
      (normalizedHindiTitle.length > 0 &&
        (normalizedSourceTitle.includes(normalizedHindiTitle) || normalizedHindiTitle.includes(normalizedSourceTitle)))
    );
  });

  return titleMatches.length === 1 ? titleMatches[0] : null;
}

function getQuestionId(chapterId: string, sortOrder: number) {
  return `fallback:${chapterId}:${sortOrder}`;
}

async function parseFallbackQuiz(entry: CatalogEntry, chapter: ChapterInput): Promise<FallbackQuiz | null> {
  let workbook: xlsx.WorkBook;

  try {
    workbook = await readWorkbookFromDisk(entry.filePath);
  } catch (error) {
    console.error(`[quiz-fallback] Failed to read workbook ${entry.relativePath}`, error);
    return null;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;

  const rows = xlsx.utils.sheet_to_json<(string | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  });

  const firstContentIndex = rows.findIndex((row) => row.some((cell) => cleanCell(cell)));
  if (firstContentIndex === -1) return null;

  const firstRow = rows[firstContentIndex] ?? [];
  const normalizedHeaders = firstRow.map((cell) => normalizeKey(cleanCell(cell)));
  const isHeaderRow = normalizedHeaders.includes("question") && normalizedHeaders.some((cell) => cell.startsWith("option"));
  const headerMap = isHeaderRow
    ? {
        question: normalizedHeaders.findIndex((cell) => cell === "question"),
        optionA: normalizedHeaders.findIndex((cell) => cell === "option1" || cell === "option a"),
        optionB: normalizedHeaders.findIndex((cell) => cell === "option2" || cell === "option b"),
        optionC: normalizedHeaders.findIndex((cell) => cell === "option3" || cell === "option c"),
        optionD: normalizedHeaders.findIndex((cell) => cell === "option4" || cell === "option d"),
        correct: normalizedHeaders.findIndex((cell) => cell === "correct" || cell === "answer" || cell === "correct option"),
        difficulty: normalizedHeaders.findIndex((cell) => cell === "level" || cell === "difficulty"),
        cognitive: normalizedHeaders.findIndex(
          (cell) => cell === "description" || cell === "cognitive level" || cell === "competency"
        ),
      }
    : null;

  const questions: FallbackQuizQuestion[] = [];
  const seenQuestionSignatures = new Set<string>();
  const startingRow = isHeaderRow ? firstContentIndex + 1 : firstContentIndex;

  for (let rowIndex = startingRow; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    if (!row.some((cell) => cleanCell(cell))) continue;

    const questionText = cleanCell(headerMap ? row[headerMap.question] : row[0]);
    const optionA = cleanCell(headerMap ? row[headerMap.optionA] : row[1]);
    const optionB = cleanCell(headerMap ? row[headerMap.optionB] : row[2]);
    const optionC = cleanCell(headerMap ? row[headerMap.optionC] : row[3]);
    const optionD = cleanCell(headerMap ? row[headerMap.optionD] : row[4]);
    const correctOption = parseCorrectOption(headerMap ? row[headerMap.correct] : row[5]);
    const difficulty = cleanCell(headerMap ? row[headerMap.difficulty] : row[6]) || null;
    const cognitiveLevel = cleanCell(headerMap ? row[headerMap.cognitive] : row[7]) || null;

    if (!questionText || !optionA || !optionB || !optionC || !optionD || !correctOption) {
      continue;
    }

    const signature = getQuestionSignature({
      questionText,
      options: [optionA, optionB, optionC, optionD],
      correctOption,
    });

    if (seenQuestionSignatures.has(signature)) {
      continue;
    }

    seenQuestionSignatures.add(signature);

    questions.push({
      id: getQuestionId(chapter.id, questions.length + 1),
      questionText,
      options: [optionA, optionB, optionC, optionD],
      difficulty,
      cognitiveLevel,
      correctOption,
    });
  }

  if (questions.length === 0) return null;

  return {
    quizId: `fallback:${chapter.id}`,
    chapterId: chapter.id,
    questionCount: questions.length,
    questions,
    sourcePath: entry.relativePath,
    sourceMedium: entry.medium,
    sourceSubject: entry.subjectName,
  };
}

export async function getFallbackQuizMeta(chapter: ChapterInput) {
  if (!isDevQuizFallbackEnabled()) return null;
  const catalog = await getCatalog();
  const entry = matchCatalogEntry(chapter, catalog);
  if (!entry) return null;

  const parsedQuiz = entry.declaredQuestionCount === null ? await parseFallbackQuiz(entry, chapter) : null;

  return {
    quizId: `fallback:${chapter.id}`,
    chapterId: chapter.id,
    questionCount: entry.declaredQuestionCount ?? parsedQuiz?.questionCount ?? 0,
    sourcePath: entry.relativePath,
    sourceMedium: entry.medium,
    sourceSubject: entry.subjectName,
  };
}

export async function loadFallbackQuiz(chapter: ChapterInput) {
  if (!isDevQuizFallbackEnabled()) return null;
  const catalog = await getCatalog();
  const entry = matchCatalogEntry(chapter, catalog);
  if (!entry) return null;
  return parseFallbackQuiz(entry, chapter);
}

async function readAttemptStore(): Promise<AttemptStore> {
  try {
    const raw = await readFile(ATTEMPT_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as AttemptStore;
    return { attempts: parsed.attempts ?? [] };
  } catch {
    return { attempts: [] };
  }
}

async function writeAttemptStore(store: AttemptStore) {
  await mkdir(resolve(process.cwd(), ".local-data"), { recursive: true });
  await writeFile(ATTEMPT_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function listFallbackAttemptsForUser(userId: string, chapterId?: string) {
  const store = await readAttemptStore();
  return store.attempts
    .filter((attempt) => attempt.userId === userId && (!chapterId || attempt.chapterId === chapterId))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .map((attempt) => ({
      id: attempt.id,
      quizId: attempt.quizId,
      chapterId: attempt.chapterId,
      userId: attempt.userId,
      percent: attempt.percent,
      correctAnswers: attempt.correctAnswers,
      totalQuestions: attempt.totalQuestions,
      masteryLevel: attempt.masteryLevel,
      completedAt: attempt.completedAt,
    }));
}

export async function listFallbackAttemptsForUserByChapterIds(userId: string, chapterIds: string[]) {
  const chapterIdSet = new Set(chapterIds);
  const store = await readAttemptStore();
  return store.attempts
    .filter((attempt) => attempt.userId === userId && chapterIdSet.has(attempt.chapterId))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .map((attempt) => ({
      id: attempt.id,
      quizId: attempt.quizId,
      chapterId: attempt.chapterId,
      userId: attempt.userId,
      percent: attempt.percent,
      correctAnswers: attempt.correctAnswers,
      totalQuestions: attempt.totalQuestions,
      masteryLevel: attempt.masteryLevel,
      completedAt: attempt.completedAt,
    }));
}

export async function saveFallbackQuizAttempt(input: {
  quizId: string;
  chapterId: string;
  userId: string;
  answers: Array<{ questionId: string; selectedOption: number | null; isCorrect: boolean }>;
  correctAnswers: number;
  totalQuestions: number;
  percent: number;
}) {
  const store = await readAttemptStore();
  const completedAt = new Date().toISOString();
  const attempt = {
    id: randomUUID(),
    quizId: input.quizId,
    chapterId: input.chapterId,
    userId: input.userId,
    percent: input.percent,
    correctAnswers: input.correctAnswers,
    totalQuestions: input.totalQuestions,
    masteryLevel: getQuizMasteryLevel(input.percent),
    completedAt,
    answers: input.answers,
  };

  store.attempts.push(attempt);
  await writeAttemptStore(store);

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    chapterId: attempt.chapterId,
    userId: attempt.userId,
    percent: attempt.percent,
    correctAnswers: attempt.correctAnswers,
    totalQuestions: attempt.totalQuestions,
    masteryLevel: attempt.masteryLevel,
    completedAt: attempt.completedAt,
  };
}
