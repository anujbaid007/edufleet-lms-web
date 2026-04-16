import { NextRequest, NextResponse } from "next/server";
import { buildHlsCacheHeaders, isMissingObjectError, readTextObject, verifyHlsRequest } from "../../_shared";

function rewriteManifest(params: {
  id: string;
  manifest: string;
  token: string;
  variant: string;
}) {
  const keyUrl = `/api/media/hls/key/${params.id}?variant=${params.variant}&token=${encodeURIComponent(params.token)}`;

  return params.manifest
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#EXT-X-KEY")) {
        return line.replace(/URI="([^"]+)"/, `URI="${keyUrl}"`);
      }

      if (trimmed.startsWith("#")) {
        return line;
      }

      const assetUrl = `/api/media/hls/asset/${params.id}?variant=${params.variant}&token=${encodeURIComponent(params.token)}&path=${encodeURIComponent(trimmed)}`;
      return assetUrl;
    })
    .join("\n");
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const verification = await verifyHlsRequest(req, context.params.id);
  if ("error" in verification) return verification.error;

  try {
    const manifest = await readTextObject(`${verification.prefix}/playlist.m3u8`);
    const body = rewriteManifest({
      id: context.params.id,
      manifest,
      token: verification.token,
      variant: verification.variant,
    });

    return new NextResponse(body, {
      status: 200,
      headers: buildHlsCacheHeaders("application/vnd.apple.mpegurl"),
    });
  } catch (error) {
    if (isMissingObjectError(error)) {
      return NextResponse.json({ error: "Manifest not found" }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : "Failed to load manifest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
