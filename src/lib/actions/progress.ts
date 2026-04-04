"use server";

import { createClient } from "@/lib/supabase/server";

export async function updateVideoProgress(
  videoId: string,
  watchedPercentage: number,
  lastPosition: number
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const completed = watchedPercentage >= 90;

  const { error } = await supabase
    .from("video_progress")
    .upsert(
      {
        user_id: user.id,
        video_id: videoId,
        watched_percentage: Math.round(watchedPercentage),
        last_position: Math.round(lastPosition),
        completed,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,video_id" }
    );

  if (error) return { error: error.message };
  return { success: true };
}
