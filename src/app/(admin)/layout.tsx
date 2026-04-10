import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

const ADMIN_ROLES = ["platform_admin", "org_admin", "centre_admin"];

export default async function AdminLayout({
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
    .select("role, name")
    .eq("id", user.id)
    .single();

  if (!profile || !ADMIN_ROLES.includes(profile.role)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <AdminSidebar userRole={profile.role} userName={profile.name} />
      <main className="px-4 pb-28 pt-20 transition-all duration-300 sm:px-6 sm:pb-32 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
