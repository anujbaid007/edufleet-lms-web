import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VideoPlayer } from "@/components/video/video-player";
import { ChapterPlaylist } from "@/components/video/chapter-playlist";

export default async function WatchPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user's medium preference
  const { data: profile } = await supabase
    .from("profiles")
    .select("medium")
    .eq("id", user.id)
    .single();

  const isHindi = profile?.medium === "Hindi";

  // Get the video with its chapter
  const { data: video } = await supabase
    .from("videos")
    .select("id, title, title_hindi, s3_key, s3_key_hindi, duration_seconds, duration_seconds_hindi, chapter_id, sort_order")
    .eq("id", params.id)
    .single();

  if (!video) redirect("/dashboard");

  // Use Hindi variants when available and user's medium is Hindi
  const videoTitle = (isHindi && video.title_hindi) ? video.title_hindi : video.title;
  const videoS3Key = (isHindi && video.s3_key_hindi) ? video.s3_key_hindi : video.s3_key;
  const videoDuration = (isHindi && video.duration_seconds_hindi) ? video.duration_seconds_hindi : video.duration_seconds;

  // Get chapter info
  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, chapter_no, subjects(name)")
    .eq("id", video.chapter_id)
    .single();

  if (!chapter) redirect("/dashboard");

  // Get all videos in this chapter (for playlist)
  const { data: chapterVideos } = await supabase
    .from("videos")
    .select("id, title, title_hindi, duration_seconds, duration_seconds_hindi, sort_order")
    .eq("chapter_id", chapter.id)
    .order("sort_order");

  // Get progress for all chapter videos
  const chapterVideoIds = chapterVideos?.map((v) => v.id) ?? [];
  const { data: progressData } = chapterVideoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed, last_position")
        .eq("user_id", user.id)
        .in("video_id", chapterVideoIds)
    : { data: [] };

  const progressMap = new Map(progressData?.map((p) => [p.video_id, p]) ?? []);
  const currentProgress = progressMap.get(video.id);

  const subjectName = (chapter.subjects as unknown as { name: string } | null)?.name ?? "";

  const playlistVideos = (chapterVideos ?? []).map((v) => ({
    id: v.id,
    title: (isHindi && v.title_hindi) ? v.title_hindi : v.title,
    durationSeconds: (isHindi && v.duration_seconds_hindi) ? v.duration_seconds_hindi : v.duration_seconds,
    completed: progressMap.get(v.id)?.completed ?? false,
    watchedPercentage: progressMap.get(v.id)?.watched_percentage ?? 0,
  }));

  return (
    <div className="flex gap-6 -mt-2">
      {/* Video Player */}
      <div className="flex-1 min-w-0">
        <VideoPlayer
          videoId={video.id}
          s3Key={videoS3Key}
          initialPosition={currentProgress?.last_position ?? 0}
          durationSeconds={videoDuration}
        />
        <div className="mt-4">
          <h1 className="text-xl font-bold text-heading font-poppins">{videoTitle}</h1>
          <p className="text-sm text-muted mt-1">
            {subjectName} · Ch. {chapter.chapter_no}: {chapter.title}
          </p>
        </div>
      </div>

      {/* Playlist Sidebar */}
      <div className="w-80 shrink-0 hidden lg:block">
        <ChapterPlaylist
          chapterTitle={chapter.title}
          chapterNo={chapter.chapter_no}
          subjectName={subjectName}
          videos={playlistVideos}
          activeVideoId={video.id}
        />
      </div>
    </div>
  );
}
