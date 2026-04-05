import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { ContinueWatching } from "@/components/dashboard/continue-watching";
import { RecommendedLessons } from "@/components/dashboard/recommended-lessons";
import { SubjectGrid } from "@/components/dashboard/subject-grid";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role, class, board, medium, org_id")
    .eq("id", userId)
    .single();

  if (!profile) redirect("/login");

  // Get user's content (chapters + videos matching their class/board/medium)
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, title, chapter_no, subject_id, subjects(id, name)")
    .eq("class", profile.class ?? 0)
    .eq("board", profile.board ?? "CBSE")
    .eq("medium", profile.medium ?? "English")
    .order("chapter_no");

  // Filter out content-restricted chapters for this user's org
  let chapters = allChapters ?? [];
  if (profile.org_id) {
    const { data: restrictions } = await supabase
      .from("content_restrictions")
      .select("chapter_id")
      .eq("org_id", profile.org_id);
    const blockedIds = new Set(restrictions?.map((r) => r.chapter_id) ?? []);
    chapters = chapters.filter((c) => !blockedIds.has(c.id));
  }

  const chapterIds = chapters.map((c) => c.id);

  // Get all videos for these chapters
  const { data: videos } = chapterIds.length > 0
    ? await supabase
        .from("videos")
        .select("id, title, chapter_id, sort_order, duration_seconds, s3_key, s3_key_hindi")
        .in("chapter_id", chapterIds)
        .order("sort_order")
    : { data: [] };

  const videoIds = videos?.map((v) => v.id) ?? [];

  // Get user's progress
  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed, last_position, last_watched_at")
        .eq("user_id", userId)
        .in("video_id", videoIds)
    : { data: [] };

  const progressMap = new Map(progress?.map((p) => [p.video_id, p]) ?? []);

  // Calculate stats
  const totalWatchTimeSeconds = progress?.reduce((sum, p) => sum + (p.last_position || 0), 0) ?? 0;
  const chapterStats = chapters.map((chapter) => {
    const chapterVideos = videos?.filter((video) => video.chapter_id === chapter.id) ?? [];
    const chapterCompletedVideos = chapterVideos.filter((video) => progressMap.get(video.id)?.completed).length;
    const percent = chapterVideos.length > 0 ? Math.round((chapterCompletedVideos / chapterVideos.length) * 100) : 0;
    return {
      id: chapter.id,
      totalVideos: chapterVideos.length,
      completedVideos: chapterCompletedVideos,
      percent,
      completed: chapterVideos.length > 0 && chapterCompletedVideos === chapterVideos.length,
    };
  });
  const trackableChapterStats = chapterStats.filter((chapter) => chapter.totalVideos > 0);
  const totalChapters = trackableChapterStats.length;
  const completedChapters = trackableChapterStats.filter((chapter) => chapter.completed).length;

  // Calculate streak (consecutive days with activity)
  const watchDates = Array.from(new Set(
    (progress
      ?.map((p) => p.last_watched_at?.split("T")[0])
      .filter(Boolean) ?? []) as string[]
  )).sort().reverse();
  let streak = 0;
  for (let i = 0; i < watchDates.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    if (watchDates[i] === expected) streak++;
    else break;
  }

  // Continue watching: in-progress videos (sorted by last watched)
  const continueItems = (progress ?? [])
    .filter((p) => !p.completed && p.watched_percentage > 0)
    .sort((a, b) => new Date(b.last_watched_at!).getTime() - new Date(a.last_watched_at!).getTime())
    .slice(0, 3)
    .map((p) => {
      const video = videos?.find((v) => v.id === p.video_id);
      const chapter = chapters?.find((c) => c.id === video?.chapter_id);
      return {
        videoId: p.video_id,
        videoTitle: video?.title ?? "Unknown",
        chapterTitle: chapter?.title ?? "",
        subjectName: (chapter?.subjects as unknown as { id: string; name: string } | null)?.name ?? "",
        s3Key: profile.medium === "Hindi" && video?.s3_key_hindi ? video.s3_key_hindi : (video?.s3_key ?? null),
        watchedPercentage: p.watched_percentage,
        lastPosition: p.last_position,
      };
    });

  // Recommended: next unwatched video per subject
  const subjectMap = new Map<string, typeof chapters>();
  chapters?.forEach((ch) => {
    const subName = (ch.subjects as unknown as { id: string; name: string } | null)?.name ?? "Unknown";
    if (!subjectMap.has(subName)) subjectMap.set(subName, []);
    subjectMap.get(subName)!.push(ch);
  });

  const recommendedItems: Array<{
    videoId: string;
    videoTitle: string;
    chapterTitle: string;
    subjectName: string;
    chapterNo: number;
    s3Key: string | null;
  }> = [];

  subjectMap.forEach((subChapters, subjectName) => {
    for (const ch of subChapters) {
      const chapterVideos = videos?.filter((v) => v.chapter_id === ch.id) ?? [];
      for (const video of chapterVideos) {
        const prog = progressMap.get(video.id);
        if (!prog || !prog.completed) {
          if (recommendedItems.length < 6) {
            recommendedItems.push({
              videoId: video.id,
              videoTitle: video.title,
              chapterTitle: ch.title,
              subjectName,
              chapterNo: ch.chapter_no,
              s3Key: profile.medium === "Hindi" && video.s3_key_hindi ? video.s3_key_hindi : (video.s3_key ?? null),
            });
          }
          return;
        }
      }
    }
  });

  // Subject progress
  const subjectProgress = Array.from(subjectMap.entries()).map(([name, subChapters]) => {
    const subjectId = (subChapters[0]?.subjects as unknown as { id: string; name: string } | null)?.id ?? "";
    const subVideos = subChapters.flatMap(
      (ch) => videos?.filter((v) => v.chapter_id === ch.id) ?? []
    );
    const subCompleted = subVideos.filter((v) => progressMap.get(v.id)?.completed).length;
    const subChapterStats = subChapters
      .map((chapter) => chapterStats.find((item) => item.id === chapter.id))
      .filter((chapter): chapter is NonNullable<typeof chapterStats[number]> => Boolean(chapter));
    const trackableSubjectChapters = subChapterStats.filter((chapter) => chapter.totalVideos > 0);
    const subCompletedChapters = trackableSubjectChapters.filter((chapter) => chapter.completed).length;
    return {
      id: subjectId,
      name,
      totalVideos: subVideos.length,
      completedVideos: subCompleted,
      totalChapters: trackableSubjectChapters.length,
      completedChapters: subCompletedChapters,
    };
  }).filter((subject) => subject.totalChapters > 0 || subject.totalVideos > 0);

  return (
    <div className="space-y-8">
      <Header
        title={`Welcome back, ${profile.name}`}
        subtitle="Here's your learning overview"
      />

      <StatsOverview
        totalChapters={totalChapters}
        completedChapters={completedChapters}
        totalWatchTimeSeconds={totalWatchTimeSeconds}
        streak={streak}
        activeSubjects={subjectProgress.filter((subject) => subject.totalChapters > 0).length}
      />

      <ContinueWatching items={continueItems} />

      <RecommendedLessons items={recommendedItems} />

      <SubjectGrid subjects={subjectProgress} />
    </div>
  );
}
