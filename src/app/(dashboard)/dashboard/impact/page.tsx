import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadImpactDashboard } from "@/lib/analytics-v2/server";
import { ImpactDashboardClient } from "@/app/(admin)/admin/analytics-v2/client";

export const metadata = { title: "Impact Analytics" };
export const dynamic = "force-dynamic";

export default async function DemoImpactPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_demo, org_id, name")
    .eq("id", user.id)
    .single();

  if (!profile?.is_demo) redirect("/dashboard");
  if (!profile.org_id) {
    return <div className="p-6 text-sm text-muted">No demo organization is linked to this account.</div>;
  }

  const dashboard = await loadImpactDashboard({ orgId: profile.org_id, includeDemo: true });
  return <ImpactDashboardClient data={dashboard} userName={profile.name ?? "Demo"} />;
}
