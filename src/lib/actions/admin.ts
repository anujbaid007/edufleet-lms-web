"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { revalidatePath } from "next/cache";

type UserRole = Database["public"]["Enums"]["user_role"];

// ─── Organizations ───

export async function createOrganization(formData: FormData) {
  const supabase = await createClient();
  const name = formData.get("name") as string;
  const type = formData.get("type") as "csr" | "ngo";

  if (!name || !type) return { error: "Name and type are required" };

  const { error } = await supabase
    .from("organizations")
    .insert({ name, type });

  if (error) return { error: error.message };
  revalidatePath("/admin/orgs");
  return { success: true };
}

export async function updateOrganization(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = formData.get("name") as string;
  const type = formData.get("type") as "csr" | "ngo";
  const isActive = formData.get("is_active") === "true";

  const { error } = await supabase
    .from("organizations")
    .update({ name, type, is_active: isActive })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/orgs");
  return { success: true };
}

// ─── Centres ───

export async function createCentre(formData: FormData) {
  const supabase = await createClient();
  const name = formData.get("name") as string;
  const orgId = formData.get("org_id") as string;
  const location = (formData.get("location") as string) || null;

  if (!name || !orgId) return { error: "Name and organization are required" };

  const { error } = await supabase
    .from("centres")
    .insert({ name, org_id: orgId, location });

  if (error) return { error: error.message };
  revalidatePath("/admin/centres");
  return { success: true };
}

export async function updateCentre(id: string, formData: FormData) {
  const supabase = await createClient();
  const name = formData.get("name") as string;
  const location = (formData.get("location") as string) || null;
  const isActive = formData.get("is_active") === "true";

  const { error } = await supabase
    .from("centres")
    .update({ name, location, is_active: isActive })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/centres");
  return { success: true };
}

// ─── Users ───

export async function createUser(formData: FormData) {
  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;
  const role = formData.get("role") as UserRole;
  const orgId = (formData.get("org_id") as string) || null;
  const centreId = (formData.get("centre_id") as string) || null;
  const teacherId = (formData.get("teacher_id") as string) || null;
  const classNum = formData.get("class") ? Number(formData.get("class")) : null;
  const board = (formData.get("board") as string) || null;
  const medium = (formData.get("medium") as string) || null;

  if (!email || !password || !name || !role) {
    return { error: "Email, password, name, and role are required" };
  }

  // Create auth user via admin API
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) return { error: authError.message };
  if (!authData.user) return { error: "Failed to create user" };

  // Update the auto-created profile with role and org details
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      name,
      role,
      org_id: orgId,
      centre_id: centreId,
      teacher_id: teacherId,
      class: classNum,
      board,
      medium,
    })
    .eq("id", authData.user.id);

  if (profileError) return { error: profileError.message };

  revalidatePath("/admin/users");
  return { success: true, userId: authData.user.id };
}

export async function updateUser(id: string, formData: FormData) {
  const admin = createAdminClient();
  const name = formData.get("name") as string;
  const role = formData.get("role") as UserRole;
  const orgId = (formData.get("org_id") as string) || null;
  const centreId = (formData.get("centre_id") as string) || null;
  const teacherId = (formData.get("teacher_id") as string) || null;
  const classNum = formData.get("class") ? Number(formData.get("class")) : null;
  const board = (formData.get("board") as string) || null;
  const medium = (formData.get("medium") as string) || null;
  const isActive = formData.get("is_active") === "true";

  const { error } = await admin
    .from("profiles")
    .update({
      name,
      role,
      org_id: orgId,
      centre_id: centreId,
      teacher_id: teacherId,
      class: classNum,
      board,
      medium,
      is_active: isActive,
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deactivateUser(id: string) {
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Bulk Upload ───

export async function bulkCreateUsers(
  users: Array<{
    email: string;
    password: string;
    name: string;
    role: UserRole;
    org_id: string | null;
    centre_id: string | null;
    teacher_id: string | null;
    class: number | null;
    board: string | null;
    medium: string | null;
  }>
) {
  const admin = createAdminClient();
  const results: Array<{ email: string; success: boolean; error?: string }> = [];

  for (const user of users) {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      results.push({ email: user.email, success: false, error: authError?.message || "Failed" });
      continue;
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        name: user.name,
        role: user.role,
        org_id: user.org_id,
        centre_id: user.centre_id,
        teacher_id: user.teacher_id,
        class: user.class,
        board: user.board,
        medium: user.medium,
      })
      .eq("id", authData.user.id);

    if (profileError) {
      results.push({ email: user.email, success: false, error: profileError.message });
    } else {
      results.push({ email: user.email, success: true });
    }
  }

  revalidatePath("/admin/users");
  return { results };
}

// ─── Content Access ───

export async function addRestriction(orgId: string, chapterId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("content_restrictions")
    .insert({ org_id: orgId, chapter_id: chapterId });

  if (error) return { error: error.message };
  revalidatePath("/admin/access");
  return { success: true };
}

export async function removeRestriction(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("content_restrictions")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/access");
  return { success: true };
}
