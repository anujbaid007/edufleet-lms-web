import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { Shield } from "lucide-react";
import { AccessControl } from "@/components/admin/access-control";

export const metadata = { title: "Content Access" };

export default async function AccessPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  const [{ data: orgs }, { data: chapters }, { data: restrictions }] = await Promise.all([
    supabase.from("organizations").select("id, name").eq("is_active", true).order("name"),
    supabase.from("chapters").select("id, class, medium, subject_id, subjects(name)").order("class").order("chapter_no").limit(5000),
    supabase.from("content_restrictions").select("id, org_id, chapter_id"),
  ]);

  // Build subject groups: unique combos of class + medium + subject
  const subjectGroupMap = new Map<string, {
    key: string;
    className: number;
    medium: string;
    subjectId: string;
    subjectName: string;
    chapterIds: string[];
  }>();

  for (const ch of chapters ?? []) {
    const subName = (ch.subjects as unknown as { name: string } | null)?.name ?? "Unknown";
    const key = `${ch.class}-${ch.medium}-${ch.subject_id}`;
    if (!subjectGroupMap.has(key)) {
      subjectGroupMap.set(key, {
        key,
        className: ch.class,
        medium: ch.medium ?? "Unknown",
        subjectId: ch.subject_id,
        subjectName: subName,
        chapterIds: [],
      });
    }
    subjectGroupMap.get(key)!.chapterIds.push(ch.id);
  }

  const subjectGroups = Array.from(subjectGroupMap.values()).sort((a, b) =>
    a.className - b.className || a.medium.localeCompare(b.medium) || a.subjectName.localeCompare(b.subjectName)
  );

  // Group by class
  const classesList = Array.from(new Set(subjectGroups.map((g) => g.className))).sort((a, b) => a - b);
  const byClass = classesList.map((cls) => ({
    class: cls,
    groups: subjectGroups.filter((g) => g.className === cls),
  }));

  if (!orgs || orgs.length === 0) {
    return (
      <div className="space-y-6">
        <Header title="Content Access" subtitle="Manage content visibility per organization" />
        <ClayCard hover={false} className="text-center !py-12">
          <Shield className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">Create an organization first to manage content access.</p>
        </ClayCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title="Content Access"
        subtitle="Toggle subjects on/off per organization. Blocked subjects won't appear for that org's users."
      />

      <AccessControl
        organizations={orgs}
        byClass={byClass}
        restrictions={restrictions ?? []}
        defaultOrgId={profile.org_id ?? orgs[0]?.id}
      />
    </div>
  );
}
