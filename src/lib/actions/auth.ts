"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Please enter your ID and password" };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid ID or password. Please try again." };
  }

  // Fetch profile to determine redirect
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication failed" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_demo")
    .eq("id", user.id)
    .single();

  if (!profile) return { error: "Profile not found. Contact your administrator." };

  // Check licence validity (cascades: profile → centre → org)
  if (profile.role !== "platform_admin") {
    const { data: licenceResult } = await supabase.rpc("validate_license", {
      target_user_id: user.id,
    });
    if (licenceResult && !licenceResult.valid) {
      await supabase.auth.signOut({ scope: "local" });
      return {
        error: profile.is_demo
          ? "Demo Licence Validity Expired - contact Admin"
          : "Your licence has expired. Contact your administrator.",
      };
    }
  }

  if (
    profile.role === "platform_admin" ||
    profile.role === "org_admin" ||
    profile.role === "centre_admin"
  ) {
    redirect("/admin");
  } else {
    redirect("/dashboard");
  }
}

export async function logout() {
  const supabase = await createClient();
  // Keep other active device/browser sessions alive for the same admin account.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
