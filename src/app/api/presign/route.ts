import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";

let s3: S3Client | null = null;

function getEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim();
  if (value) return value;
  return fallback;
}

function getS3() {
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

export async function GET(req: NextRequest) {
  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  try {
    const bucketName = getEnv("S3_BUCKET_NAME");
    if (!bucketName) {
      return NextResponse.json({ error: "Missing S3 bucket configuration" }, { status: 500 });
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const url = await getSignedUrl(getS3(), command, { expiresIn: 3600 });
    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
