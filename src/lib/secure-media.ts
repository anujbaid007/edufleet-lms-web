import "server-only";

import crypto from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";

export const VIDEO_VARIANTS = ["default", "hindi"] as const;
export type VideoVariant = (typeof VIDEO_VARIANTS)[number];
export const MEDIA_DELIVERY_KINDS = ["mp4", "hls"] as const;
export type MediaDeliveryKind = (typeof MEDIA_DELIVERY_KINDS)[number];

type MediaTokenPayload = {
  delivery: MediaDeliveryKind;
  exp: number;
  path: string;
  sub: string;
  ua: string;
  variant: VideoVariant;
  videoId: string;
};

type ViewerProfile = {
  board: string | null;
  class: number | null;
  is_active: boolean;
  medium: string | null;
  org_id: string | null;
  phone: string | null;
  role: string;
};

type VideoLookup = {
  id: string;
  s3_key: string;
  s3_key_hindi: string | null;
  chapters: {
    board: string;
    class: number;
    id: string;
    medium: string;
  } | null;
};

const ADMIN_ROLES = new Set(["platform_admin", "org_admin", "centre_admin"]);
const VIDEO_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

let s3: S3Client | null = null;

function getEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim();
  if (value) return value;
  return fallback;
}

export function getBucketName() {
  const bucketName = getEnv("S3_BUCKET_NAME");
  if (!bucketName) throw new Error("Missing S3 bucket configuration");
  return bucketName;
}

export function getS3() {
  if (!s3) {
    const region = getEnv("AWS_REGION", "ap-south-1");
    const accessKeyId = getEnv("AWS_ACCESS_KEY_ID");
    const secretAccessKey = getEnv("AWS_SECRET_ACCESS_KEY");

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error("Missing AWS S3 configuration");
    }

    s3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3;
}

function getMediaTokenSecret() {
  return (
    getEnv("MEDIA_TOKEN_SECRET") ??
    getEnv("SUPABASE_SERVICE_ROLE_KEY") ??
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ??
    "edufleet-media-secret"
  );
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function normalizeVideoVariant(value: string | null | undefined): VideoVariant {
  return value === "hindi" ? "hindi" : "default";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getMediaTokenSecret()).update(value).digest("base64url");
}

export function buildUserAgentHash(userAgent: string | null | undefined) {
  return crypto
    .createHash("sha256")
    .update(userAgent?.trim() || "unknown")
    .digest("base64url")
    .slice(0, 24);
}

export function createMediaToken(payload: MediaTokenPayload) {
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyMediaToken(
  token: string,
  params: {
    delivery: MediaDeliveryKind;
    userAgent: string | null | undefined;
    userId: string;
    videoId: string;
    variant: VideoVariant;
  }
) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expectedSignature = sign(body);
  const providedSignature = Buffer.from(signature);
  const candidateSignature = Buffer.from(expectedSignature);
  if (providedSignature.length !== candidateSignature.length) return null;
  if (!crypto.timingSafeEqual(providedSignature, candidateSignature)) return null;

  let payload: MediaTokenPayload;
  try {
    payload = JSON.parse(fromBase64Url(body)) as MediaTokenPayload;
  } catch {
    return null;
  }

  if (payload.sub !== params.userId) return null;
  if (payload.delivery !== params.delivery) return null;
  if (payload.videoId !== params.videoId) return null;
  if (payload.variant !== params.variant) return null;
  if (payload.exp <= Date.now()) return null;
  if (payload.ua !== buildUserAgentHash(params.userAgent)) return null;

  return payload;
}

async function getViewerProfile(userId: string): Promise<ViewerProfile | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("board, class, is_active, medium, org_id, phone, role")
    .eq("id", userId)
    .single();

  return profile as ViewerProfile | null;
}

async function getVideoLookup(videoId: string): Promise<VideoLookup | null> {
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("id, s3_key, s3_key_hindi, chapters!inner(id, class, board, medium)")
    .eq("id", videoId)
    .single();

  return video as unknown as VideoLookup | null;
}

async function userCanAccessChapter(userId: string, profile: ViewerProfile, chapterId: string) {
  if (ADMIN_ROLES.has(profile.role)) return true;
  if (!profile.is_active) return false;
  if (!profile.org_id) return true;

  const supabase = await createClient();
  const { data: restriction } = await supabase
    .from("content_restrictions")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("chapter_id", chapterId)
    .maybeSingle();

  void userId;
  return !restriction;
}

export async function resolveVideoPlaybackAccess(params: {
  userId: string;
  variant: VideoVariant;
  videoId: string;
}) {
  const [profile, video] = await Promise.all([
    getViewerProfile(params.userId),
    getVideoLookup(params.videoId),
  ]);

  if (!profile || !video?.chapters) return null;

  if (!ADMIN_ROLES.has(profile.role)) {
    const chapter = video.chapters;
    if (profile.class !== chapter.class) return null;
    if ((profile.board ?? "CBSE") !== chapter.board) return null;
    if ((profile.medium ?? "English") !== chapter.medium) return null;

    const allowed = await userCanAccessChapter(params.userId, profile, chapter.id);
    if (!allowed) return null;
  }

  const key = params.variant === "hindi" ? video.s3_key_hindi ?? null : video.s3_key ?? null;
  if (!key) return null;

  return { key };
}

export function createVideoSession(params: {
  path: string;
  userAgent: string | null | undefined;
  userId: string;
  variant: VideoVariant;
  videoId: string;
}) {
  const expiresAt = Date.now() + VIDEO_SESSION_TTL_MS;
  const token = createMediaToken({
    delivery: "mp4",
    exp: expiresAt,
    path: params.path,
    sub: params.userId,
    ua: buildUserAgentHash(params.userAgent),
    variant: params.variant,
    videoId: params.videoId,
  });

  return {
    delivery: "mp4" as const,
    expiresAt,
    token,
    url: `/api/media/video/${params.videoId}?variant=${params.variant}&token=${encodeURIComponent(token)}`,
  };
}

export function buildHlsPrefix(videoId: string, variant: VideoVariant) {
  return `hls/${videoId}/${variant}`;
}

export function buildHlsManifestKey(videoId: string, variant: VideoVariant) {
  return `${buildHlsPrefix(videoId, variant)}/playlist.m3u8`;
}

export function buildHlsKeyObjectKey(prefix: string) {
  return `${prefix}/enc.key`;
}

export function buildHlsAssetObjectKey(prefix: string, assetPath: string) {
  const normalizedAssetPath = assetPath.replace(/^\/+/, "");
  if (
    !normalizedAssetPath ||
    normalizedAssetPath.includes("..") ||
    normalizedAssetPath.startsWith("http://") ||
    normalizedAssetPath.startsWith("https://")
  ) {
    return null;
  }

  return `${prefix}/${normalizedAssetPath}`;
}

export function createHlsSession(params: {
  prefix: string;
  userAgent: string | null | undefined;
  userId: string;
  variant: VideoVariant;
  videoId: string;
}) {
  const expiresAt = Date.now() + VIDEO_SESSION_TTL_MS;
  const token = createMediaToken({
    delivery: "hls",
    exp: expiresAt,
    path: params.prefix,
    sub: params.userId,
    ua: buildUserAgentHash(params.userAgent),
    variant: params.variant,
    videoId: params.videoId,
  });

  return {
    delivery: "hls" as const,
    expiresAt,
    token,
    url: `/api/media/hls/manifest/${params.videoId}?variant=${params.variant}&token=${encodeURIComponent(token)}`,
  };
}
