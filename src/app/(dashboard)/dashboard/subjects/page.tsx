import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { SubjectGrid } from "@/components/dashboard/subject-grid";
import { ClayCard } from "@/components/ui/clay-card";
import { BookOpen } from "lucide-react";
import { ScrollResetOnMount } from "@/components/ui/scroll-reset-on-mount";
import { getLearnerScopeManifest, getLearnerVideoState } from "@/lib/learner-scope";
import { t } from "@/lib/i18n";
import { getServerLang } from "@/lib/i18n-server";

export const metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  const lang = getServerLang();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const scope = await getLearnerScopeManifest(supabase, userId);
  if (!scope) redirect("/login");

  const { chapters, chapterIds, subjects: learnerSubjects } = scope;
  const { videosByChapterId, completedVideoIds } = await getLearnerVideoState(supabase, userId, chapterIds);

  const chapterStats = chapters.map((chapter) => {
    const chapterVideos = videosByChapterId.get(chapter.id) ?? [];
    const completedVideos = chapterVideos.filter((video) => completedVideoIds.has(video.id)).length;

    return {
      id: chapter.id,
      totalVideos: chapterVideos.length,
      completedVideos,
      completed: chapterVideos.length > 0 && completedVideos === chapterVideos.length,
    };
  });
  const chapterStatsById = new Map(chapterStats.map((chapter) => [chapter.id, chapter]));

  const subjects = learnerSubjects
    .map((subject) => {
      const subjectVideos = subject.chapters.flatMap((chapter) => videosByChapterId.get(chapter.id) ?? []);
      const completedVideos = subjectVideos.filter((video) => completedVideoIds.has(video.id)).length;
      const subjectChapterStats = subject.chapters
        .map((chapter) => chapterStatsById.get(chapter.id))
        .filter((chapter): chapter is NonNullable<typeof chapterStats[number]> => Boolean(chapter));
      const trackableChapters = subjectChapterStats.filter((chapter) => chapter.totalVideos > 0);

      return {
        id: subject.id,
        name: subject.name,
        totalVideos: subjectVideos.length,
        completedVideos,
        totalChapters: trackableChapters.length,
        completedChapters: trackableChapters.filter((chapter) => chapter.completed).length,
      };
    })
    .filter((subject) => subject.totalVideos > 0 || subject.totalChapters > 0);

  return (
    <div className="space-y-8">
      <ScrollResetOnMount />
      <Header
        title={t(lang, "subjectsPage.title")}
        subtitle={t(lang, "subjectsPage.subtitle", { n: subjects.length })}
      />

      {subjects.length > 0 ? (
        <SubjectGrid subjects={subjects} />
      ) : (
        <ClayCard hover={false} className="!py-14 text-center">
          <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted" />
          <p className="text-muted">{t(lang, "subjectsPage.empty")}</p>
        </ClayCard>
      )}
    </div>
  );
}
