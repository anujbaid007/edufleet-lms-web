import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

// Usage:
// NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=ap-south-1 S3_BUCKET_NAME=... npx tsx scripts/sync-existing-s3-videos.ts

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.S3_BUCKET_NAME;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION || !bucketName) {
  console.error("Missing AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, or S3_BUCKET_NAME");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function buildCandidates(key: string | null) {
  if (!key) return [];

  const candidates = new Set<string>();

  if (key.includes("/Mathematics/")) {
    candidates.add(key.replace("/Mathematics/", "/Maths/"));
  }

  return Array.from(candidates);
}

async function listS3VideoKeys() {
  const keys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
      })
    );

    for (const object of response.Contents ?? []) {
      if (object.Key?.endsWith(".mp4")) {
        keys.add(object.Key);
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function main() {
  const s3Keys = await listS3VideoKeys();
  console.log(`Found ${s3Keys.size} MP4 objects in S3`);

  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, title, s3_key, s3_key_hindi")
    .limit(5000);

  if (error) {
    throw error;
  }

  const updates: Array<{ id: string; s3_key?: string; s3_key_hindi?: string }> = [];

  for (const video of videos ?? []) {
    const update: { id: string; s3_key?: string; s3_key_hindi?: string } = { id: video.id };

    if (video.s3_key && !s3Keys.has(video.s3_key)) {
      const replacement = buildCandidates(video.s3_key).find((candidate) => s3Keys.has(candidate));
      if (replacement) {
        update.s3_key = replacement;
      }
    }

    if (video.s3_key_hindi && !s3Keys.has(video.s3_key_hindi)) {
      const replacement = buildCandidates(video.s3_key_hindi).find((candidate) => s3Keys.has(candidate));
      if (replacement) {
        update.s3_key_hindi = replacement;
      }
    }

    if (update.s3_key || update.s3_key_hindi) {
      updates.push(update);
    }
  }

  if (updates.length === 0) {
    console.log("No S3 key updates required");
    return;
  }

  console.log(`Updating ${updates.length} video rows to match existing S3 uploads`);

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("videos")
      .update({
        ...(update.s3_key ? { s3_key: update.s3_key } : {}),
        ...(update.s3_key_hindi ? { s3_key_hindi: update.s3_key_hindi } : {}),
      })
      .eq("id", update.id);

    if (updateError) {
      throw updateError;
    }
  }

  console.log("Done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
