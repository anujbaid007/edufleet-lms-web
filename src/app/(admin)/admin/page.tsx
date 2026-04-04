import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { Building2, MapPin, Users, BookOpen, Play, CheckCircle2 } from "lucide-react";

export const metadata = { title: "Admin Overview" };

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id, name")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Fetch counts based on role
  const isPlatform = profile.role === "platform_admin";
  const isOrg = profile.role === "org_admin";

  // Organizations count
  const { count: orgCount } = isPlatform
    ? await supabase.from("organizations").select("id", { count: "exact", head: true })
    : { count: isOrg ? 1 : 0 };

  // Centres count
  const { count: centreCount } = await supabase
    .from("centres")
    .select("id", { count: "exact", head: true });

  // Users count
  const { count: userCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  // Role counts
  const { count: studentCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "student")
    .eq("is_active", true);

  const { count: teacherCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "teacher")
    .eq("is_active", true);

  const { count: orgAdminCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "org_admin")
    .eq("is_active", true);

  const { count: centreAdminCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "centre_admin")
    .eq("is_active", true);

  // Content stats
  const { count: subjectCount } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true });

  const { count: chapterCount } = await supabase
    .from("chapters")
    .select("id", { count: "exact", head: true });

  const { count: videoCount } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true });

  // Progress stats
  const { count: completedCount } = await supabase
    .from("video_progress")
    .select("id", { count: "exact", head: true })
    .eq("completed", true);

  const roleLabel = profile.role === "platform_admin"
    ? "Platform"
    : profile.role === "org_admin"
    ? "Organization"
    : "Centre";

  return (
    <div className="space-y-8">
      <Header
        title={`${roleLabel} Overview`}
        subtitle={`Welcome back, ${profile.name}`}
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isPlatform && (
          <ClayCard hover={false} className="!p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-clay-sm clay-surface-orange flex items-center justify-center shadow-clay-orange">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-heading">{orgCount ?? 0}</p>
                <p className="text-xs text-muted">Organizations</p>
              </div>
            </div>
          </ClayCard>
        )}

        <ClayCard hover={false} className="!p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-clay-sm clay-surface flex items-center justify-center shadow-clay-pill">
              <MapPin className="w-6 h-6 text-orange-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{centreCount ?? 0}</p>
              <p className="text-xs text-muted">Centres</p>
            </div>
          </div>
        </ClayCard>

        <ClayCard hover={false} className="!p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-clay-sm clay-surface flex items-center justify-center shadow-clay-pill">
              <Users className="w-6 h-6 text-orange-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{userCount ?? 0}</p>
              <p className="text-xs text-muted">Total Users</p>
            </div>
          </div>
        </ClayCard>

        <ClayCard hover={false} className="!p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-clay-sm clay-surface flex items-center justify-center shadow-clay-pill">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-heading">{completedCount ?? 0}</p>
              <p className="text-xs text-muted">Videos Completed</p>
            </div>
          </div>
        </ClayCard>
      </div>

      {/* Role Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ClayCard hover={false} className="!p-6">
          <h3 className="font-poppins font-bold text-heading mb-4">Users Breakdown</h3>
          <div className="space-y-3">
            {[
              { label: "Org Admins", count: orgAdminCount ?? 0, color: "bg-purple-500", bg: "bg-purple-100" },
              { label: "Centre Admins", count: centreAdminCount ?? 0, color: "bg-emerald-500", bg: "bg-emerald-100" },
              { label: "Teachers", count: teacherCount ?? 0, color: "bg-blue-500", bg: "bg-blue-100" },
              { label: "Students", count: studentCount ?? 0, color: "bg-orange-primary", bg: "bg-orange-primary/10" },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-body">{row.label}</span>
                  <span className="text-sm font-bold text-heading">{row.count}</span>
                </div>
                <div className={`h-2 ${row.bg} rounded-full overflow-hidden mt-1`}>
                  <div
                    className={`h-full ${row.color} rounded-full`}
                    style={{ width: `${userCount ? Math.round((row.count / userCount) * 100) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ClayCard>

        <ClayCard hover={false} className="!p-6">
          <h3 className="font-poppins font-bold text-heading mb-4">Content Library</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <BookOpen className="w-6 h-6 text-orange-primary mx-auto mb-2" />
              <p className="text-xl font-bold text-heading">{subjectCount ?? 0}</p>
              <p className="text-xs text-muted">Subjects</p>
            </div>
            <div>
              <Play className="w-6 h-6 text-orange-primary mx-auto mb-2" />
              <p className="text-xl font-bold text-heading">{chapterCount ?? 0}</p>
              <p className="text-xs text-muted">Chapters</p>
            </div>
            <div>
              <Play className="w-6 h-6 text-orange-primary mx-auto mb-2" />
              <p className="text-xl font-bold text-heading">{videoCount ?? 0}</p>
              <p className="text-xs text-muted">Videos</p>
            </div>
          </div>
        </ClayCard>
      </div>
    </div>
  );
}
