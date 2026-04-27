import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chapterId = params.id;
  if (!chapterId) {
    return NextResponse.json({ error: "Missing chapter id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: chapter, error: chapterError }, { data: videos, error: videosError }] = await Promise.all([
    admin
      .from("chapters")
      .select("id, title, title_hindi, chapter_no, class, board, medium, subject_id, subjects(name)")
      .eq("id", chapterId)
      .single(),
    admin
      .from("videos")
      .select("id, title, title_hindi, duration_seconds, s3_key, s3_key_hindi, sort_order")
      .eq("chapter_id", chapterId)
      .order("sort_order"),
  ]);

  if (chapterError || !chapter) {
    return NextResponse.json({ error: chapterError?.message ?? "Chapter not found" }, { status: 404 });
  }

  if (videosError) {
    return NextResponse.json({ error: videosError.message }, { status: 500 });
  }

  return NextResponse.json({
    chapter: {
      id: chapter.id,
      title: chapter.medium === "Hindi" && chapter.title_hindi ? chapter.title_hindi : chapter.title,
      chapterNo: chapter.chapter_no,
      classNum: chapter.class,
      board: chapter.board,
      medium: chapter.medium,
      subjectName: (chapter.subjects as { name: string } | null)?.name ?? "Unknown",
      videos: (videos ?? []).map((video) => ({
        id: video.id,
        title: chapter.medium === "Hindi" && video.title_hindi ? video.title_hindi : video.title,
        durationSeconds: video.duration_seconds ?? 0,
        s3Key: chapter.medium === "Hindi" && video.s3_key_hindi ? video.s3_key_hindi : video.s3_key,
        playbackVariant: chapter.medium === "Hindi" && video.s3_key_hindi ? "hindi" : "default",
      })),
    },
  });
}
