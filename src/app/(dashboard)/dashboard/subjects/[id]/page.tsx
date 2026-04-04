import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ChevronRight, BookOpen } from "lucide-react";

export default async function SubjectPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("class, board, medium, org_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Get subject
  const { data: subject } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("id", params.id)
    .single();

  if (!subject) redirect("/dashboard");

  // Get chapters for this subject matching user's class/board/medium
  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, title, chapter_no")
    .eq("subject_id", subject.id)
    .eq("class", profile.class ?? 0)
    .eq("board", profile.board ?? "CBSE")
    .eq("medium", profile.medium ?? "English")
    .order("chapter_no");

  // Filter out content-restricted chapters
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

  // Get videos per chapter
  const { data: videos } = chapterIds.length > 0
    ? await supabase
        .from("videos")
        .select("id, chapter_id")
        .in("chapter_id", chapterIds)
    : { data: [] };

  // Get progress
  const videoIds = videos?.map((v) => v.id) ?? [];
  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, completed")
        .eq("user_id", user.id)
        .in("video_id", videoIds)
    : { data: [] };

  const completedSet = new Set(progress?.filter((p) => p.completed).map((p) => p.video_id) ?? []);

  // Build chapter data with completion
  const chaptersWithProgress = (chapters ?? []).map((ch) => {
    const chapterVideos = videos?.filter((v) => v.chapter_id === ch.id) ?? [];
    const chapterCompleted = chapterVideos.filter((v) => completedSet.has(v.id)).length;
    const percent = chapterVideos.length > 0
      ? Math.round((chapterCompleted / chapterVideos.length) * 100)
      : 0;
    return { ...ch, totalVideos: chapterVideos.length, completedVideos: chapterCompleted, percent };
  });

  return (
    <div>
      <Header
        title={subject.name}
        subtitle={`${chapters?.length ?? 0} chapters · Class ${profile.class}`}
      />

      <div className="space-y-3">
        {chaptersWithProgress.map((ch) => (
          <Link key={ch.id} href={`/dashboard/chapters/${ch.id}`}>
            <ClayCard className="!p-5 group cursor-pointer">
              <div className="flex items-center gap-4">
                <ProgressRing percentage={ch.percent} size={48} strokeWidth={5}>
                  <span className="text-[10px] font-bold text-heading">{ch.percent}%</span>
                </ProgressRing>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-heading">
                    Ch. {ch.chapter_no}: {ch.title}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {ch.completedVideos}/{ch.totalVideos} lessons completed
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted group-hover:text-orange-primary transition-colors shrink-0" />
              </div>
            </ClayCard>
          </Link>
        ))}

        {chaptersWithProgress.length === 0 && (
          <ClayCard hover={false} className="text-center !py-12">
            <BookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted">No chapters available for this subject.</p>
          </ClayCard>
        )}
      </div>
    </div>
  );
}
