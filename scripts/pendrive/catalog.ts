import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type ChapterRow = {
  id: string;
  subject_id: string;
  class: number;
  board: string;
  medium: string;
  chapter_no: number;
  title: string;
  title_hindi: string | null;
  subjects: { id: string; name: string; name_hindi: string | null; display_order: number } | null;
};

export type VideoRow = {
  id: string;
  chapter_id: string;
  title: string;
  title_hindi: string | null;
  s3_key: string;
  s3_key_hindi: string | null;
  duration_seconds: number;
  sort_order: number;
};

export type QuizRow = {
  id: string;
  chapter_id: string;
  question_count: number;
};

export type QuestionRow = {
  id: string;
  quiz_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: number;
  sort_order: number;
};

export async function fetchChapters(
  classes: number[],
  board: string,
  medium: string,
): Promise<ChapterRow[]> {
  const { data, error } = await supabase
    .from("chapters")
    .select("id, subject_id, class, board, medium, chapter_no, title, title_hindi, subjects(id, name, name_hindi, display_order)")
    .in("class", classes)
    .eq("board", board)
    .eq("medium", medium)
    .order("class")
    .order("chapter_no");

  if (error) throw new Error(`Failed to fetch chapters: ${error.message}`);
  return (data ?? []) as ChapterRow[];
}

export async function fetchVideos(chapterIds: string[]): Promise<VideoRow[]> {
  if (!chapterIds.length) return [];
  const all: VideoRow[] = [];

  // Chunk to avoid URL length limits
  for (let i = 0; i < chapterIds.length; i += 50) {
    const chunk = chapterIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("videos")
      .select("id, chapter_id, title, title_hindi, s3_key, s3_key_hindi, duration_seconds, sort_order")
      .in("chapter_id", chunk)
      .order("chapter_id")
      .order("sort_order");

    if (error) throw new Error(`Failed to fetch videos: ${error.message}`);
    all.push(...((data ?? []) as VideoRow[]));
  }

  return all;
}

export async function fetchQuizzes(chapterIds: string[]): Promise<QuizRow[]> {
  if (!chapterIds.length) return [];
  const { data, error } = await supabase
    .from("chapter_quizzes")
    .select("id, chapter_id, question_count")
    .in("chapter_id", chapterIds)
    .eq("is_published", true);

  if (error) throw new Error(`Failed to fetch quizzes: ${error.message}`);
  return (data ?? []) as QuizRow[];
}

export async function fetchQuestions(quizIds: string[]): Promise<QuestionRow[]> {
  if (!quizIds.length) return [];
  const all: QuestionRow[] = [];

  for (let i = 0; i < quizIds.length; i += 50) {
    const chunk = quizIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("quiz_questions")
      .select("id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, sort_order")
      .in("quiz_id", chunk)
      .order("quiz_id")
      .order("sort_order");

    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
    all.push(...((data ?? []) as QuestionRow[]));
  }

  return all;
}
