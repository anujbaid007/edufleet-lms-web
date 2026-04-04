import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { Play, CheckCircle2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";

export default async function ChapterPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id, title, chapter_no, subjects(name)")
    .eq("id", params.id)
    .single();

  if (!chapter) redirect("/dashboard");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, duration_seconds, sort_order")
    .eq("chapter_id", chapter.id)
    .order("sort_order");

  const videoIds = videos?.map((v) => v.id) ?? [];
  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, watched_percentage, completed")
        .eq("user_id", user.id)
        .in("video_id", videoIds)
    : { data: [] };

  const progressMap = new Map(progress?.map((p) => [p.video_id, p]) ?? []);

  // Need to cast the subjects join result
  const subjectName = (chapter.subjects as unknown as { name: string } | null)?.name ?? "Subject";

  return (
    <div>
      <Header
        title={`Ch. ${chapter.chapter_no}: ${chapter.title}`}
        subtitle={`${subjectName} · ${videos?.length ?? 0} lessons`}
      />

      <div className="space-y-3">
        {(videos ?? []).map((video) => {
          const prog = progressMap.get(video.id);
          const isCompleted = prog?.completed ?? false;
          const watchedPct = prog?.watched_percentage ?? 0;

          return (
            <Link key={video.id} href={`/dashboard/watch/${video.id}`}>
              <ClayCard className="!p-4 group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isCompleted
                      ? "bg-green-100 text-green-600"
                      : "clay-surface shadow-clay-pill group-hover:clay-surface-orange group-hover:shadow-clay-orange group-hover:text-white"
                  }`}>
                    {isCompleted ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Play className="w-4 h-4 text-orange-primary group-hover:text-white ml-0.5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-heading">{video.title}</p>
                    <p className="text-xs text-muted mt-0.5">{formatDuration(video.duration_seconds)}</p>
                    {watchedPct > 0 && !isCompleted && (
                      <div className="mt-2 h-1 bg-orange-primary/10 rounded-full overflow-hidden w-32">
                        <div
                          className="h-full bg-orange-primary rounded-full"
                          style={{ width: `${watchedPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted shrink-0">
                    {isCompleted ? "Done" : watchedPct > 0 ? `${watchedPct}%` : ""}
                  </span>
                </div>
              </ClayCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
