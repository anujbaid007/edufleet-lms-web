import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ClayCard } from "@/components/ui/clay-card";
import { EditorKeysManager } from "@/components/admin/editor-keys-manager";
import { listEditorKeys } from "@/lib/actions/editor-keys";

export const metadata = { title: "LFX Editor Keys" };
export const dynamic = "force-dynamic";

export default async function EditorKeysPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (!profile || profile.role !== "platform_admin") redirect("/admin");

  const res = await listEditorKeys();
  const keys = "keys" in res ? res.keys : [];
  const active = keys.filter((k) => !k.revoked && k.pcs.some((p) => !p.released)).length;

  return (
    <div className="space-y-6">
      <Header
        title="LFX Editor Keys"
        subtitle={`${keys.length} key${keys.length !== 1 ? "s" : ""} · ${active} active · one key works on one PC`}
      />
      {"error" in res ? (
        <ClayCard hover={false} className="!p-6"><p className="text-sm text-red-500">Couldn&apos;t load keys: {res.error}</p></ClayCard>
      ) : (
        <EditorKeysManager keys={keys} />
      )}
    </div>
  );
}
