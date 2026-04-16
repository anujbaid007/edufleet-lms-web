import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { getBucketName, getS3 } from "@/lib/secure-media";
import { buildHlsCacheHeaders, isMissingObjectError, resolveKeyObjectKey, verifyHlsRequest } from "../../_shared";

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const verification = await verifyHlsRequest(req, context.params.id);
  if ("error" in verification) return verification.error;

  try {
    const object = await getS3().send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: resolveKeyObjectKey(verification.prefix),
      })
    );

    if (!object.Body) {
      return NextResponse.json({ error: "Missing key body" }, { status: 500 });
    }

    return new NextResponse(object.Body.transformToWebStream(), {
      status: 200,
      headers: {
        ...buildHlsCacheHeaders("application/octet-stream"),
        ...(object.ContentLength !== undefined ? { "Content-Length": String(object.ContentLength) } : {}),
      },
    });
  } catch (error) {
    if (isMissingObjectError(error)) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : "Failed to load encryption key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
