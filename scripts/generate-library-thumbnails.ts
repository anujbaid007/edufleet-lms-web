import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { buildThumbnailKey } from "../src/lib/media";

const execFileAsync = promisify(execFile);

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
const forceRegenerate = process.env.FORCE === "1";
const generationLimit = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const PAGE_SIZE = 1000;
const VIDEO_CHUNK_SIZE = 100;

type ChapterRow = {
  id: string;
  class: number;
  medium: string;
  chapter_no: number;
  title: string;
  title_hindi: string | null;
  subjects: { name: string } | null;
};

type VideoRow = {
  id: string;
  chapter_id: string;
  sort_order: number;
  title: string;
  title_hindi: string | null;
  s3_key: string | null;
  s3_key_hindi: string | null;
};

function choosePreviewSource(chapter: ChapterRow, video: VideoRow) {
  const videoKey = chapter.medium === "Hindi" && video.s3_key_hindi ? video.s3_key_hindi : video.s3_key;
  if (!videoKey) return null;

  return {
    videoKey,
    thumbnailKey: buildThumbnailKey(videoKey),
    title: chapter.medium === "Hindi" && video.title_hindi ? video.title_hindi : video.title,
  };
}

async function thumbnailExists(key: string) {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function createFrameFromVideoUrl(videoUrl: string, outputPath: string) {
  const timestamps = ["8", "4", "1", "0"];

  for (const timestamp of timestamps) {
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-ss",
        timestamp,
        "-i",
        videoUrl,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-vf",
        "scale=960:-2:force_original_aspect_ratio=decrease",
        outputPath,
      ]);
      return true;
    } catch {
      // try next timestamp
    }
  }

  return false;
}

async function main() {
  const { count: chapterCount, error: chapterCountError } = await supabase
    .from("chapters")
    .select("*", { count: "exact", head: true });

  if (chapterCountError) throw chapterCountError;

  const chapterRanges = Array.from(
    { length: Math.ceil((chapterCount ?? 0) / PAGE_SIZE) },
    (_, index) => [index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1] as const
  );

  const chapterPages = await Promise.all(
    chapterRanges.map(([from, to]) =>
      supabase
        .from("chapters")
        .select("id, class, medium, chapter_no, title, title_hindi, subjects(name)")
        .order("class")
        .order("chapter_no")
        .range(from, to)
    )
  );

  const chapterErrors = chapterPages.find((page) => page.error)?.error;
  if (chapterErrors) throw chapterErrors;

  const chapters = chapterPages.flatMap((page) => (page.data ?? []) as ChapterRow[]);
  const filteredChapters = chapters.filter((chapter) => (targetClass === null ? true : chapter.class === targetClass));
  const videosByChapter = new Map<string, VideoRow[]>();
  const chapterIds = filteredChapters.map((chapter) => chapter.id);

  for (let index = 0; index < chapterIds.length; index += VIDEO_CHUNK_SIZE) {
    const chunk = chapterIds.slice(index, index + VIDEO_CHUNK_SIZE);
    const { data, error } = chunk.length
      ? await supabase
          .from("videos")
          .select("id, chapter_id, sort_order, title, title_hindi, s3_key, s3_key_hindi")
          .in("chapter_id", chunk)
          .order("chapter_id")
          .order("sort_order")
      : { data: [], error: null };

    if (error) throw error;

    for (const video of (data ?? []) as VideoRow[]) {
      const group = videosByChapter.get(video.chapter_id);
      if (group) group.push(video);
      else videosByChapter.set(video.chapter_id, [video]);
    }
  }

  const previewSources = filteredChapters
    .map((chapter) => {
      const chapterVideos = videosByChapter.get(chapter.id) ?? [];
      const firstVideo = chapterVideos[0];
      if (!firstVideo) return null;

      const source = choosePreviewSource(chapter as ChapterRow, firstVideo);
      if (!source?.thumbnailKey) return null;

      return {
        chapter: chapter as ChapterRow,
        source,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const limitedSources =
    generationLimit && Number.isFinite(generationLimit)
      ? previewSources.slice(0, generationLimit)
      : previewSources;

  console.log(
    `Preparing thumbnails for ${limitedSources.length} chapter preview videos${targetClass !== null ? ` in class ${targetClass}` : ""}`
  );

  let generatedCount = 0;
  let skippedCount = 0;

  for (const { chapter, source } of limitedSources) {
    if (!forceRegenerate && source.thumbnailKey && (await thumbnailExists(source.thumbnailKey))) {
      skippedCount += 1;
      continue;
    }

    const tempDir = await mkdtemp(join(tmpdir(), "edufleet-thumb-"));
    const outputPath = join(tempDir, "thumbnail.jpg");

    try {
      const signedVideoUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: source.videoKey,
        }),
        { expiresIn: 3600 }
      );

      const created = await createFrameFromVideoUrl(signedVideoUrl, outputPath);
      if (!created) {
        console.warn(`Skipping ${source.videoKey}: ffmpeg could not extract a frame`);
        continue;
      }

      const body = await readFile(outputPath);
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: source.thumbnailKey!,
          Body: body,
          ContentType: "image/jpeg",
          CacheControl: "private, max-age=31536000, immutable",
        })
      );

      generatedCount += 1;
      console.log(`Generated thumbnail for ${chapter.class} / ${chapter.subjects?.name ?? "Unknown"} / ${chapter.chapter_no}`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  console.log(`Done. Generated ${generatedCount} thumbnails, skipped ${skippedCount}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
