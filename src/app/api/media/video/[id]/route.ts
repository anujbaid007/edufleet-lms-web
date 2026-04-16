import { GetObjectCommand, HeadObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getBucketName,
  getS3,
  normalizeVideoVariant,
  verifyMediaToken,
} from "@/lib/secure-media";

function buildResponseHeaders(headers: {
  contentLength?: number;
  contentRange?: string;
  contentType?: string;
  eTag?: string;
  lastModified?: Date;
}) {
  const responseHeaders = new Headers();
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  responseHeaders.set("Cross-Origin-Resource-Policy", "same-site");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  if (headers.contentType) responseHeaders.set("Content-Type", headers.contentType);
  if (headers.contentLength !== undefined) responseHeaders.set("Content-Length", String(headers.contentLength));
  if (headers.contentRange) responseHeaders.set("Content-Range", headers.contentRange);
  if (headers.eTag) responseHeaders.set("ETag", headers.eTag);
  if (headers.lastModified) responseHeaders.set("Last-Modified", headers.lastModified.toUTCString());

  return responseHeaders;
}

async function verifyPlaybackRequest(req: NextRequest, id: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return { error: NextResponse.json({ error: "Missing token" }, { status: 400 }) };

  const variant = normalizeVideoVariant(req.nextUrl.searchParams.get("variant"));
  const verified = verifyMediaToken(token, {
    delivery: "mp4",
    userAgent: req.headers.get("user-agent"),
    userId: session.user.id,
    variant,
    videoId: id,
  });

  if (!verified) return { error: NextResponse.json({ error: "Invalid session" }, { status: 403 }) };
  return { key: verified.path };
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const verification = await verifyPlaybackRequest(req, context.params.id);
  if ("error" in verification) return verification.error;

  try {
    const range = req.headers.get("range") ?? undefined;
    const object = await getS3().send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: verification.key,
        Range: range,
      })
    );

    if (!object.Body) {
      return NextResponse.json({ error: "Missing object body" }, { status: 500 });
    }

    return new NextResponse(object.Body.transformToWebStream(), {
      status: object.ContentRange ? 206 : 200,
      headers: buildResponseHeaders({
        contentLength: object.ContentLength,
        contentRange: object.ContentRange,
        contentType: object.ContentType ?? "video/mp4",
        eTag: object.ETag,
        lastModified: object.LastModified,
      }),
    });
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : "Failed to stream video";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function HEAD(req: NextRequest, context: { params: { id: string } }) {
  const verification = await verifyPlaybackRequest(req, context.params.id);
  if ("error" in verification) return verification.error;

  try {
    const object = await getS3().send(
      new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: verification.key,
      })
    );

    return new NextResponse(null, {
      status: 200,
      headers: buildResponseHeaders({
        contentLength: object.ContentLength,
        contentType: object.ContentType ?? "video/mp4",
        eTag: object.ETag,
        lastModified: object.LastModified,
      }),
    });
  } catch (error) {
    if (error instanceof NoSuchKey) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : "Failed to read video";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
