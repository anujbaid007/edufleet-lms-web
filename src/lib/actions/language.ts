"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Lang } from "@/lib/i18n";

export async function updateLanguage(lang: Lang): Promise<void> {
  const cookieStore = cookies();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  await supabase
    .from("profiles")
    .update({ ui_language: lang })
    .eq("id", session.user.id);

  cookieStore.set("ui_language", lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
