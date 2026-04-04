import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (
      profile?.role === "platform_admin" ||
      profile?.role === "org_admin" ||
      profile?.role === "centre_admin"
    ) {
      redirect("/admin");
    }
    redirect("/dashboard");
  }

  redirect("/login");
}
