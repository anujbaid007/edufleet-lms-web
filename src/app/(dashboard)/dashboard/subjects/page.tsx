import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { SubjectGrid } from "@/components/dashboard/subject-grid";
import { ClayCard } from "@/components/ui/clay-card";
import { BookOpen } from "lucide-react";

export const metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("class, board, medium, org_id")
    .eq("id", userId)
    .single();

  if (!profile) redirect("/login");

  const { data: allChapters } = await supabase
    .from("chapters")
    .select("id, title, chapter_no, subject_id, subjects(id, name)")
    .eq("class", profile.class ?? 0)
    .eq("board", profile.board ?? "CBSE")
    .eq("medium", profile.medium ?? "English")
    .order("chapter_no");

  let chapters = allChapters ?? [];
  if (profile.org_id) {
    const { data: restrictions } = await supabase
      .from("content_restrictions")
      .select("chapter_id")
      .eq("org_id", profile.org_id);
    const blockedIds = new Set(restrictions?.map((row) => row.chapter_id) ?? []);
    chapters = chapters.filter((chapter) => !blockedIds.has(chapter.id));
  }

  const chapterIds = chapters.map((chapter) => chapter.id);
  const { data: videos } = chapterIds.length > 0
    ? await supabase
        .from("videos")
        .select("id, chapter_id")
        .in("chapter_id", chapterIds)
    : { data: [] };

  const videoIds = videos?.map((video) => video.id) ?? [];
  const { data: progress } = videoIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("video_id, completed")
        .eq("user_id", userId)
        .in("video_id", videoIds)
    : { data: [] };

  const completedSet = new Set(progress?.filter((row) => row.completed).map((row) => row.video_id) ?? []);
  const chapterStats = chapters.map((chapter) => {
    const chapterVideos = videos?.filter((video) => video.chapter_id === chapter.id) ?? [];
    const completedVideos = chapterVideos.filter((video) => completedSet.has(video.id)).length;

    return {
      id: chapter.id,
      totalVideos: chapterVideos.length,
      completedVideos,
      completed: chapterVideos.length > 0 && completedVideos === chapterVideos.length,
    };
  });

  const subjectMap = new Map<string, typeof chapters>();
  chapters.forEach((chapter) => {
    const subject = (chapter.subjects as unknown as { id: string; name: string } | null)?.name ?? "Unknown";
    if (!subjectMap.has(subject)) subjectMap.set(subject, []);
    subjectMap.get(subject)!.push(chapter);
  });

  const subjects = Array.from(subjectMap.entries())
    .map(([name, subjectChapters]) => {
      const subjectId = (subjectChapters[0]?.subjects as unknown as { id: string; name: string } | null)?.id ?? "";
      const subjectVideos = subjectChapters.flatMap(
        (chapter) => videos?.filter((video) => video.chapter_id === chapter.id) ?? []
      );
      const completedVideos = subjectVideos.filter((video) => completedSet.has(video.id)).length;
      const subjectChapterStats = subjectChapters
        .map((chapter) => chapterStats.find((item) => item.id === chapter.id))
        .filter((chapter): chapter is NonNullable<typeof chapterStats[number]> => Boolean(chapter));
      const trackableChapters = subjectChapterStats.filter((chapter) => chapter.totalVideos > 0);

      return {
        id: subjectId,
        name,
        totalVideos: subjectVideos.length,
        completedVideos,
        totalChapters: trackableChapters.length,
        completedChapters: trackableChapters.filter((chapter) => chapter.completed).length,
      };
    })
    .filter((subject) => subject.totalVideos > 0 || subject.totalChapters > 0);

  return (
    <div className="space-y-8">
      <Header
        title="Your Subjects"
        subtitle={`${subjects.length} subjects available in your learning path`}
      />

      {subjects.length > 0 ? (
        <SubjectGrid subjects={subjects} />
      ) : (
        <ClayCard hover={false} className="!py-14 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="text-muted">No subjects are available for your current class yet.</p>
        </ClayCard>
      )}
    </div>
  );
}
