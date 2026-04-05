import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { Users, User } from "lucide-react";

export const metadata = { title: "My Students" };

export default async function MyStudentsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (!profile || profile.role !== "teacher") redirect("/dashboard");

  // Get students assigned to this teacher
  const { data: students } = await supabase
    .from("profiles")
    .select("id, name, class, board, medium, org_id")
    .eq("teacher_id", userId)
    .eq("is_active", true)
    .order("name");

  const studentList = students ?? [];
  const studentIds = studentList.map((student) => student.id);
  const orgIds = Array.from(
    new Set(studentList.map((student) => student.org_id).filter((value): value is string => Boolean(value)))
  );
  const classes = Array.from(
    new Set(studentList.map((student) => student.class).filter((value): value is number => value !== null))
  );
  const boards = Array.from(
    new Set(studentList.map((student) => student.board).filter((value): value is string => Boolean(value)))
  );
  const media = Array.from(
    new Set(studentList.map((student) => student.medium).filter((value): value is string => Boolean(value)))
  );

  const [{ data: restrictions }, { data: chapters }] = await Promise.all([
    orgIds.length > 0
      ? supabase.from("content_restrictions").select("org_id, chapter_id").in("org_id", orgIds)
      : Promise.resolve({ data: [] }),
    classes.length > 0 && boards.length > 0 && media.length > 0
      ? supabase
          .from("chapters")
          .select("id, class, board, medium")
          .in("class", classes)
          .in("board", boards)
          .in("medium", media)
      : Promise.resolve({ data: [] }),
  ]);

  const chapterIds = (chapters ?? []).map((chapter) => chapter.id);
  const { data: videos } = chapterIds.length > 0
    ? await supabase
        .from("videos")
        .select("id, chapter_id")
        .in("chapter_id", chapterIds)
    : { data: [] };

  const { data: allProgress } = studentIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("user_id, video_id, completed, last_watched_at")
        .in("user_id", studentIds)
    : { data: [] };

  const blockedChapterIdsByOrg = new Map<string, Set<string>>();
  for (const restriction of restrictions ?? []) {
    const blocked = blockedChapterIdsByOrg.get(restriction.org_id) ?? new Set<string>();
    blocked.add(restriction.chapter_id);
    blockedChapterIdsByOrg.set(restriction.org_id, blocked);
  }

  const videoIdsByChapter = new Map<string, string[]>();
  for (const video of videos ?? []) {
    const chapterVideoIds = videoIdsByChapter.get(video.chapter_id) ?? [];
    chapterVideoIds.push(video.id);
    videoIdsByChapter.set(video.chapter_id, chapterVideoIds);
  }

  const chaptersByCombo = new Map<string, Array<{ id: string; class: number; board: string; medium: string }>>();
  for (const chapter of chapters ?? []) {
    const comboKey = `${chapter.class}|${chapter.board}|${chapter.medium}`;
    const matchingChapters = chaptersByCombo.get(comboKey) ?? [];
    matchingChapters.push(chapter);
    chaptersByCombo.set(comboKey, matchingChapters);
  }

  // Aggregate per student
  const studentStats = studentList.map((student) => {
    const studentProgress = allProgress?.filter((p) => p.user_id === student.id) ?? [];
    const completedVideoIds = new Set(studentProgress.filter((progress) => progress.completed).map((progress) => progress.video_id));
    const comboKey = `${student.class ?? "na"}|${student.board ?? "na"}|${student.medium ?? "na"}`;
    const blockedChapterIds = student.org_id ? blockedChapterIdsByOrg.get(student.org_id) ?? new Set<string>() : new Set<string>();
    const accessibleChapters = (chaptersByCombo.get(comboKey) ?? []).filter((chapter) => !blockedChapterIds.has(chapter.id));
    const trackableChapters = accessibleChapters.filter((chapter) => (videoIdsByChapter.get(chapter.id)?.length ?? 0) > 0);
    const completedChapters = trackableChapters.filter((chapter) => {
      const chapterVideoIds = videoIdsByChapter.get(chapter.id) ?? [];
      return chapterVideoIds.length > 0 && chapterVideoIds.every((videoId) => completedVideoIds.has(videoId));
    }).length;
    const lastActive = studentProgress
      .map((p) => p.last_watched_at)
      .filter(Boolean)
      .sort()
      .reverse()[0];

    const daysSinceActive = lastActive
      ? Math.floor((Date.now() - new Date(lastActive).getTime()) / 86400000)
      : null;

    return {
      ...student,
      completedChapters,
      totalChapters: trackableChapters.length,
      lastActive,
      daysSinceActive,
      isInactive: daysSinceActive !== null && daysSinceActive > 7,
    };
  });

  const activeCount = studentStats.filter((s) => !s.isInactive && s.daysSinceActive !== null).length;
  const inactiveCount = studentStats.filter((s) => s.isInactive).length;

  return (
    <div className="space-y-8">
      <Header
        title="My Students"
        subtitle={`${students?.length ?? 0} students in your batch`}
      />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <ClayCard hover={false} className="!p-5 text-center">
          <Users className="w-8 h-8 text-orange-primary mx-auto mb-2" />
          <p className="text-2xl font-bold text-heading">{students?.length ?? 0}</p>
          <p className="text-xs text-muted">Total Students</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 text-center">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
            <span className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <p className="text-2xl font-bold text-heading">{activeCount}</p>
          <p className="text-xs text-muted">Active (7 days)</p>
        </ClayCard>
        <ClayCard hover={false} className="!p-5 text-center">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
          </div>
          <p className="text-2xl font-bold text-heading">{inactiveCount}</p>
          <p className="text-xs text-muted">Inactive (&gt;7 days)</p>
        </ClayCard>
      </div>

      {/* Student List */}
      <div className="space-y-3">
        {studentStats.map((student) => (
          <ClayCard key={student.id} hover={false} className="!p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full clay-surface shadow-clay-pill flex items-center justify-center">
                <User className="w-5 h-5 text-orange-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-heading">{student.name}</p>
                <p className="text-xs text-muted">
                  {student.class === 0 ? "KG" : student.class === 99 ? "General" : `Class ${student.class}`} · {student.board} · {student.medium}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-heading">
                  {student.completedChapters}/{student.totalChapters} chapters
                </p>
                <p className={`text-xs ${student.isInactive ? "text-red-500 font-semibold" : "text-muted"}`}>
                  {student.daysSinceActive === null
                    ? "Never active"
                    : student.daysSinceActive === 0
                    ? "Active today"
                    : `${student.daysSinceActive}d ago`}
                </p>
              </div>
            </div>
          </ClayCard>
        ))}

        {(students?.length ?? 0) === 0 && (
          <ClayCard hover={false} className="text-center !py-12">
            <Users className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted">No students assigned to you yet.</p>
          </ClayCard>
        )}
      </div>
    </div>
  );
}
