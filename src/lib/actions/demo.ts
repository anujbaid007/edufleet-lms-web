"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const DEMO_BOARD = "CBSE";
const DEMO_MEDIUM = "English";
const DEMO_NAME = "Student Demo";

function generateDemoPassword(): string {
  // Readable 10-char password, no ambiguous chars.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function addMonthsISODate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Distinct classes (0-12) that have chapters for the demo board/medium, ascending. */
export async function getDemoClassOptions(): Promise<number[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("chapters")
    .select("class")
    .eq("board", DEMO_BOARD)
    .eq("medium", DEMO_MEDIUM);
  const set = new Set<number>();
  for (const row of data ?? []) {
    if (typeof row.class === "number") set.add(row.class);
  }
  return Array.from(set).sort((a, b) => a - b);
}

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "platform_admin") return { error: "Forbidden" as const };
  return { ok: true as const };
}

export async function createDemoUser(formData: FormData) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };

  const clientName = ((formData.get("client_name") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim() || null;
  const licenseMonths = Number(formData.get("license_months")) === 2 ? 2 : 1;
  const classNum = Number(formData.get("class"));

  if (!clientName || !email) return { error: "Client name and email are required" };
  if (!Number.isInteger(classNum) || classNum < 0 || classNum > 12) {
    return { error: "Select a valid class" };
  }

  const admin = createAdminClient();

  // 1. Org named after the client.
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: clientName, type: "ngo", is_demo: true })
    .select("id")
    .single();
  if (orgError || !org) return { error: orgError?.message ?? "Failed to create demo org" };

  // 2. Default centre.
  const { data: centre, error: centreError } = await admin
    .from("centres")
    .insert({ name: "Centre A", org_id: org.id, is_demo: true })
    .select("id")
    .single();
  if (centreError || !centre) {
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: centreError?.message ?? "Failed to create demo centre" };
  }

  // 3. Auth user.
  const password = generateDemoPassword();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    await admin.from("organizations").delete().eq("id", org.id); // cascade removes centre
    return { error: authError?.message ?? "Failed to create demo login" };
  }

  // 4. Profile.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      name: DEMO_NAME,
      role: "student",
      is_demo: true,
      org_id: org.id,
      centre_id: centre.id,
      class: classNum,
      board: DEMO_BOARD,
      medium: DEMO_MEDIUM,
      phone,
      license_valid_until: addMonthsISODate(licenseMonths),
    })
    .eq("id", authData.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id);
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: profileError.message };
  }

  revalidatePath("/admin/demo");
  return { success: true as const, email, password };
}

export async function setDemoLicense(userId: string, months: 1 | 2) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ license_valid_until: addMonthsISODate(months) })
    .eq("id", userId)
    .eq("is_demo", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/demo");
  return { success: true as const };
}

export async function deactivateDemoUser(userId: string, isActive: boolean) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId)
    .eq("is_demo", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/demo");
  return { success: true as const };
}

export async function deleteDemoUser(userId: string) {
  const guard = await requirePlatformAdmin();
  if ("error" in guard) return { error: guard.error };
  const admin = createAdminClient();

  // Look up the demo user's org to remove the whole demo bundle.
  const { data: profile } = await admin
    .from("profiles")
    .select("org_id, is_demo")
    .eq("id", userId)
    .single();
  if (!profile?.is_demo) return { error: "Not a demo user" };

  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
  if (profile.org_id) {
    // Cascade removes the demo centre.
    await admin.from("organizations").delete().eq("id", profile.org_id).eq("is_demo", true);
  }
  revalidatePath("/admin/demo");
  return { success: true as const };
}

/** Demo-only: change which class the demo learner is currently exploring. */
export async function setDemoClass(classNum: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_demo, board, medium")
    .eq("id", user.id)
    .single();
  if (!profile?.is_demo) return { error: "Forbidden" };

  const options = await getDemoClassOptions();
  if (!options.includes(classNum)) return { error: "No content for that class" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ class: classNum })
    .eq("id", user.id)
    .eq("is_demo", true);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { success: true as const };
}
