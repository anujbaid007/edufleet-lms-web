export function buildThumbnailKey(videoKey: string | null) {
  if (!videoKey) return null;

  const normalized = videoKey.replace(/^\/+/, "");
  const extensionIndex = normalized.lastIndexOf(".");
  const basePath = extensionIndex >= 0 ? normalized.slice(0, extensionIndex) : normalized;

  return `thumbnails/${basePath}.jpg`;
}
