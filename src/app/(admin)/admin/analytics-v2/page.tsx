import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadImpactDashboard } from "@/lib/analytics-v2/server";
import { ImpactDashboardClient } from "./client";

export const metadata = { title: "Impact Analytics" };

export default async function ImpactAnalyticsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  const isAdmin = ["platform_admin", "org_admin", "centre_admin"].includes(profile.role);
  if (!isAdmin) redirect("/dashboard");

  const dashboard = await loadImpactDashboard({
    orgId: profile.role === "org_admin" ? profile.org_id ?? undefined : undefined,
    centreId: profile.role === "centre_admin" ? profile.centre_id ?? undefined : undefined,
  });

  return <ImpactDashboardClient data={dashboard} />;
}
