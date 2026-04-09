import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";
import type { Database } from "../src/lib/supabase/types";

type ChapterRow = {
  id: string;
  class: number;
  medium: string;
  chapterNo: number;
  title: string;
  titleHindi: string | null;
  subjectName: string;
};

type FileMeta = {
  filePath: string;
  relativePath: string;
  medium: string;
  classNum: number;
  subjectName: string;
  chapterNo: number | null;
  sourceTitle: string;
};

type ParsedQuestion = {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 1 | 2 | 3 | 4;
  difficulty: string | null;
  cognitiveLevel: string | null;
  sourceRow: number;
  sortOrder: number;
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
const rootDir = process.cwd();
const mcqRoot = resolve(rootDir, "MCQ");

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

function getEnvValue(name: string) {
  const directValue = process.env[name];
  if (directValue) return directValue;

  for (const fileName of [".env.local", ".env"]) {
    try {
      const file = readFileSync(resolve(rootDir, fileName), "utf8");
      const match = file.match(new RegExp(`^${name}=(.*)$`, "m"));
      if (match?.[1]) {
        return match[1].trim().replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Ignore missing env files and keep searching.
    }
  }

  return undefined;
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
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 1 | 2 | 3 | 4;
}) {
  return [
    normalizeKey(question.questionText),
    normalizeKey(question.optionA),
    normalizeKey(question.optionB),
    normalizeKey(question.optionC),
    normalizeKey(question.optionD),
    String(question.correctOption),
  ].join("::");
}

function getSubjectName(folderSubject: string) {
  return SUBJECT_ALIASES.get(normalizeKey(folderSubject)) ?? null;
}

function parseFileMeta(filePath: string): FileMeta | null {
  const relativePath = filePath.replace(`${mcqRoot}/`, "");
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
  const sourceTitle = rawName
    .replace(/_\d+$/u, "")
    .replace(/_+$/u, "")
    .replace(/^\d+(?:\.\d+)?[.\-_ ]*/u, "")
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
  };
}

function parseWorkbookQuestions(filePath: string) {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<(string | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  });

  const firstContentIndex = rows.findIndex((row) => row.some((cell) => cleanCell(cell)));
  if (firstContentIndex === -1) {
    return { questions: [] as ParsedQuestion[], skippedRows: 0 };
  }

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

  const questions: ParsedQuestion[] = [];
  const seenQuestionSignatures = new Set<string>();
  let skippedRows = 0;
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
      skippedRows += 1;
      continue;
    }

    const signature = getQuestionSignature({
      questionText,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption,
    });

    if (seenQuestionSignatures.has(signature)) {
      skippedRows += 1;
      continue;
    }

    seenQuestionSignatures.add(signature);

    questions.push({
      questionText,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption,
      difficulty,
      cognitiveLevel,
      sourceRow: rowIndex + 1,
      sortOrder: questions.length + 1,
    });
  }

  return { questions, skippedRows };
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function matchChapter(meta: FileMeta, candidates: ChapterRow[]) {
  if (candidates.length === 0) return null;

  if (meta.chapterNo !== null) {
    const chapterMatches = candidates.filter((chapter) => chapter.chapterNo === meta.chapterNo);
    if (chapterMatches.length === 1) return chapterMatches[0];

    if (chapterMatches.length > 1 && meta.sourceTitle) {
      const titleMatch = chapterMatches.find((chapter) => {
        const normalizedTitle = normalizeKey(meta.sourceTitle);
        return (
          normalizeKey(chapter.title) === normalizedTitle ||
          normalizeKey(chapter.titleHindi ?? "") === normalizedTitle
        );
      });
      if (titleMatch) return titleMatch;
    }
  }

  const normalizedSourceTitle = normalizeKey(meta.sourceTitle);
  if (!normalizedSourceTitle) return null;

  const exactTitleMatch = candidates.find((chapter) => {
    return (
      normalizeKey(chapter.title) === normalizedSourceTitle ||
      normalizeKey(chapter.titleHindi ?? "") === normalizedSourceTitle
    );
  });
  if (exactTitleMatch) return exactTitleMatch;

  const fuzzyTitleMatches = candidates.filter((chapter) => {
    const englishTitle = normalizeKey(chapter.title);
    const hindiTitle = normalizeKey(chapter.titleHindi ?? "");
    return (
      englishTitle.includes(normalizedSourceTitle) ||
      normalizedSourceTitle.includes(englishTitle) ||
      (hindiTitle.length > 0 &&
        (hindiTitle.includes(normalizedSourceTitle) || normalizedSourceTitle.includes(hindiTitle)))
    );
  });

  return fuzzyTitleMatches.length === 1 ? fuzzyTitleMatches[0] : null;
}

async function listWorkbookFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listWorkbookFiles(fullPath)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!/\.(xlsx|xls|xlsm)$/i.test(entry.name)) continue;
    if (entry.name.startsWith("~$")) continue;
    files.push(fullPath);
  }

  return files;
}

async function main() {
  const supabaseUrl = getEnvValue("SUPABASE_URL") || getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: subjectRows, error: subjectError } = await supabase
    .from("subjects")
    .select("id, name");

  if (subjectError) throw subjectError;

  const subjectNameById = new Map((subjectRows ?? []).map((subject) => [subject.id, subject.name]));

  const { data: chapterRows, error: chapterError } = await supabase
    .from("chapters")
    .select("id, class, medium, chapter_no, title, title_hindi, subject_id")
    .gte("class", 6)
    .order("class")
    .order("chapter_no");

  if (chapterError) throw chapterError;

  const chapters: ChapterRow[] = (chapterRows ?? []).map((row) => ({
    id: row.id,
    class: row.class,
    medium: row.medium,
    chapterNo: row.chapter_no,
    title: row.title,
    titleHindi: row.title_hindi,
    subjectName: subjectNameById.get(row.subject_id) ?? "",
  }));

  const chaptersByScope = new Map<string, ChapterRow[]>();
  for (const chapter of chapters) {
    const key = `${chapter.medium}|${chapter.class}|${chapter.subjectName}`;
    const current = chaptersByScope.get(key) ?? [];
    current.push(chapter);
    chaptersByScope.set(key, current);
  }

  const filePaths = (await listWorkbookFiles(mcqRoot)).sort();

  const selectedPaths = limit ? filePaths.slice(0, limit) : filePaths;
  const summary = {
    totalFiles: selectedPaths.length,
    importedQuizzes: 0,
    importedQuestions: 0,
    updatedQuizzes: 0,
    skippedMalformedRows: 0,
    skippedNoQuestions: 0,
    skippedMissingSubject: 0,
    skippedLockedByAttempts: 0,
    unmatchedFiles: [] as string[],
  };

  console.log(
    `${dryRun ? "Dry run" : "Import"} starting for ${selectedPaths.length} workbook files from ${mcqRoot}`
  );

  for (const [index, filePath] of selectedPaths.entries()) {
    const meta = parseFileMeta(filePath);
    if (!meta) {
      summary.skippedMissingSubject += 1;
      summary.unmatchedFiles.push(filePath.replace(`${rootDir}/`, ""));
      continue;
    }

    const scopeKey = `${meta.medium}|${meta.classNum}|${meta.subjectName}`;
    const matchedChapter = matchChapter(meta, chaptersByScope.get(scopeKey) ?? []);
    if (!matchedChapter) {
      summary.unmatchedFiles.push(meta.relativePath);
      continue;
    }

    const { questions, skippedRows } = parseWorkbookQuestions(filePath);
    summary.skippedMalformedRows += skippedRows;

    if (questions.length === 0) {
      summary.skippedNoQuestions += 1;
      continue;
    }

    if (dryRun) {
      summary.importedQuizzes += 1;
      summary.importedQuestions += questions.length;
      if ((index + 1) % 50 === 0 || index === selectedPaths.length - 1) {
        console.log(`Dry run progress: ${index + 1}/${selectedPaths.length}`);
      }
      continue;
    }

    const { data: quizRow, error: quizError } = await supabase
      .from("chapter_quizzes")
      .upsert(
        {
          chapter_id: matchedChapter.id,
          source_path: meta.relativePath,
          source_medium: meta.medium,
          source_subject: meta.subjectName,
          question_count: questions.length,
          is_published: true,
        },
        { onConflict: "chapter_id" }
      )
      .select("id")
      .single();

    if (quizError || !quizRow) {
      throw quizError ?? new Error(`Failed to create quiz for ${meta.relativePath}`);
    }

    const { count: attemptCount, error: attemptsError } = await supabase
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", quizRow.id);

    if (attemptsError) throw attemptsError;
    if ((attemptCount ?? 0) > 0) {
      summary.skippedLockedByAttempts += 1;
      continue;
    }

    const { error: deleteError } = await supabase
      .from("quiz_questions")
      .delete()
      .eq("quiz_id", quizRow.id);

    if (deleteError) throw deleteError;

    for (const chunk of chunkArray(questions, 200)) {
      const { error: insertError } = await supabase.from("quiz_questions").insert(
        chunk.map((question) => ({
          quiz_id: quizRow.id,
          question_text: question.questionText,
          option_a: question.optionA,
          option_b: question.optionB,
          option_c: question.optionC,
          option_d: question.optionD,
          correct_option: question.correctOption,
          difficulty: question.difficulty,
          cognitive_level: question.cognitiveLevel,
          source_row: question.sourceRow,
          sort_order: question.sortOrder,
        }))
      );

      if (insertError) throw insertError;
    }

    summary.importedQuizzes += 1;
    summary.importedQuestions += questions.length;
    summary.updatedQuizzes += 1;

    if ((index + 1) % 25 === 0 || index === selectedPaths.length - 1) {
      console.log(`Imported ${index + 1}/${selectedPaths.length} files`);
    }
  }

  console.log("\nQuiz import summary");
  console.log(`Files scanned: ${summary.totalFiles}`);
  console.log(`Quizzes matched: ${summary.importedQuizzes}`);
  console.log(`Questions imported: ${summary.importedQuestions}`);
  console.log(`Malformed rows skipped: ${summary.skippedMalformedRows}`);
  console.log(`Files with no usable questions: ${summary.skippedNoQuestions}`);
  console.log(`Files skipped after attempts existed: ${summary.skippedLockedByAttempts}`);
  console.log(`Unmatched files: ${summary.unmatchedFiles.length}`);

  if (summary.unmatchedFiles.length > 0) {
    console.log("\nFirst unmatched files:");
    for (const filePath of summary.unmatchedFiles.slice(0, 25)) {
      console.log(`- ${filePath}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
