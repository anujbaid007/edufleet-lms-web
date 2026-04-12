import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

export type LearnerScopeProfile = {
  name: string | null;
  class: number | null;
  board: string | null;
  medium: string | null;
  org_id: string | null;
};

export type LearnerScopeChapter = {
  id: string;
  title: string;
  title_hindi: string | null;
  chapter_no: number;
  subject_id: string;
  subjects: { id: string; name: string } | null;
};

export type LearnerScopeSubject = {
  id: string;
  name: string;
  chapters: LearnerScopeChapter[];
};

export type LearnerScopeManifest = {
  profile: LearnerScopeProfile;
  chapters: LearnerScopeChapter[];
  chapterIds: string[];
  chaptersById: Map<string, LearnerScopeChapter>;
  chaptersBySubjectId: Map<string, LearnerScopeChapter[]>;
  subjects: LearnerScopeSubject[];
};

export type LearnerVideoRow = {
  id: string;
  title?: string;
  chapter_id: string;
  sort_order?: number;
  duration_seconds?: number;
  s3_key?: string | null;
  s3_key_hindi?: string | null;
};

export type LearnerVideoProgressRow = {
  video_id: string;
  watched_percentage?: number;
  completed: boolean;
  last_position?: number;
  last_watched_at?: string | null;
};

export type LearnerVideoState = {
  videos: LearnerVideoRow[];
  videoIds: string[];
  videosByChapterId: Map<string, LearnerVideoRow[]>;
  progressRows: LearnerVideoProgressRow[];
  progressByVideoId: Map<string, LearnerVideoProgressRow>;
  completedVideoIds: Set<string>;
};

export async function getLearnerScopeManifest(
  supabase: AppSupabaseClient,
  userId: string
): Promise<LearnerScopeManifest | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, class, board, medium, org_id")
    .eq("id", userId)
    .single();

  if (!profile) return null;

  const chaptersPromise = supabase
    .from("chapters")
    .select("id, title, title_hindi, chapter_no, subject_id, subjects(id, name)")
    .eq("class", profile.class ?? 0)
    .eq("board", profile.board ?? "CBSE")
    .eq("medium", profile.medium ?? "English")
    .order("chapter_no");

  const restrictionsPromise = profile.org_id
    ? supabase.from("content_restrictions").select("chapter_id").eq("org_id", profile.org_id)
    : Promise.resolve({ data: [] as Array<{ chapter_id: string }> });

  const [{ data: allChapters }, { data: restrictions }] = await Promise.all([
    chaptersPromise,
    restrictionsPromise,
  ]);

  const blockedIds = new Set((restrictions ?? []).map((row) => row.chapter_id));
  const chapters = (allChapters ?? []).filter((chapter) => !blockedIds.has(chapter.id)) as LearnerScopeChapter[];
  const chapterIds = chapters.map((chapter) => chapter.id);

  const chaptersById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const chaptersBySubjectId = new Map<string, LearnerScopeChapter[]>();

  for (const chapter of chapters) {
    const subjectId = chapter.subjects?.id ?? chapter.subject_id;
    if (!chaptersBySubjectId.has(subjectId)) {
      chaptersBySubjectId.set(subjectId, []);
    }
    chaptersBySubjectId.get(subjectId)!.push(chapter);
  }

  const subjects = Array.from(chaptersBySubjectId.entries())
    .map(([subjectId, subjectChapters]) => ({
      id: subjectId,
      name: subjectChapters[0]?.subjects?.name ?? "Subject",
      chapters: subjectChapters,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    profile,
    chapters,
    chapterIds,
    chaptersById,
    chaptersBySubjectId,
    subjects,
  };
}

export async function getLearnerVideoState(
  supabase: AppSupabaseClient,
  userId: string,
  chapterIds: string[],
  videoSelect = "id, chapter_id"
): Promise<LearnerVideoState> {
  const { data: videos } = chapterIds.length > 0
    ? await supabase.from("videos").select(videoSelect).in("chapter_id", chapterIds)
    : { data: [] };

  const videoRows = (videos ?? []) as unknown as LearnerVideoRow[];
  const videoIds = videoRows.map((video) => video.id);

  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed, last_position, last_watched_at")
        .eq("user_id", userId)
        .in("video_id", videoIds)
    : { data: [] };

  const progressRows = (progress ?? []) as unknown as LearnerVideoProgressRow[];
  const progressByVideoId = new Map(progressRows.map((row) => [row.video_id, row]));
  const completedVideoIds = new Set(progressRows.filter((row) => row.completed).map((row) => row.video_id));
  const videosByChapterId = new Map<string, LearnerVideoRow[]>();

  for (const video of videoRows) {
    if (!videosByChapterId.has(video.chapter_id)) {
      videosByChapterId.set(video.chapter_id, []);
    }
    videosByChapterId.get(video.chapter_id)!.push(video);
  }

  Array.from(videosByChapterId.values()).forEach((chapterVideos) => {
    chapterVideos.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  });

  return {
    videos: videoRows,
    videoIds,
    videosByChapterId,
    progressRows,
    progressByVideoId,
    completedVideoIds,
  };
}
