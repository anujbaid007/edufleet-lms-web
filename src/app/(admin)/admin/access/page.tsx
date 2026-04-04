import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { AccessManager } from "@/components/admin/access-manager";
import { Shield } from "lucide-react";
import { ClayCard } from "@/components/ui/clay-card";

export const metadata = { title: "Content Access" };

export default async function AccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Get organizations (platform admin sees all, org admin sees their own)
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  // Get all chapters with subject names
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, title, chapter_no, class, subjects(name)")
    .order("class")
    .order("chapter_no");

  const chapterList = (chapters ?? []).map((ch) => ({
    id: ch.id,
    title: ch.title,
    chapter_no: ch.chapter_no,
    class: ch.class,
    subjectName: (ch.subjects as unknown as { name: string } | null)?.name ?? "",
  }));

  // Get all restrictions
  const { data: restrictions } = await supabase
    .from("content_restrictions")
    .select("id, org_id, chapter_id");

  // Build restrictions per org
  const orgRestrictions = (orgs ?? []).map((org) => {
    const orgR = (restrictions ?? [])
      .filter((r) => r.org_id === org.id)
      .map((r) => {
        const ch = chapterList.find((c) => c.id === r.chapter_id);
        return {
          id: r.id,
          chapter_id: r.chapter_id,
          chapterTitle: ch?.title ?? "Unknown",
          chapterNo: ch?.chapter_no ?? 0,
          subjectName: ch?.subjectName ?? "",
          className: ch?.class ?? 0,
        };
      });

    return { org, restrictions: orgR };
  });

  return (
    <div className="space-y-6">
      <Header
        title="Content Access"
        subtitle="Restrict chapters per organization. Blocked chapters won't appear for that org's users."
      />

      {orgRestrictions.length > 0 ? (
        <div className="space-y-4">
          {orgRestrictions.map(({ org, restrictions: orgR }) => (
            <AccessManager
              key={org.id}
              orgId={org.id}
              orgName={org.name}
              restrictions={orgR}
              availableChapters={chapterList}
            />
          ))}
        </div>
      ) : (
        <ClayCard hover={false} className="text-center !py-12">
          <Shield className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">No organizations found.</p>
        </ClayCard>
      )}
    </div>
  );
}
