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

const targetClass = process.env.TARGET_CLASS ? Number(process.env.TARGET_CLASS) : null;

type ParsedS3Key = {
  key: string;
  language: "English" | "Hindi";
  classNum: number;
  subjectName: string;
  chapterNo: number;
  lessonNo: number;
};

type ChapterMeta = {
  id: string;
  class: number;
  chapter_no: number;
  subjectName: string;
};

function normalizeSubjectName(subjectName: string) {
  return subjectName.trim().replace(/\s+/g, " ").toLowerCase().replace(/^mathematics$/, "maths");
}

function extractLeadingNumber(value: string) {
  const match = value.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseS3VideoKey(key: string): ParsedS3Key | null {
  const segments = key.split("/");
  if (segments.length < 5) return null;

  const [language, classSegment, subjectName, chapterSegment, fileName] = segments;
  if ((language !== "English" && language !== "Hindi") || !fileName.endsWith(".mp4")) return null;

  const classNum = Number(classSegment);
  const chapterNo = extractLeadingNumber(chapterSegment);
  const lessonNo = extractLeadingNumber(fileName);

  if (!Number.isFinite(classNum) || chapterNo === null || lessonNo === null) return null;

  return {
    key,
    language,
    classNum,
    subjectName,
    chapterNo,
    lessonNo,
  };
}

async function listS3VideoKeys() {
  const keys = new Set<string>();
  const parsed = new Map<string, string>();
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
        const parsedKey = parseS3VideoKey(object.Key);
        if (parsedKey) {
          const mapKey = [
            parsedKey.language,
            parsedKey.classNum,
            normalizeSubjectName(parsedKey.subjectName),
            parsedKey.chapterNo,
            parsedKey.lessonNo,
          ].join("|");
          parsed.set(mapKey, parsedKey.key);
        }
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return { keys, parsed };
}

async function main() {
  const [{ keys: s3Keys, parsed: parsedS3Keys }, chapterResponse] = await Promise.all([
    listS3VideoKeys(),
    supabase
      .from("chapters")
      .select("id, class, chapter_no, subjects(name)")
      .order("class")
      .order("chapter_no"),
  ]);

  if (chapterResponse.error) throw chapterResponse.error;

  const chapterMetaById = new Map<string, ChapterMeta>(
    (chapterResponse.data ?? [])
      .filter((chapter) => (targetClass === null ? true : chapter.class === targetClass))
      .map((chapter) => [
        chapter.id,
        {
          id: chapter.id,
          class: chapter.class,
          chapter_no: chapter.chapter_no,
          subjectName: (chapter.subjects as { name: string } | null)?.name ?? "Unknown",
        },
      ])
  );

  const chapterIds = Array.from(chapterMetaById.keys());
  console.log(
    `Found ${s3Keys.size} MP4 objects in S3${targetClass !== null ? ` for class ${targetClass}` : ""}`
  );

  const { data: videos, error } = chapterIds.length
    ? await supabase
        .from("videos")
        .select("id, title, chapter_id, sort_order, s3_key, s3_key_hindi")
        .in("chapter_id", chapterIds)
    : { data: [], error: null };

  if (error) throw error;

  const updates: Array<{ id: string; s3_key?: string; s3_key_hindi?: string }> = [];

  for (const video of videos ?? []) {
    const update: { id: string; s3_key?: string; s3_key_hindi?: string } = { id: video.id };
    const chapter = chapterMetaById.get(video.chapter_id);
    if (!chapter) continue;

    const baseKey = [chapter.class, normalizeSubjectName(chapter.subjectName), chapter.chapter_no, video.sort_order].join("|");
    const englishCandidate = parsedS3Keys.get(`English|${baseKey}`);
    const hindiCandidate = parsedS3Keys.get(`Hindi|${baseKey}`);

    if (englishCandidate && video.s3_key !== englishCandidate) {
      update.s3_key = englishCandidate;
    }

    if (hindiCandidate && video.s3_key_hindi !== hindiCandidate) {
      update.s3_key_hindi = hindiCandidate;
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
