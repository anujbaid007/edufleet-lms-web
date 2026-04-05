import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/dashboard/header";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { UserTree } from "@/components/admin/user-tree";

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
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  const [
    { data: allUsers },
    { data: orgs },
    { data: centres },
    { data: teacherProfiles },
  ] = await Promise.all([
    supabase.from("profiles").select("id, name, role, org_id, centre_id, class, board, medium, is_active, teacher_id, phone, created_at").order("name"),
    supabase.from("organizations").select("id, name").eq("is_active", true).order("name"),
    supabase.from("centres").select("id, name, org_id").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, name, centre_id").eq("role", "teacher").eq("is_active", true).order("name"),
  ]);

  // Fetch auth users to get emails
  const adminClient = createAdminClient();
  const { data: authListData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = new Map<string, string>();
  for (const u of authListData?.users ?? []) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  // Build hierarchy
  const orgList = orgs ?? [];
  const centreList = centres ?? [];
  const users = (allUsers ?? []).map((u) => ({ ...u, email: emailMap.get(u.id) ?? "" }));

  // Org admins (shown at org level regardless of centre)
  const orgAdmins = (orgId: string) =>
    users.filter((u) => u.org_id === orgId && u.role === "org_admin");

  // Users per centre
  const centreUsers = (centreId: string) =>
    users.filter((u) => u.centre_id === centreId && u.role !== "org_admin");

  // Centres per org
  const orgCentres = (orgId: string) =>
    centreList.filter((c) => c.org_id === orgId);

  // Users without an org (platform admins, unlinked)
  const unlinkedUsers = users.filter((u) => !u.org_id);

  const tree = orgList.map((org) => ({
    org,
    orgAdmins: orgAdmins(org.id),
    centres: orgCentres(org.id).map((centre) => ({
      centre,
      users: centreUsers(centre.id),
    })),
  }));

  return (
    <div className="space-y-6">
      <Header title="Users" subtitle={`${users.length} users`} />

      {profile.role === "platform_admin" ? (
        <CreateUserForm
          organizations={orgList}
          centres={centreList}
          teachers={teacherProfiles ?? []}
          currentUserRole={profile.role}
          currentUserOrgId={profile.org_id}
          currentUserCentreId={profile.centre_id}
        />
      ) : null}

      <UserTree
        tree={tree}
        unlinkedUsers={unlinkedUsers}
        roleBadgeColors={roleBadgeColors}
        organizations={orgList}
        centres={centreList}
        teachers={teacherProfiles ?? []}
      />
    </div>
  );
}
