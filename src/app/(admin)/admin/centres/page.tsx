import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { CreateCentreForm } from "@/components/admin/create-centre-form";
import { EditCentreRow } from "@/components/admin/edit-centre-row";
import { Building2, MapPin } from "lucide-react";

export const metadata = { title: "Centres" };

export default async function CentresPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  const canCreate = profile.role === "platform_admin" || profile.role === "org_admin";

  const [{ data: orgs }, { data: centres }, { data: users }] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("is_active", true).order("name"),
    supabase.from("centres").select("id, name, location, is_active, org_id, organizations(name)").order("name"),
    supabase.from("profiles").select("id, centre_id").eq("is_active", true),
  ]);

  const userCountByCentre = new Map<string, number>();
  for (const user of users ?? []) {
    if (!user.centre_id) continue;
    userCountByCentre.set(user.centre_id, (userCountByCentre.get(user.centre_id) ?? 0) + 1);
  }

  const centreStats = (centres ?? []).map((centre) => ({
    ...centre,
    orgName: (centre.organizations as unknown as { name: string } | null)?.name ?? "—",
    userCount: userCountByCentre.get(centre.id) ?? 0,
  }));

  const centresByOrg = new Map<
    string,
    Array<(typeof centreStats)[number]>
  >();

  for (const centre of centreStats) {
    const grouped = centresByOrg.get(centre.org_id) ?? [];
    grouped.push(centre);
    centresByOrg.set(centre.org_id, grouped);
  }

  return (
    <div className="space-y-6">
      <Header title="Centres" subtitle={`${centres?.length ?? 0} centres`} />

      {canCreate && (
        <CreateCentreForm
          organizations={orgs ?? []}
          defaultOrgId={profile.org_id ?? undefined}
        />
      )}

      {(orgs?.length ?? 0) > 0 ? (
        <div className="space-y-4">
          {(orgs ?? []).map((org) => {
            const orgCentres = centresByOrg.get(org.id) ?? [];

            return (
              <ClayCard key={org.id} hover={false} className="!p-4">
                <div className="flex items-center gap-3 px-2 py-1.5">
                  <Building2 className="w-5 h-5 text-orange-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-heading">{org.name}</p>
                    <p className="text-xs text-muted">
                      {orgCentres.length} centre{orgCentres.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 ml-6 border-l-2 border-orange-primary/10 space-y-3 pl-4">
                  {orgCentres.length > 0 ? (
                    orgCentres.map((centre) => (
                      <div
                        key={centre.id}
                        className="rounded-clay border border-orange-primary/10 bg-cream/60 px-4 py-4"
                      >
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
                              {centre.location || "No location"} · {centre.userCount} users
                            </p>
                          </div>
                          {canCreate && (
                            <EditCentreRow
                              centre={{ id: centre.id, name: centre.name, location: centre.location, is_active: centre.is_active }}
                            />
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted px-1 py-2">No centres in this organization yet.</p>
                  )}
                </div>
              </ClayCard>
            );
          })}
        </div>
      ) : (
        <ClayCard hover={false} className="text-center !py-12">
          <MapPin className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">No centres yet.</p>
        </ClayCard>
      )}
    </div>
  );
}
