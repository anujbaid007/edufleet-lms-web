import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDemoClassOptions } from "@/lib/actions/demo";
import { CreateDemoForm } from "@/components/admin/create-demo-form";
import { DemoUsersTable, type DemoUserRow } from "@/components/admin/demo-users-table";

export const metadata = { title: "Demo Links" };
export const dynamic = "force-dynamic";

export default async function AdminDemoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "platform_admin") redirect("/admin");

  const admin = createAdminClient();
  const [{ data: demoProfiles }, classOptions] = await Promise.all([
    admin
      .from("profiles")
      .select("id, phone, is_active, created_at, license_valid_until, org_id, organizations(name)")
      .eq("is_demo", true)
      .order("created_at", { ascending: false }),
    getDemoClassOptions(),
  ]);

  // Emails live in auth.users — fetch per demo profile (bounded by demo count).
  const emailEntries = await Promise.all(
    (demoProfiles ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return [p.id, data.user?.email ?? null] as const;
    })
  );
  const emailById = new Map<string, string | null>(emailEntries);

  const rows: DemoUserRow[] = (demoProfiles ?? []).map((p) => ({
    id: p.id,
    clientName: (p.organizations as unknown as { name: string } | null)?.name ?? "—",
    email: emailById.get(p.id) ?? null,
    phone: p.phone,
    isActive: p.is_active,
    createdAt: p.created_at,
    licenseValidUntil: p.license_valid_until,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-poppins text-2xl font-bold text-heading">Demo Links</h1>
        <p className="text-sm text-muted">Create and manage demo logins for prospective clients.</p>
      </div>
      <CreateDemoForm classOptions={classOptions} />
      <DemoUsersTable rows={rows} />
    </div>
  );
}
