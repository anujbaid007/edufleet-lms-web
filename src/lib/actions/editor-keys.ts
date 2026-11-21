"use server";

// LFX Editor licence keys (tables lfx_licenses / lfx_activations, read by the lfx-license edge function).
// One key = one PC: the editor activates online and is locked to that PC's machine id.
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface EditorKey {
  key: string;
  customer: string;
  max_pcs: number;
  revoked: boolean;
  note: string | null;
  created_at: string;
  pcs: { machine_name: string | null; machine_id: string; version: string | null; first_seen: string; last_seen: string; released: boolean }[];
}

// the generated Database types don't include the lfx_ tables: an untyped service-role client for them
function db() {
  return createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "platform_admin") return { error: "Forbidden" as const };
  return { ok: true as const };
}

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const s = Array.from(bytes, (x) => ALPHA[x % ALPHA.length]).join("");
  return `LFX-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}
const KEY_RE = /^LFX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export async function listEditorKeys(): Promise<{ keys: EditorKey[] } | { error: string }> {
  const guard = await requirePlatformAdmin();
  if ("error" in guard && guard.error) return { error: guard.error };
  const sb = db();
  const [{ data: lics, error: e1 }, { data: acts, error: e2 }] = await Promise.all([
    sb.from("lfx_licenses").select("*").order("created_at", { ascending: false }),
    sb.from("lfx_activations").select("key, machine_name, machine_id, version, first_seen, last_seen, released").order("last_seen", { ascending: false }),
  ]);
  if (e1 || e2) return { error: (e1 ?? e2)!.message };
  const keys = (lics ?? []).map((l) => ({ ...l, pcs: (acts ?? []).filter((a) => a.key === l.key) })) as EditorKey[];
  return { keys };
}

export async function createEditorKey(formData: FormData): Promise<{ key: string } | { error: string }> {
  const guard = await requirePlatformAdmin();
  if ("error" in guard && guard.error) return { error: guard.error };
  const customer = String(formData.get("customer") ?? "").trim().slice(0, 120);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!customer) return { error: "Enter the customer name." };
  const key = newKey();
  const { error } = await db().from("lfx_licenses").insert({ key, customer, max_pcs: 1, note });
  if (error) return { error: error.message };
  revalidatePath("/admin/editor-keys");
  return { key };
}

export async function setEditorKeyRevoked(key: string, revoked: boolean): Promise<{ ok: true } | { error: string }> {
  const guard = await requirePlatformAdmin();
  if ("error" in guard && guard.error) return { error: guard.error };
  if (!KEY_RE.test(key)) return { error: "Invalid key" };
  const { error } = await db().from("lfx_licenses").update({ revoked }).eq("key", key);
  if (error) return { error: error.message };
  revalidatePath("/admin/editor-keys");
  return { ok: true };
}

/** frees the key's PC so it can be activated on a new one (the old PC stops at its next check-in) */
export async function freeEditorKeyPc(key: string): Promise<{ ok: true } | { error: string }> {
  const guard = await requirePlatformAdmin();
  if ("error" in guard && guard.error) return { error: guard.error };
  if (!KEY_RE.test(key)) return { error: "Invalid key" };
  const { error } = await db().from("lfx_activations").update({ released: true }).eq("key", key).eq("released", false);
  if (error) return { error: error.message };
  revalidatePath("/admin/editor-keys");
  return { ok: true };
}
