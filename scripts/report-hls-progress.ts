import fs from "node:fs";
import path from "node:path";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const VARIANTS = ["default", "hindi"] as const;
type Variant = (typeof VARIANTS)[number];

type VideoRow = {
  id: string;
  title: string;
  s3_key: string | null;
  s3_key_hindi: string | null;
  chapters: {
    class: number;
  } | null;
};

type ParsedArgs = {
  classNum: number;
  sampleSize: number;
};

type ManifestCheck = {
  manifestKey: string;
  title: string;
  variant: Variant;
  videoId: string;
};

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

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage:",
        "  npx tsx scripts/report-hls-progress.ts --class <number> [--sample <count>]",
        "",
        "Options:",
        "  --class <number>  Required class number to report",
        "  --sample <count>  Missing manifest samples to print per variant (default: 5)",
      ].join("\n")
    );
    process.exit(0);
  }

  let classNum: number | null = null;
  let sampleSize = 5;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--class") {
      classNum = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--sample") {
      sampleSize = Number(argv[index + 1] ?? "NaN");
      index += 1;
    }
  }

  if (classNum === null || Number.isNaN(classNum)) {
    throw new Error("Pass --class <number>.");
  }

  if (Number.isNaN(sampleSize) || sampleSize < 0) {
    throw new Error("Invalid --sample value.");
  }

  return { classNum, sampleSize };
}

function buildManifestKey(videoId: string, variant: Variant) {
  return `hls/${videoId}/${variant}/playlist.m3u8`;
}

function sourceKeyForVariant(video: VideoRow, variant: Variant) {
  return variant === "default" ? video.s3_key : video.s3_key_hindi;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function manifestExists(s3: S3Client, bucket: string, manifestKey: string) {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: manifestKey,
      })
    );
    return true;
  } catch (error) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (candidate.name === "NotFound" || candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404) {
      return false;
    }

    throw error;
  }
}

async function loadVideosForClass(classNum: number) {
  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from("videos")
    .select("id, title, s3_key, s3_key_hindi, chapters!inner(class)")
    .eq("chapters.class", classNum)
    .order("id");

  if (error) throw error;
  return (data ?? []) as unknown as VideoRow[];
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));

  const bucket = getEnv("S3_BUCKET_NAME");
  const s3 = new S3Client({
    region: getEnv("AWS_REGION"),
    credentials: {
      accessKeyId: getEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY"),
    },
  });

  const videos = await loadVideosForClass(args.classNum);
  if (videos.length === 0) {
    console.log(`No videos found for class ${args.classNum}.`);
    return;
  }

  const uniqueVideoIds = new Set(videos.map((video) => video.id));
  const expectedByVariant = new Map<Variant, ManifestCheck[]>(VARIANTS.map((variant) => [variant, []]));

  for (const video of videos) {
    for (const variant of VARIANTS) {
      const sourceKey = sourceKeyForVariant(video, variant);
      if (!sourceKey) continue;

      expectedByVariant.get(variant)?.push({
        manifestKey: buildManifestKey(video.id, variant),
        title: video.title,
        variant,
        videoId: video.id,
      });
    }
  }

  const checks = VARIANTS.flatMap((variant) => expectedByVariant.get(variant) ?? []);
  const existing = await mapWithConcurrency(checks, 24, async (item) => ({
    ...item,
    exists: await manifestExists(s3, bucket, item.manifestKey),
  }));

  const actualCounts = new Map<Variant, number>(VARIANTS.map((variant) => [variant, 0]));
  const missingByVariant = new Map<Variant, ManifestCheck[]>(VARIANTS.map((variant) => [variant, []]));
  const actualByVideo = new Map<string, Set<Variant>>();

  for (const item of existing) {
    if (item.exists) {
      actualCounts.set(item.variant, (actualCounts.get(item.variant) ?? 0) + 1);
      const variants = actualByVideo.get(item.videoId) ?? new Set<Variant>();
      variants.add(item.variant);
      actualByVideo.set(item.videoId, variants);
      continue;
    }

    missingByVariant.get(item.variant)?.push(item);
  }

  const expectedDefault = expectedByVariant.get("default")?.length ?? 0;
  const expectedHindi = expectedByVariant.get("hindi")?.length ?? 0;
  const actualDefault = actualCounts.get("default") ?? 0;
  const actualHindi = actualCounts.get("hindi") ?? 0;
  const expectedTotal = expectedDefault + expectedHindi;
  const actualTotal = actualDefault + actualHindi;
  const videosWithAnyManifest = actualByVideo.size;
  const fullyPackagedVideoCount = videos.filter((video) => {
    const expectedVariants = VARIANTS.filter((variant) => Boolean(sourceKeyForVariant(video, variant)));
    if (expectedVariants.length === 0) return false;

    const actualVariants = actualByVideo.get(video.id) ?? new Set<Variant>();
    return expectedVariants.every((variant) => actualVariants.has(variant));
  }).length;

  console.log(`HLS packaging progress for class ${args.classNum}`);
  console.log("");
  console.log(`Expected unique video IDs: ${uniqueVideoIds.size}`);
  console.log(`Expected manifests: total=${expectedTotal} default=${expectedDefault} hindi=${expectedHindi}`);
  console.log(`Actual manifests in S3: total=${actualTotal} default=${actualDefault} hindi=${actualHindi}`);
  console.log(
    `Missing manifests: total=${expectedTotal - actualTotal} default=${expectedDefault - actualDefault} hindi=${expectedHindi - actualHindi}`
  );
  console.log(`Videos with any manifest: ${videosWithAnyManifest}`);
  console.log(`Videos fully packaged for all expected variants: ${fullyPackagedVideoCount}`);

  if (args.sampleSize > 0) {
    for (const variant of VARIANTS) {
      const missing = missingByVariant.get(variant) ?? [];
      if (missing.length === 0) continue;

      console.log("");
      console.log(`Missing ${variant} manifests (showing ${Math.min(args.sampleSize, missing.length)} of ${missing.length}):`);
      for (const item of missing.slice(0, args.sampleSize)) {
        console.log(`- ${item.videoId} | ${item.title} | ${item.manifestKey}`);
      }
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
