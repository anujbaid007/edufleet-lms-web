import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// Usage:
// NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=ap-south-1 S3_BUCKET_NAME=... npx tsx scripts/sync-existing-s3-videos.ts

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));

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
const PAGE_SIZE = 1000;
const VIDEO_CHUNK_SIZE = 100;

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

type ChapterRow = {
  id: string;
  class: number;
  chapter_no: number;
  subjects: { name: string } | null;
};

function normalizeSubjectName(subjectName: string) {
  const normalized = subjectName.trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized === "mathematics") return "maths";
  if (normalized === "business studies") return "business";
  if (normalized === "computers") return "computer";
  return normalized;
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

async function loadVideosForChapterIds(chapterIds: string[]) {
  const videos: Array<{
    id: string;
    title: string;
    chapter_id: string;
    sort_order: number;
    s3_key: string | null;
    s3_key_hindi: string | null;
  }> = [];

  for (let index = 0; index < chapterIds.length; index += VIDEO_CHUNK_SIZE) {
    const chunk = chapterIds.slice(index, index + VIDEO_CHUNK_SIZE);
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("videos")
        .select("id, title, chapter_id, sort_order, s3_key, s3_key_hindi")
        .in("chapter_id", chunk)
        .order("chapter_id")
        .order("sort_order")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;

      const page = data ?? [];
      videos.push(...page);

      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return videos;
}

async function loadChapters() {
  const chapters: ChapterRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("chapters")
      .select("id, class, chapter_no, subjects(name)")
      .order("class")
      .order("chapter_no")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as ChapterRow[];
    chapters.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return chapters;
}

async function main() {
  const [{ keys: s3Keys, parsed: parsedS3Keys }, chapters] = await Promise.all([
    listS3VideoKeys(),
    loadChapters(),
  ]);

  const chapterMetaById = new Map<string, ChapterMeta>(
    chapters
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

  const videos = chapterIds.length ? await loadVideosForChapterIds(chapterIds) : [];
  console.log(`Loaded ${videos.length} video rows${targetClass !== null ? ` for class ${targetClass}` : ""}`);

  const updates: Array<{ id: string; s3_key?: string | null; s3_key_hindi?: string | null }> = [];

  for (const video of videos ?? []) {
    const update: { id: string; s3_key?: string | null; s3_key_hindi?: string | null } = { id: video.id };
    const chapter = chapterMetaById.get(video.chapter_id);
    if (!chapter) continue;

    const baseKey = [chapter.class, normalizeSubjectName(chapter.subjectName), chapter.chapter_no, video.sort_order].join("|");
    let englishCandidate = parsedS3Keys.get(`English|${baseKey}`);
    let hindiCandidate = parsedS3Keys.get(`Hindi|${baseKey}`);

    if (!englishCandidate && video.s3_key) {
      const parsedExistingKey = parseS3VideoKey(video.s3_key);
      if (parsedExistingKey) {
        englishCandidate = parsedS3Keys.get(
          [
            "English",
            parsedExistingKey.classNum,
            normalizeSubjectName(parsedExistingKey.subjectName),
            parsedExistingKey.chapterNo,
            parsedExistingKey.lessonNo,
          ].join("|")
        );
      }
    }

    if (!hindiCandidate && video.s3_key_hindi) {
      const parsedExistingKey = parseS3VideoKey(video.s3_key_hindi);
      if (parsedExistingKey) {
        hindiCandidate = parsedS3Keys.get(
          [
            "Hindi",
            parsedExistingKey.classNum,
            normalizeSubjectName(parsedExistingKey.subjectName),
            parsedExistingKey.chapterNo,
            parsedExistingKey.lessonNo,
          ].join("|")
        );
      }
    }

    if (englishCandidate && video.s3_key !== englishCandidate) {
      update.s3_key = englishCandidate;
    } else if (!englishCandidate && video.s3_key && !s3Keys.has(video.s3_key)) {
      update.s3_key = null;
    }

    if (hindiCandidate && video.s3_key_hindi !== hindiCandidate) {
      update.s3_key_hindi = hindiCandidate;
    } else if (!hindiCandidate && video.s3_key_hindi && !s3Keys.has(video.s3_key_hindi)) {
      update.s3_key_hindi = null;
    }

    if ("s3_key" in update || "s3_key_hindi" in update) {
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
        ...("s3_key" in update ? { s3_key: update.s3_key } : {}),
        ...("s3_key_hindi" in update ? { s3_key_hindi: update.s3_key_hindi } : {}),
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
