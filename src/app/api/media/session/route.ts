import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import {
  buildHlsManifestKey,
  createHlsSession,
  createVideoSession,
  getBucketName,
  getS3,
  normalizeVideoVariant,
  resolveVideoPlaybackAccess,
} from "@/lib/secure-media";

async function hasHlsManifest(videoId: string, variant: "default" | "hindi") {
  try {
    await getS3().send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: buildHlsManifestKey(videoId, variant),
      })
    );
    return true;
  } catch (error) {
    if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) {
      return false;
    }
    return false;
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId parameter" }, { status: 400 });
  }

  const variant = normalizeVideoVariant(req.nextUrl.searchParams.get("variant"));
  const delivery = req.nextUrl.searchParams.get("delivery") === "mp4" ? "mp4" : "auto";
  const access = await resolveVideoPlaybackAccess({
    userId: session.user.id,
    variant,
    videoId,
  });

  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wantsHls = delivery === "auto" && (await hasHlsManifest(videoId, variant));
  const playback = wantsHls
    ? createHlsSession({
        prefix: `hls/${videoId}/${variant}`,
        userAgent: req.headers.get("user-agent"),
        userId: session.user.id,
        variant,
        videoId,
      })
    : createVideoSession({
        path: access.key,
        userAgent: req.headers.get("user-agent"),
        userId: session.user.id,
        variant,
        videoId,
      });

  return NextResponse.json(playback, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
