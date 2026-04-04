import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { CreateCentreForm } from "@/components/admin/create-centre-form";
import { MapPin } from "lucide-react";

export const metadata = { title: "Centres" };

export default async function CentresPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const canCreate = profile.role === "platform_admin" || profile.role === "org_admin";

  // Orgs for the form dropdown
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // Centres with org name
  const { data: centres } = await supabase
    .from("centres")
    .select("id, name, location, is_active, org_id, organizations(name)")
    .order("name");

  // Count users per centre
  const { data: users } = await supabase
    .from("profiles")
    .select("id, centre_id")
    .eq("is_active", true);

  const centreStats = (centres ?? []).map((c) => ({
    ...c,
    orgName: (c.organizations as unknown as { name: string } | null)?.name ?? "—",
    userCount: users?.filter((u) => u.centre_id === c.id).length ?? 0,
  }));

  return (
    <div className="space-y-6">
      <Header title="Centres" subtitle={`${centres?.length ?? 0} centres`} />

      {canCreate && (
        <CreateCentreForm
          organizations={orgs ?? []}
          defaultOrgId={profile.org_id ?? undefined}
        />
      )}

      <div className="space-y-3">
        {centreStats.map((centre) => (
          <ClayCard key={centre.id} hover={false} className="!p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-clay-sm clay-surface flex items-center justify-center shadow-clay-pill">
                <MapPin className="w-5 h-5 text-orange-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-heading">{centre.name}</p>
                  {!centre.is_active && (
                    <span className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full font-medium">Inactive</span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {centre.orgName} · {centre.location || "No location"} · {centre.userCount} users
                </p>
              </div>
            </div>
          </ClayCard>
        ))}

        {(centres?.length ?? 0) === 0 && (
          <ClayCard hover={false} className="text-center !py-12">
            <MapPin className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted">No centres yet.</p>
          </ClayCard>
        )}
      </div>
    </div>
  );
}
