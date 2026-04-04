import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { BulkUploadForm } from "@/components/admin/bulk-upload-form";

export const metadata = { title: "Bulk Upload" };

export default async function BulkUploadPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id")
    .eq("id", session.user.id)
    .single();

  if (!profile) redirect("/login");

  // Only org_admin and centre_admin can bulk upload
  if (profile.role !== "org_admin" && profile.role !== "centre_admin") {
    redirect("/admin");
  }

  return (
    <div className="space-y-6">
      <Header
        title="Bulk Upload"
        subtitle="Upload a CSV file to create multiple users at once"
      />
      <BulkUploadForm
        defaultOrgId={profile.org_id}
        defaultCentreId={profile.centre_id}
      />
    </div>
  );
}
