import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { ProfileDrawer } from "@/components/dashboard/profile-drawer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/login");
  const user = session.user;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, name, org_id, centre_id, class, board, medium, phone, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const [orgResult, centreResult] = await Promise.all([
    profile.org_id
      ? supabase.from("organizations").select("name").eq("id", profile.org_id).single()
      : Promise.resolve({ data: null }),
    profile.centre_id
      ? supabase.from("centres").select("name").eq("id", profile.centre_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="min-h-screen">
      <Sidebar userRole={profile.role} userName={profile.name} />
      <main className="ml-64 p-8 transition-all duration-300">
        <div className="mb-4 flex justify-end">
          <ProfileDrawer
            userId={user.id}
            name={profile.name}
            email={user.email ?? null}
            role={profile.role}
            classNum={profile.class}
            board={profile.board}
            medium={profile.medium}
            phone={profile.phone}
            avatarUrl={profile.avatar_url}
            organizationName={orgResult.data?.name ?? null}
            centreName={centreResult.data?.name ?? null}
          />
        </div>
        {children}
      </main>
    </div>
  );
}
