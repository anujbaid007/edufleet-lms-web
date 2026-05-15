import { randomBytes } from "crypto";
import type { ChapterRow, VideoRow, QuizRow, QuestionRow } from "./catalog";

export type ManifestEntry = {
  file: string;
  type: "video" | "quiz";
  class: number;
  board: string;
  medium: string;
  subject: string;
  subject_id: string;
  subject_hindi?: string | null;
  chapter_no: number;
  chapter_id: string;
  chapter_title: string;
  chapter_title_hindi?: string | null;
  // Video fields
  video_id?: string;
  video_title?: string | null;
  video_title_hindi?: string | null;
  sort_order?: number;
  duration_seconds?: number;
  // Quiz fields
  quiz_id?: string;
  questions?: Array<{
    question_id: string;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: number;
    sort_order: number;
  }>;
};

export type Manifest = {
  version: number;
  drive_id: string;
  created_at: string;
  content: ManifestEntry[];
};

/** Generate a random 8-char hex filename. */
function randomFileName(): string {
  return randomBytes(4).toString("hex");
}

/** Map from encrypted filename → original S3 key (for download step). */
export type FileMapping = {
  encryptedName: string;
  s3Key: string;
  videoId: string;
};

/**
 * Build the manifest from catalog data.
 * Returns the manifest + a list of file mappings for the download/encrypt step.
 */
export function buildManifest(
  chapters: ChapterRow[],
  videos: VideoRow[],
  quizzes: QuizRow[],
  questions: QuestionRow[],
  medium: string,
): { manifest: Manifest; fileMappings: FileMapping[] } {
  const driveId = crypto.randomUUID();
  const entries: ManifestEntry[] = [];
  const fileMappings: FileMapping[] = [];

  // Index quizzes and questions
  const quizByChapter = new Map<string, QuizRow>();
  for (const quiz of quizzes) quizByChapter.set(quiz.chapter_id, quiz);

  const questionsByQuiz = new Map<string, QuestionRow[]>();
  for (const q of questions) {
    const list = questionsByQuiz.get(q.quiz_id) ?? [];
    list.push(q);
    questionsByQuiz.set(q.quiz_id, list);
  }

  // Group videos by chapter
  const videosByChapter = new Map<string, VideoRow[]>();
  for (const video of videos) {
    const list = videosByChapter.get(video.chapter_id) ?? [];
    list.push(video);
    videosByChapter.set(video.chapter_id, list);
  }

  for (const chapter of chapters) {
    const subject = chapter.subjects;
    const chapterVideos = videosByChapter.get(chapter.id) ?? [];

    // Video entries
    for (const video of chapterVideos) {
      const encryptedName = `${randomFileName()}.dat`;
      const s3Key = medium === "Hindi" && video.s3_key_hindi ? video.s3_key_hindi : video.s3_key;

      entries.push({
        file: encryptedName,
        type: "video",
        class: chapter.class,
        board: chapter.board,
        medium: chapter.medium,
        subject: subject?.name ?? "Unknown",
        subject_id: chapter.subject_id,
        subject_hindi: subject?.name_hindi,
        chapter_no: chapter.chapter_no,
        chapter_id: chapter.id,
        chapter_title: chapter.title,
        chapter_title_hindi: chapter.title_hindi,
        video_id: video.id,
        video_title: video.title,
        video_title_hindi: video.title_hindi,
        sort_order: video.sort_order,
        duration_seconds: video.duration_seconds,
      });

      fileMappings.push({ encryptedName, s3Key, videoId: video.id });
    }

    // Quiz entry
    const quiz = quizByChapter.get(chapter.id);
    if (quiz) {
      const encryptedName = `${randomFileName()}.dat`;
      const quizQuestions = (questionsByQuiz.get(quiz.id) ?? []).map((q) => ({
        question_id: q.id,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_option: q.correct_option,
        sort_order: q.sort_order,
      }));

      if (quizQuestions.length > 0) {
        entries.push({
          file: encryptedName,
          type: "quiz",
          class: chapter.class,
          board: chapter.board,
          medium: chapter.medium,
          subject: subject?.name ?? "Unknown",
          subject_id: chapter.subject_id,
          subject_hindi: subject?.name_hindi,
          chapter_no: chapter.chapter_no,
          chapter_id: chapter.id,
          chapter_title: chapter.title,
          chapter_title_hindi: chapter.title_hindi,
          quiz_id: quiz.id,
          questions: quizQuestions,
        });
      }
    }
  }

  return {
    manifest: {
      version: 1,
      drive_id: driveId,
      created_at: new Date().toISOString(),
      content: entries,
    },
    fileMappings,
  };
}
