import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Users, TrendingUp, AlertTriangle } from "lucide-react";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  // Fetch scoped users (RLS handles filtering)
  const { data: allUsers } = await supabase
    .from("profiles")
    .select("id, name, role, centre_id, is_active")
    .eq("is_active", true);

  const students = allUsers?.filter((u) => u.role === "student") ?? [];

  // Fetch all progress (RLS-scoped)
  const { data: allProgress } = await supabase
    .from("video_progress")
    .select("user_id, video_id, completed, last_watched_at, watched_percentage");

  // Total videos
  const { count: totalVideos } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true });

  // ── Compute metrics ──

  const completedEntries = allProgress?.filter((p) => p.completed) ?? [];
  const totalCompletions = completedEntries.length;

  // Average completion per student
  const studentProgressMap = new Map<string, { completed: number; total: number }>();
  students.forEach((s) => {
    const sp = allProgress?.filter((p) => p.user_id === s.id) ?? [];
    const completed = sp.filter((p) => p.completed).length;
    studentProgressMap.set(s.id, { completed, total: totalVideos ?? 0 });
  });

  const avgCompletionPct = students.length > 0
    ? Math.round(
        Array.from(studentProgressMap.values()).reduce(
          (sum, s) => sum + (s.total > 0 ? (s.completed / s.total) * 100 : 0),
          0
        ) / students.length
      )
    : 0;

  // Active students (watched something in last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const activeStudentIds = new Set(
    allProgress
      ?.filter((p) => p.last_watched_at && p.last_watched_at >= sevenDaysAgo)
      .map((p) => p.user_id) ?? []
  );
  const activeStudents = students.filter((s) => activeStudentIds.has(s.id)).length;
  const inactiveStudents = students.length - activeStudents;

  // Inactive students list (>7 days)
  const inactiveList = students
    .filter((s) => !activeStudentIds.has(s.id))
    .map((s) => {
      const lastWatch = allProgress
        ?.filter((p) => p.user_id === s.id)
        .map((p) => p.last_watched_at)
        .filter(Boolean)
        .sort()
        .reverse()[0];
      return { ...s, lastWatch };
    })
    .slice(0, 10);

  // Subject-wise completion (for heatmap-style view)
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, subject_id, subjects(name)");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, chapter_id");

  const subjectMap = new Map<string, { name: string; totalVideos: number; completions: number }>();
  chapters?.forEach((ch) => {
    const subName = (ch.subjects as unknown as { name: string } | null)?.name ?? "Unknown";
    if (!subjectMap.has(subName)) subjectMap.set(subName, { name: subName, totalVideos: 0, completions: 0 });
    const chapterVideos = videos?.filter((v) => v.chapter_id === ch.id) ?? [];
    const entry = subjectMap.get(subName)!;
    entry.totalVideos += chapterVideos.length;
    const chapterVideoIds = new Set(chapterVideos.map((v) => v.id));
    entry.completions += completedEntries.filter((p) => chapterVideoIds.has(p.video_id)).length;
  });

  const subjectStats = Array.from(subjectMap.values())
    .filter((s) => s.totalVideos > 0)
    .sort((a, b) => b.totalVideos - a.totalVideos);

  const roleLabel = profile.role === "platform_admin" ? "Platform" : profile.role === "org_admin" ? "Organization" : "Centre";

  return (
    <div className="space-y-8">
      <Header title={`${roleLabel} Analytics`} subtitle="Engagement and progress metrics" />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayCard hover={false} className="!p-5 text-center">
          <ProgressRing percentage={avgCompletionPct} size={64} strokeWidth={6}>
            <span className="text-sm font-bold text-heading">{avgCompletionPct}%</span>
          </ProgressRing>
          <p className="text-xs text-muted mt-2">Avg Completion</p>
        </ClayCard>

        <ClayCard hover={false} className="!p-5 text-center">
          <Users className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-heading">{activeStudents}</p>
          <p className="text-xs text-muted">Active Students (7d)</p>
        </ClayCard>

        <ClayCard hover={false} className="!p-5 text-center">
          <TrendingUp className="w-8 h-8 text-orange-primary mx-auto mb-2" />
          <p className="text-2xl font-bold text-heading">{totalCompletions}</p>
          <p className="text-xs text-muted">Total Completions</p>
        </ClayCard>

        <ClayCard hover={false} className="!p-5 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-heading">{inactiveStudents}</p>
          <p className="text-xs text-muted">Inactive Students</p>
        </ClayCard>
      </div>

      {/* Subject Heatmap */}
      <ClayCard hover={false} className="!p-6">
        <h3 className="font-poppins font-bold text-heading mb-4">Subject-wise Engagement</h3>
        <div className="space-y-3">
          {subjectStats.map((sub) => {
            const pct = Math.round((sub.completions / (sub.totalVideos * Math.max(students.length, 1))) * 100);
            return (
              <div key={sub.name}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-heading">{sub.name}</span>
                  <span className="text-xs text-muted">{sub.completions} completions · {pct}% engagement</span>
                </div>
                <div className="h-3 bg-orange-primary/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-primary to-orange-400 rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </ClayCard>

      {/* Inactive Students Alert */}
      {inactiveList.length > 0 && (
        <ClayCard hover={false} className="!p-6">
          <h3 className="font-poppins font-bold text-heading mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Drop-off Alerts
          </h3>
          <div className="space-y-2">
            {inactiveList.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-clay-sm bg-red-50/50">
                <span className="text-sm font-medium text-heading">{s.name}</span>
                <span className="text-xs text-red-500">
                  {s.lastWatch ? `Last active ${new Date(s.lastWatch).toLocaleDateString()}` : "Never active"}
                </span>
              </div>
            ))}
          </div>
        </ClayCard>
      )}
    </div>
  );
}
