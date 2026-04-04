import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { EditUserRow } from "@/components/admin/edit-user-row";
import { User, Users } from "lucide-react";

export const metadata = { title: "Users" };

const roleBadgeColors: Record<string, string> = {
  platform_admin: "bg-purple-100 text-purple-700",
  org_admin: "bg-blue-100 text-blue-700",
  centre_admin: "bg-green-100 text-green-700",
  teacher: "bg-orange-100 text-orange-700",
  student: "bg-gray-100 text-gray-600",
};

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Fetch users (RLS will scope automatically)
  const { data: allUsers } = await supabase
    .from("profiles")
    .select("id, name, role, org_id, centre_id, class, board, medium, is_active, teacher_id, created_at")
    .order("created_at", { ascending: false });

  // Fetch orgs, centres, teachers for the create form
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const { data: centres } = await supabase
    .from("centres")
    .select("id, name, org_id")
    .eq("is_active", true)
    .order("name");

  const { data: teacherProfiles } = await supabase
    .from("profiles")
    .select("id, name, centre_id")
    .eq("role", "teacher")
    .eq("is_active", true)
    .order("name");

  // Org name lookup
  const orgMap = new Map(orgs?.map((o) => [o.id, o.name]) ?? []);
  const centreMap = new Map(centres?.map((c) => [c.id, c.name]) ?? []);

  return (
    <div className="space-y-6">
      <Header title="Users" subtitle={`${allUsers?.length ?? 0} users`} />

      <CreateUserForm
        organizations={orgs ?? []}
        centres={centres ?? []}
        teachers={teacherProfiles ?? []}
        currentUserRole={profile.role}
        currentUserOrgId={profile.org_id}
        currentUserCentreId={profile.centre_id}
      />

      <div className="space-y-2">
        {(allUsers ?? []).map((u) => (
          <ClayCard key={u.id} hover={false} className="!p-4">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-full clay-surface shadow-clay-pill flex items-center justify-center">
                <User className="w-4 h-4 text-orange-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-heading">{u.name}</p>
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${roleBadgeColors[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                    {u.role.replace("_", " ")}
                  </span>
                  {!u.is_active && (
                    <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-600 rounded-full font-medium">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {u.org_id ? orgMap.get(u.org_id) ?? "" : ""}
                  {u.centre_id ? ` · ${centreMap.get(u.centre_id) ?? ""}` : ""}
                  {u.class !== null ? ` · Class ${u.class === 0 ? "KG" : u.class}` : ""}
                  {u.board ? ` · ${u.board}` : ""}
                  {u.medium ? ` · ${u.medium}` : ""}
                </p>
              </div>
              <EditUserRow
                user={u}
                organizations={orgs ?? []}
                centres={centres ?? []}
                teachers={teacherProfiles ?? []}
              />
            </div>
          </ClayCard>
        ))}

        {(allUsers?.length ?? 0) === 0 && (
          <ClayCard hover={false} className="text-center !py-12">
            <Users className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted">No users yet.</p>
          </ClayCard>
        )}
      </div>
    </div>
  );
}
