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

  const nextWatchedPercentage = Math.max(0, Math.min(100, Math.round(watchedPercentage)));
  const nextLastPosition = Math.max(0, Math.round(lastPosition));

  const { data: existing, error: existingError } = await supabase
    .from("video_progress")
    .select("watched_percentage, last_position, completed")
    .eq("user_id", user.id)
    .eq("video_id", videoId)
    .maybeSingle();

  if (existingError) return { error: existingError.message };

  const watchedPercentageToStore = Math.max(existing?.watched_percentage ?? 0, nextWatchedPercentage);
  const lastPositionToStore = Math.max(existing?.last_position ?? 0, nextLastPosition);
  const completed = Boolean(existing?.completed) || watchedPercentageToStore >= 90;

  const { error } = await supabase
    .from("video_progress")
    .upsert(
      {
        user_id: user.id,
        video_id: videoId,
        watched_percentage: watchedPercentageToStore,
        last_position: lastPositionToStore,
        completed,
        last_watched_at: new Date().toISOString(),
      },
      { onConflict: "user_id,video_id" }
    );

  if (error) return { error: error.message };
  return { success: true };
}
