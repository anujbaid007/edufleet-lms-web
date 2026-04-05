"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_AVATAR_IDS } from "@/components/dashboard/profile-avatar";

export async function updateOwnAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const avatarId = (formData.get("avatarId") as string) || "";
  if (!PROFILE_AVATAR_IDS.includes(avatarId)) {
    return { error: "Please choose one of the available avatars." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: avatarId,
    })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/subjects");
  revalidatePath("/dashboard/progress");

  return { success: true, avatarUrl: avatarId };
}
