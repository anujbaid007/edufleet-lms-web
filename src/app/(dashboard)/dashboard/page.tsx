import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WelcomeHero } from "@/components/dashboard/welcome-hero";
import { StatsOverview } from "@/components/dashboard/stats-overview";
import { ContinueWatching } from "@/components/dashboard/continue-watching";
import { RecommendedLessons } from "@/components/dashboard/recommended-lessons";
import { SubjectGrid } from "@/components/dashboard/subject-grid";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import { getLearnerScopeManifest, getLearnerVideoState } from "@/lib/learner-scope";

export const metadata = { title: "Dashboard" };

function getPreferredVideoKey(
  video: { s3_key?: string | null; s3_key_hindi?: string | null } | null | undefined,
  medium: string | null | undefined
) {
  return medium === "Hindi" && video?.s3_key_hindi ? video.s3_key_hindi : (video?.s3_key ?? null);
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const scope = await getLearnerScopeManifest(supabase, userId);
  if (!scope) redirect("/login");

  const { profile, chapters, chapterIds, chaptersById, subjects } = scope;
  const {
    videos,
    videosByChapterId,
    progressRows,
    progressByVideoId,
    completedVideoIds,
  } = await getLearnerVideoState(
    supabase,
    userId,
    chapterIds,
    "id, title, chapter_id, sort_order, duration_seconds, s3_key, s3_key_hindi"
  );
  const videosById = new Map(videos.map((video) => [video.id, video]));
  const chapterThumbnailKeyById = new Map(
    Array.from(videosByChapterId.entries()).map(([chapterId, chapterVideos]) => [
      chapterId,
      getPreferredVideoKey(chapterVideos[0], profile.medium),
    ])
  );

  // Calculate stats
  const totalWatchTimeSeconds = progressRows.reduce((sum, progress) => sum + (progress.last_position || 0), 0);
  const chapterStats = chapters.map((chapter) => {
    const chapterVideos = videosByChapterId.get(chapter.id) ?? [];
    const chapterCompletedVideos = chapterVideos.filter((video) => completedVideoIds.has(video.id)).length;
    const percent = chapterVideos.length > 0 ? Math.round((chapterCompletedVideos / chapterVideos.length) * 100) : 0;
    return {
      id: chapter.id,
      totalVideos: chapterVideos.length,
      completedVideos: chapterCompletedVideos,
      percent,
      completed: chapterVideos.length > 0 && chapterCompletedVideos === chapterVideos.length,
    };
  });
  const chapterStatsById = new Map(chapterStats.map((chapter) => [chapter.id, chapter]));
  const trackableChapterStats = chapterStats.filter((chapter) => chapter.totalVideos > 0);
  const totalChapters = trackableChapterStats.length;
  const completedChapters = trackableChapterStats.filter((chapter) => chapter.completed).length;

  // Calculate streak (consecutive days with activity)
  const watchDates = Array.from(new Set(
    (progressRows
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
  const continueItems = progressRows
    .filter((p) => !p.completed && (p.watched_percentage ?? 0) > 0)
    .sort((a, b) => new Date(b.last_watched_at!).getTime() - new Date(a.last_watched_at!).getTime())
    .slice(0, 3)
    .map((p) => {
      const video = videosById.get(p.video_id);
      const chapter = video ? chaptersById.get(video.chapter_id) : undefined;
      return {
        videoId: p.video_id,
        videoTitle: video?.title ?? "Unknown",
        chapterTitle: chapter?.title ?? "",
        subjectName: chapter?.subjects?.name ?? "",
        s3Key: video ? (chapterThumbnailKeyById.get(video.chapter_id) ?? getPreferredVideoKey(video, profile.medium)) : null,
        watchedPercentage: p.watched_percentage ?? 0,
        lastPosition: p.last_position ?? 0,
      };
    });

  // Recommended: next unwatched video per subject
  const recommendedItems: Array<{
    videoId: string;
    videoTitle: string;
    chapterTitle: string;
    subjectName: string;
    chapterNo: number;
    s3Key: string | null;
  }> = [];

  for (const subject of subjects) {
    const subjectName = subject.name;
    let nextRecommendationFound = false;

    for (const chapter of subject.chapters) {
      const chapterVideos = videosByChapterId.get(chapter.id) ?? [];
      for (const video of chapterVideos) {
        const prog = progressByVideoId.get(video.id);
        if (!prog || !prog.completed) {
          if (recommendedItems.length < 6) {
            recommendedItems.push({
              videoId: video.id,
              videoTitle: video.title ?? "Untitled lesson",
              chapterTitle: chapter.title,
              subjectName,
              chapterNo: chapter.chapter_no,
              s3Key: chapterThumbnailKeyById.get(chapter.id) ?? getPreferredVideoKey(video, profile.medium),
            });
          }
          nextRecommendationFound = true;
          break;
        }
      }

      if (nextRecommendationFound || recommendedItems.length >= 6) break;
    }

    if (recommendedItems.length >= 6) break;
  }

  // Subject progress
  const subjectProgress = subjects.map((subject) => {
    const subjectVideos = subject.chapters.flatMap((chapter) => videosByChapterId.get(chapter.id) ?? []);
    const completedVideos = subjectVideos.filter((video) => completedVideoIds.has(video.id)).length;
    const subjectChapterStats = subject.chapters
      .map((chapter) => chapterStatsById.get(chapter.id))
      .filter((chapter): chapter is NonNullable<typeof chapterStats[number]> => Boolean(chapter));
    const trackableSubjectChapters = subjectChapterStats.filter((chapter) => chapter.totalVideos > 0);
    const completedSubjectChapters = trackableSubjectChapters.filter((chapter) => chapter.completed).length;

    return {
      id: subject.id,
      name: subject.name,
      totalVideos: subjectVideos.length,
      completedVideos,
      totalChapters: trackableSubjectChapters.length,
      completedChapters: completedSubjectChapters,
    };
  }).filter((subject) => subject.totalChapters > 0 || subject.totalVideos > 0);

  return (
    <div className="space-y-8">
      <ScrollResetOnMount />
      <WelcomeHero
        name={profile.name ?? "Learner"}
        streak={streak}
        completedChapters={completedChapters}
        totalChapters={totalChapters}
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
