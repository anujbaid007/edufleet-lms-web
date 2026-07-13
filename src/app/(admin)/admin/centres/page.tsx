import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { CreateCentreForm } from "@/components/admin/create-centre-form";
import { EditCentreRow } from "@/components/admin/edit-centre-row";
import { Building2, MapPin, Wifi, WifiOff } from "lucide-react";

export const metadata = { title: "Centres" };

function LicenceBadge({ date }: { date: string | null }) {
  if (!date) return null;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <span className="px-2 py-0.5 text-[11px] bg-red-100 text-red-600 rounded-full font-medium">Expired</span>;
  if (days <= 30) return <span className="px-2 py-0.5 text-[11px] bg-amber-100 text-amber-700 rounded-full font-medium">Expires {date}</span>;
  return <span className="px-2 py-0.5 text-[11px] bg-emerald-100 text-emerald-700 rounded-full font-medium">Until {date}</span>;
}

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
    supabase.from("centres").select("id, name, location, is_active, org_id, mode, offline_student_counts, license_valid_until, organizations(name, license_valid_until)").eq("is_demo", false).order("name"),
    supabase.from("profiles").select("id, centre_id").eq("is_active", true),
  ]);

  const userCountByCentre = new Map<string, number>();
  for (const user of users ?? []) {
    if (!user.centre_id) continue;
    userCountByCentre.set(user.centre_id, (userCountByCentre.get(user.centre_id) ?? 0) + 1);
  }

  const centreStats = (centres ?? []).map((centre) => {
    const org = centre.organizations as unknown as { name: string; license_valid_until: string | null } | null;
    return {
      ...centre,
      orgName: org?.name ?? "—",
      effectiveLicence: centre.license_valid_until ?? org?.license_valid_until ?? null,
      userCount: userCountByCentre.get(centre.id) ?? 0,
    };
  });

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
                              {centre.mode === "offline" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-amber-100 text-amber-700 rounded-full font-semibold">
                                  <WifiOff className="w-3 h-3" /> Offline
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-green-100 text-green-700 rounded-full font-semibold">
                                  <Wifi className="w-3 h-3" /> Online
                                </span>
                              )}
                              {!centre.is_active && (
                                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full font-medium">Inactive</span>
                              )}
                              <LicenceBadge date={centre.effectiveLicence} />
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              {centre.location || "No location"}
                              {centre.mode === "offline"
                                ? (() => {
                                    const counts = centre.offline_student_counts as Record<string, number> | null;
                                    const total = counts ? Object.values(counts).reduce((sum: number, c: number) => sum + c, 0) : 0;
                                    return total > 0 ? ` · ${total} offline students` : "";
                                  })()
                                : ` · ${centre.userCount} users`}
                            </p>
                          </div>
                          {canCreate && (
                            <EditCentreRow
                              centre={{
                                id: centre.id,
                                name: centre.name,
                                location: centre.location,
                                is_active: centre.is_active,
                                mode: centre.mode,
                                offline_student_counts: centre.offline_student_counts as Record<string, number> | null,
                              }}
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
