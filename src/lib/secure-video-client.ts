export type SecureVideoVariant = "default" | "hindi";
export type SecurePlaybackSession = {
  delivery: "mp4" | "hls";
  url: string;
};

export async function fetchSecureVideoUrl(videoId: string, variant: SecureVideoVariant) {
  const playback = await fetchSecurePlaybackSession(videoId, variant, "mp4");
  return playback?.url ?? null;
}

export async function fetchSecurePlaybackSession(
  videoId: string,
  variant: SecureVideoVariant,
  delivery: "auto" | "mp4" = "auto"
) {
  const response = await fetch(
    `/api/media/session?videoId=${encodeURIComponent(videoId)}&variant=${encodeURIComponent(variant)}&delivery=${encodeURIComponent(delivery)}`,
    { cache: "no-store" }
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as Partial<SecurePlaybackSession>;
  if (!payload.url || (payload.delivery !== "mp4" && payload.delivery !== "hls")) return null;
  return payload as SecurePlaybackSession;
}
