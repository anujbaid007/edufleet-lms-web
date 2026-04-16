import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { getBucketName, getS3 } from "@/lib/secure-media";
import {
  buildHlsCacheHeaders,
  isMissingObjectError,
  resolveSegmentObjectKey,
  verifyHlsRequest,
} from "../../_shared";

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const verification = await verifyHlsRequest(req, context.params.id);
  if ("error" in verification) return verification.error;

  const assetPath = req.nextUrl.searchParams.get("path");
  if (!assetPath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const objectKey = resolveSegmentObjectKey(verification.prefix, assetPath);
  if (!objectKey) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  try {
    const object = await getS3().send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: objectKey,
      })
    );

    if (!object.Body) {
      return NextResponse.json({ error: "Missing object body" }, { status: 500 });
    }

    return new NextResponse(object.Body.transformToWebStream(), {
      status: 200,
      headers: {
        ...buildHlsCacheHeaders(object.ContentType ?? "video/mp2t"),
        ...(object.ContentLength !== undefined ? { "Content-Length": String(object.ContentLength) } : {}),
      },
    });
  } catch (error) {
    if (isMissingObjectError(error)) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : "Failed to load segment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
