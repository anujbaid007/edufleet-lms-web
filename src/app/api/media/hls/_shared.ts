import { GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildHlsAssetObjectKey,
  buildHlsKeyObjectKey,
  getBucketName,
  getS3,
  normalizeVideoVariant,
  verifyMediaToken,
} from "@/lib/secure-media";

export async function verifyHlsRequest(req: NextRequest, id: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return { error: NextResponse.json({ error: "Missing token" }, { status: 400 }) };

  const variant = normalizeVideoVariant(req.nextUrl.searchParams.get("variant"));
  const verified = verifyMediaToken(token, {
    delivery: "hls",
    userAgent: req.headers.get("user-agent"),
    userId: session.user.id,
    variant,
    videoId: id,
  });

  if (!verified) return { error: NextResponse.json({ error: "Invalid session" }, { status: 403 }) };
  return { prefix: verified.path, token, variant };
}

export async function readTextObject(key: string) {
  const object = await getS3().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );

  if (!object.Body) throw new Error("Missing object body");
  return await object.Body.transformToString();
}

export function buildHlsCacheHeaders(contentType: string) {
  return {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export function resolveSegmentObjectKey(prefix: string, assetPath: string) {
  return buildHlsAssetObjectKey(prefix, assetPath);
}

export function resolveKeyObjectKey(prefix: string) {
  return buildHlsKeyObjectKey(prefix);
}

export function isMissingObjectError(error: unknown) {
  return error instanceof NoSuchKey || (error instanceof Error && error.name === "NoSuchKey");
}
