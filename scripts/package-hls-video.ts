import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile as execFileCallback } from "node:child_process";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const execFile = promisify(execFileCallback);
const VARIANTS = ["default", "hindi"] as const;
const S3_RETRY_ATTEMPTS = 3;
const PAGE_SIZE = 1000;
type Variant = (typeof VARIANTS)[number];

type VideoRow = {
  id: string;
  title: string;
  s3_key: string;
  s3_key_hindi: string | null;
  chapters: {
    class: number;
    medium: string;
  } | null;
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

function parseArgs(argv: string[]) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage:",
        "  npm run package:hls -- --video-id <uuid> [--variant default|hindi|both] [--transcode]",
        "  npm run package:hls -- --class <number> [--limit <n>] [--id-min <uuid>] [--id-max <uuid>] [--slice-count <n> --slice-index <i>] [--variant default|hindi|both] [--missing-only] [--transcode]",
      ].join("\n")
    );
    process.exit(0);
  }

  const parsed: {
    classNum: number | null;
    idMax: string | null;
    idMin: string | null;
    limit: number | null;
    missingOnly: boolean;
    sliceCount: number | null;
    sliceIndex: number | null;
    transcode: boolean;
    variants: Variant[];
    videoId: string | null;
  } = {
    classNum: null,
    idMax: null,
    idMin: null,
    limit: null,
    missingOnly: false,
    sliceCount: null,
    sliceIndex: null,
    transcode: false,
    variants: ["default", "hindi"],
    videoId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--video-id") {
      parsed.videoId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--class") {
      parsed.classNum = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--id-min") {
      parsed.idMin = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--id-max") {
      parsed.idMax = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      parsed.limit = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--slice-count") {
      parsed.sliceCount = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--slice-index") {
      parsed.sliceIndex = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--variant") {
      const variant = argv[index + 1] ?? "both";
      index += 1;
      parsed.variants =
        variant === "default" ? ["default"] : variant === "hindi" ? ["hindi"] : ["default", "hindi"];
      continue;
    }

    if (arg === "--transcode") {
      parsed.transcode = true;
      continue;
    }

    if (arg === "--missing-only") {
      parsed.missingOnly = true;
    }
  }

  if (!parsed.videoId && parsed.classNum === null) {
    throw new Error("Pass either --video-id <uuid> or --class <number>.");
  }

  if (parsed.classNum !== null && Number.isNaN(parsed.classNum)) {
    throw new Error("Invalid --class value.");
  }

  if (parsed.limit !== null && (Number.isNaN(parsed.limit) || parsed.limit <= 0)) {
    throw new Error("Invalid --limit value.");
  }

  if ((parsed.sliceCount === null) !== (parsed.sliceIndex === null)) {
    throw new Error("Pass both --slice-count <n> and --slice-index <i> together.");
  }

  if (parsed.sliceCount !== null && (Number.isNaN(parsed.sliceCount) || parsed.sliceCount <= 0)) {
    throw new Error("Invalid --slice-count value.");
  }

  if (parsed.sliceIndex !== null && (Number.isNaN(parsed.sliceIndex) || parsed.sliceIndex < 0)) {
    throw new Error("Invalid --slice-index value.");
  }

  if (
    parsed.sliceCount !== null &&
    parsed.sliceIndex !== null &&
    parsed.sliceIndex >= parsed.sliceCount
  ) {
    throw new Error("--slice-index must be smaller than --slice-count.");
  }

  return parsed;
}

function contentTypeForFile(fileName: string) {
  if (fileName.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (fileName.endsWith(".ts")) return "video/mp2t";
  if (fileName.endsWith(".key")) return "application/octet-stream";
  return "application/octet-stream";
}

function shouldUploadAsset(fileName: string) {
  return fileName.endsWith(".m3u8") || fileName.endsWith(".ts") || fileName.endsWith(".key");
}

function buildSourceKey(video: VideoRow, variant: Variant) {
  return variant === "hindi" ? video.s3_key_hindi : video.s3_key;
}

function buildTargetPrefix(videoId: string, variant: Variant) {
  return `hls/${videoId}/${variant}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String((error as Error & { code?: unknown }).code) : "";
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    error.name === "TimeoutError" ||
    error.name === "RequestTimeout" ||
    error.message.toLowerCase().includes("socket hang up")
  );
}

function isMissingS3ObjectError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

async function withRetry<T>(label: string, action: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= S3_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (!isRetriableError(error) || attempt === S3_RETRY_ATTEMPTS) break;

      const delayMs = 750 * attempt;
      console.warn(`${label} failed with a transient error; retrying in ${delayMs}ms (${attempt}/${S3_RETRY_ATTEMPTS})`);
      await wait(delayMs);
    }
  }

  throw lastError;
}

function dedupeVideosById(videos: VideoRow[]) {
  const seen = new Set<string>();
  return videos.filter((video) => {
    if (seen.has(video.id)) return false;
    seen.add(video.id);
    return true;
  });
}

async function hlsVariantExists(params: {
  bucket: string;
  s3: S3Client;
  targetPrefix: string;
}) {
  const playlistKey = `${params.targetPrefix}/playlist.m3u8`;

  try {
    const playlistObject = await withRetry(`get ${playlistKey}`, () =>
      params.s3.send(
        new GetObjectCommand({
          Bucket: params.bucket,
          Key: playlistKey,
        })
      )
    );

    if (!playlistObject.Body) return false;

    const playlist = await bodyToString(playlistObject.Body);
    const segmentNames = playlist
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.endsWith(".ts"));

    if (segmentNames.length === 0) return false;

    const firstSegment = segmentNames[0];
    const lastSegment = segmentNames[segmentNames.length - 1];
    const probeKeys = new Set([
      `${params.targetPrefix}/enc.key`,
      `${params.targetPrefix}/${firstSegment}`,
      `${params.targetPrefix}/${lastSegment}`,
    ]);

    for (const key of probeKeys) {
      await withRetry(`check ${key}`, () =>
        params.s3.send(
          new HeadObjectCommand({
            Bucket: params.bucket,
            Key: key,
          })
        )
      );
    }

    return true;
  } catch (error) {
    if (isMissingS3ObjectError(error)) {
      return false;
    }
    throw error;
  }
}

async function bodyToString(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "transformToString" in body &&
    typeof (body as { transformToString?: unknown }).transformToString === "function"
  ) {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function clearPrefix(s3: S3Client, bucket: string, prefix: string) {
  let continuationToken: string | undefined;

  do {
    const page = await withRetry(`list ${prefix}`, () =>
      s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
          Prefix: prefix,
        })
      )
    );

    const keys = (page.Contents ?? []).map((item) => item.Key).filter((key): key is string => Boolean(key));
    if (keys.length > 0) {
      await withRetry(`delete ${prefix}`, () =>
        s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: keys.map((key) => ({ Key: key })),
              Quiet: true,
            },
          })
        )
      );
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function downloadObjectToFile(params: {
  bucket: string;
  key: string;
  outputPath: string;
  s3: S3Client;
}) {
  const object = await withRetry(`download ${params.key}`, () =>
    params.s3.send(
      new GetObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      })
    )
  );

  if (!object.Body) throw new Error(`Missing object body for ${params.key}`);

  const body = object.Body.transformToWebStream();
  await pipeline(Readable.fromWeb(body as globalThis.ReadableStream), fs.createWriteStream(params.outputPath));
}

async function uploadDirectory(params: {
  bucket: string;
  directory: string;
  prefix: string;
  s3: S3Client;
}) {
  const entries = await fsp.readdir(params.directory);

  for (const fileName of entries) {
    const fullPath = path.join(params.directory, fileName);
    const stat = await fsp.stat(fullPath);
    if (!stat.isFile() || !shouldUploadAsset(fileName)) continue;

    await withRetry(`upload ${params.prefix}/${fileName}`, () =>
      params.s3.send(
        new PutObjectCommand({
          Body: fs.createReadStream(fullPath),
          Bucket: params.bucket,
          ContentType: contentTypeForFile(fileName),
          Key: `${params.prefix}/${fileName}`,
        })
      )
    );
  }
}

async function packageVariant(params: {
  bucket: string;
  s3: S3Client;
  sourceKey: string;
  targetPrefix: string;
  transcode: boolean;
  videoId: string;
  variant: Variant;
}) {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), `edufleet-hls-${params.videoId}-${params.variant}-`));
  const inputPath = path.join(tempRoot, "input.mp4");
  const outputDir = path.join(tempRoot, "out");
  const keyPath = path.join(outputDir, "enc.key");
  const keyInfoPath = path.join(outputDir, "keyinfo.txt");
  const playlistPath = path.join(outputDir, "playlist.m3u8");
  const ivHex = crypto.randomBytes(16).toString("hex");

  try {
    await fsp.mkdir(outputDir, { recursive: true });
    await downloadObjectToFile({
      bucket: params.bucket,
      key: params.sourceKey,
      outputPath: inputPath,
      s3: params.s3,
    });

    await fsp.writeFile(keyPath, crypto.randomBytes(16));
    await fsp.writeFile(keyInfoPath, `enc.key\n${keyPath}\n${ivHex}\n`);

    const ffmpegArgs = params.transcode
      ? [
          "-y",
          "-i",
          inputPath,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-hls_time",
          "6",
          "-hls_playlist_type",
          "vod",
          "-hls_flags",
          "independent_segments",
          "-hls_key_info_file",
          keyInfoPath,
          "-hls_segment_filename",
          path.join(outputDir, "segment_%03d.ts"),
          playlistPath,
        ]
      : [
          "-y",
          "-i",
          inputPath,
          "-c",
          "copy",
          "-hls_time",
          "6",
          "-hls_playlist_type",
          "vod",
          "-hls_key_info_file",
          keyInfoPath,
          "-hls_segment_filename",
          path.join(outputDir, "segment_%03d.ts"),
          playlistPath,
        ];

    await execFile("ffmpeg", ffmpegArgs, {
      maxBuffer: 10 * 1024 * 1024,
    });

    await clearPrefix(params.s3, params.bucket, `${params.targetPrefix}/`);
    await uploadDirectory({
      bucket: params.bucket,
      directory: outputDir,
      prefix: params.targetPrefix,
      s3: params.s3,
    });
  } finally {
    await fsp.rm(tempRoot, { force: true, recursive: true });
  }
}

async function loadVideos(args: ReturnType<typeof parseArgs>) {
  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const data: unknown[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("videos")
      .select("id, title, s3_key, s3_key_hindi, chapters!inner(class, medium)")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);

    if (args.videoId) {
      query = query.eq("id", args.videoId);
    }

    if (args.classNum !== null) {
      query = query.eq("chapters.class", args.classNum);
    }

    const { data: pageData, error } = await query;
    if (error) throw error;

    const page = pageData ?? [];
    data.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  let videos = dedupeVideosById(data as unknown as VideoRow[]);
  if (args.idMin) videos = videos.filter((video) => video.id >= args.idMin!);
  if (args.idMax) videos = videos.filter((video) => video.id < args.idMax!);

  const slicedVideos =
    args.sliceCount !== null && args.sliceIndex !== null
      ? videos.filter((_, index) => index % args.sliceCount! === args.sliceIndex)
      : videos;

  return args.limit !== null ? slicedVideos.slice(0, args.limit) : slicedVideos;
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

  const videos = await loadVideos(args);
  if (videos.length === 0) {
    console.log("No videos matched the selection.");
    return;
  }

  const scopeLabel =
    args.sliceCount !== null && args.sliceIndex !== null
      ? `slice ${args.sliceIndex + 1}/${args.sliceCount}`
      : "full selection";

  console.log(`Packaging ${videos.length} video record(s) into encrypted HLS for ${scopeLabel}...`);

  for (const video of videos) {
    for (const variant of args.variants) {
      const sourceKey = buildSourceKey(video, variant);
      if (!sourceKey) continue;

      const targetPrefix = buildTargetPrefix(video.id, variant);
      if (
        args.missingOnly &&
        (await hlsVariantExists({
          bucket,
          s3,
          targetPrefix,
        }))
      ) {
        console.log(`-> ${video.id} [${variant}] skipped; ${targetPrefix}/playlist.m3u8 already exists`);
        continue;
      }

      console.log(`-> ${video.id} [${variant}] from ${sourceKey}`);
      try {
        await packageVariant({
          bucket,
          s3,
          sourceKey,
          targetPrefix,
          transcode: args.transcode,
          variant,
          videoId: video.id,
        });
      } catch (error) {
        if (isMissingS3ObjectError(error)) {
          console.warn(`-> ${video.id} [${variant}] skipped; source object is missing: ${sourceKey}`);
          continue;
        }

        throw error;
      }
    }
  }

  console.log("Encrypted HLS packaging complete.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
