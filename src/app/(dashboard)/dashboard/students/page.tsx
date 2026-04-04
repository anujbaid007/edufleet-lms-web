import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { Users, User } from "lucide-react";

export const metadata = { title: "My Students" };

export default async function MyStudentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "teacher") redirect("/dashboard");

  // Get students assigned to this teacher
  const { data: students } = await supabase
    .from("profiles")
    .select("id, name, class, board, medium")
    .eq("teacher_id", user.id)
    .eq("is_active", true)
    .order("name");

  // Get progress for all students
  const studentIds = students?.map((s) => s.id) ?? [];
  const { data: allProgress } = studentIds.length > 0
    ? await supabase
        .from("video_progress")
        .select("user_id, video_id, completed, last_watched_at")
        .in("user_id", studentIds)
    : { data: [] };

  // Aggregate per student
  const studentStats = (students ?? []).map((student) => {
    const studentProgress = allProgress?.filter((p) => p.user_id === student.id) ?? [];
    const completed = studentProgress.filter((p) => p.completed).length;
    const total = studentProgress.length;
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
      completedVideos: completed,
      totalWatched: total,
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
                  Class {student.class} · {student.board} · {student.medium}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-heading">{student.completedVideos} done</p>
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
