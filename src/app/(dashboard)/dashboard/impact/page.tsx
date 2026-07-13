import { redirect } from "next/navigation";
import { Info } from "lucide-react";
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
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-clay-sm border border-orange-primary/20 bg-orange-50/60 px-4 py-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-orange-primary" />
        <div>
          <p className="text-sm font-semibold text-heading">Admin view — Impact Analytics</p>
          <p className="text-xs text-body">
            This is exactly how your organisation&apos;s admins see analytics: a live view of every
            student&apos;s progress across all your centres and classes.
          </p>
        </div>
      </div>
      <ImpactDashboardClient data={dashboard} userName={profile.name ?? "Demo"} />
    </div>
  );
}
