import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { CreateOrgForm } from "@/components/admin/create-org-form";
import { EditOrgRow } from "@/components/admin/edit-org-row";
import { Building2 } from "lucide-react";

export const metadata = { title: "Organizations" };

function LicenceBadge({ date }: { date: string | null }) {
  if (!date) return <span className="px-2 py-0.5 text-[11px] bg-slate-100 text-slate-500 rounded-full font-medium">No expiry</span>;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return <span className="px-2 py-0.5 text-[11px] bg-red-100 text-red-600 rounded-full font-medium">Expired</span>;
  if (days <= 30) return <span className="px-2 py-0.5 text-[11px] bg-amber-100 text-amber-700 rounded-full font-medium">Expires {date}</span>;
  return <span className="px-2 py-0.5 text-[11px] bg-emerald-100 text-emerald-700 rounded-full font-medium">Until {date}</span>;
}

export default async function OrgsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  const isPlatform = profile?.role === "platform_admin";

  const [{ data: orgs }, { data: centres }, { data: users }] = await Promise.all([
    supabase.from("organizations").select("id, name, type, is_active, created_at, license_valid_until").order("name"),
    supabase.from("centres").select("id, org_id"),
    supabase.from("profiles").select("id, org_id").eq("is_active", true),
  ]);

  const orgStats = (orgs ?? []).map((org) => ({
    ...org,
    centreCount: centres?.filter((c) => c.org_id === org.id).length ?? 0,
    userCount: users?.filter((u) => u.org_id === org.id).length ?? 0,
  }));

  return (
    <div className="space-y-6">
      <Header title="Organizations" subtitle={`${orgs?.length ?? 0} organizations`} />

      {isPlatform && <CreateOrgForm />}

      <div className="space-y-3">
        {orgStats.map((org) => (
          <ClayCard key={org.id} hover={false} className="!p-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-clay-sm clay-surface flex items-center justify-center shadow-clay-pill">
                <Building2 className="w-5 h-5 text-orange-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-heading">{org.name}</p>
                  <span className="clay-pill !px-2 !py-0.5 !text-xs uppercase">{org.type}</span>
                  {!org.is_active && (
                    <span className="px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full font-medium">Inactive</span>
                  )}
                  <LicenceBadge date={org.license_valid_until} />
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {org.centreCount} centres · {org.userCount} users
                </p>
              </div>
              {isPlatform && <EditOrgRow org={org} />}
            </div>
          </ClayCard>
        ))}

        {(orgs?.length ?? 0) === 0 && (
          <ClayCard hover={false} className="text-center !py-12">
            <Building2 className="w-10 h-10 text-muted mx-auto mb-3" />
            <p className="text-muted">No organizations yet.</p>
          </ClayCard>
        )}
      </div>
    </div>
  );
}
