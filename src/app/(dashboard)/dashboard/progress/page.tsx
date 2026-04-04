import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { formatDuration } from "@/lib/utils";
import { Clock, Flame, Trophy } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "My Progress" };

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("class, board, medium")
    .eq("id", userId)
    .single();
  if (!profile) redirect("/login");

  // Get all chapters for user's class
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, chapter_no, subject_id, subjects(id, name)")
    .eq("class", profile.class ?? 0)
    .eq("board", profile.board ?? "CBSE")
    .eq("medium", profile.medium ?? "English")
    .order("chapter_no");

  const chapterIds = chapters?.map((c) => c.id) ?? [];

  const { data: videos } = chapterIds.length > 0
    ? await supabase.from("videos").select("id, chapter_id, duration_seconds").in("chapter_id", chapterIds)
    : { data: [] };

  const videoIds = videos?.map((v) => v.id) ?? [];

  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed, last_position, last_watched_at")
        .eq("user_id", userId)
        .in("video_id", videoIds)
    : { data: [] };

  const progressMap = new Map(progress?.map((p) => [p.video_id, p]) ?? []);

  // Global stats
  const totalVideos = videos?.length ?? 0;
  const completedVideos = progress?.filter((p) => p.completed).length ?? 0;
  const totalWatchTime = progress?.reduce((sum, p) => sum + (p.last_position || 0), 0) ?? 0;
  const overallPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

  // Streak
  const watchDates = Array.from(new Set(
    progress?.map((p) => p.last_watched_at?.split("T")[0]).filter(Boolean).sort().reverse() ?? []
  )) as string[];
  let streak = 0;
  for (let i = 0; i < watchDates.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    if (watchDates[i] === expected) streak++;
    else break;
  }

  // Group by subject
  const subjectMap = new Map<string, { id: string; name: string; chapters: typeof chapters }>();
  chapters?.forEach((ch) => {
    const sub = ch.subjects as unknown as { id: string; name: string } | null;
    const subName = sub?.name ?? "Unknown";
    const subId = sub?.id ?? "";
    if (!subjectMap.has(subName)) subjectMap.set(subName, { id: subId, name: subName, chapters: [] });
    subjectMap.get(subName)!.chapters!.push(ch);
  });

  const subjectStats = Array.from(subjectMap.values()).map((sub) => {
    const subChapterIds = sub.chapters!.map((c: { id: string }) => c.id);
    const subVideos = videos?.filter((v) => subChapterIds.includes(v.chapter_id)) ?? [];
    const subCompleted = subVideos.filter((v) => progressMap.get(v.id)?.completed).length;
    const percent = subVideos.length > 0 ? Math.round((subCompleted / subVideos.length) * 100) : 0;

    const chapterStats = sub.chapters!.map((ch: { id: string; chapter_no: number; title: string }) => {
      const chVids = videos?.filter((v) => v.chapter_id === ch.id) ?? [];
      const chCompleted = chVids.filter((v) => progressMap.get(v.id)?.completed).length;
      const chPercent = chVids.length > 0 ? Math.round((chCompleted / chVids.length) * 100) : 0;
      return { ...ch, totalVideos: chVids.length, completedVideos: chCompleted, percent: chPercent };
    });

    return { ...sub, totalVideos: subVideos.length, completedVideos: subCompleted, percent, chapterStats };
  });

  return (
    <div className="space-y-8">
      <Header title="My Progress" subtitle="Track your learning journey" />

      {/* Overall Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayCard hover={false} className="!p-5 text-center">
          <ProgressRing percentage={overallPercent} size={72} strokeWidth={7}>
            <span className="text-sm font-bold text-heading">{overallPercent}%</span>
          </ProgressRing>
          <p className="text-xs text-muted mt-2">Overall Completion</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
          <Trophy className="w-8 h-8 text-orange-primary mb-2" />
          <p className="text-2xl font-bold text-heading">{completedVideos}</p>
          <p className="text-xs text-muted">Videos Completed</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
          <Clock className="w-8 h-8 text-orange-primary mb-2" />
          <p className="text-2xl font-bold text-heading">{formatDuration(totalWatchTime)}</p>
          <p className="text-xs text-muted">Total Watch Time</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 flex flex-col items-center justify-center">
          <Flame className="w-8 h-8 text-orange-500 mb-2" />
          <p className="text-2xl font-bold text-heading">{streak} days</p>
          <p className="text-xs text-muted">Current Streak</p>
        </ClayCard>
      </div>

      {/* Per-Subject Progress */}
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-heading font-poppins">Subject Progress</h2>
        {subjectStats.map((sub) => (
          <ClayCard key={sub.id} hover={false} className="!p-6">
            <div className="flex items-center gap-4 mb-4">
              <ProgressRing percentage={sub.percent} size={56} strokeWidth={6}>
                <span className="text-xs font-bold text-heading">{sub.percent}%</span>
              </ProgressRing>
              <div>
                <h3 className="font-poppins font-bold text-heading">{sub.name}</h3>
                <p className="text-xs text-muted">{sub.completedVideos}/{sub.totalVideos} videos · {sub.chapters!.length} chapters</p>
              </div>
            </div>

            {/* Chapter rings */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {sub.chapterStats.map((ch) => (
                <Link key={ch.id} href={`/dashboard/chapters/${ch.id}`} className="text-center group">
                  <ProgressRing percentage={ch.percent} size={44} strokeWidth={4}>
                    <span className="text-[9px] font-bold text-heading">{ch.percent}%</span>
                  </ProgressRing>
                  <p className="text-[10px] text-muted mt-1 truncate group-hover:text-heading transition-colors">
                    Ch. {ch.chapter_no}
                  </p>
                </Link>
              ))}
            </div>
          </ClayCard>
        ))}
      </div>
    </div>
  );
}
