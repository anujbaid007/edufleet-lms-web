import {
  ConflictException,
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
  type LanguageCode,
} from "@aws-sdk/client-transcribe";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";
import { execFile as execFileCallback } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

type Variant = "default" | "hindi";

type VideoRow = {
  chapter_id: string;
  duration_seconds: number | null;
  duration_seconds_hindi: number | null;
  id: string;
  s3_key: string | null;
  s3_key_hindi: string | null;
  title: string;
  title_hindi: string | null;
};

type Args = {
  classNum: number | null;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  medium: string | null;
  provider: "aws" | "local" | "openrouter";
  skipExisting: boolean;
  sliceCount: number | null;
  sliceIndex: number | null;
  summarize: boolean;
  variants: Variant[];
  videoId: string | null;
};

const DEFAULT_TRANSCRIPT_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const DEFAULT_LOCAL_TRANSCRIPT_MODEL = "mlx-community/whisper-tiny";
const execFile = promisify(execFileCallback);
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 120000);
const POLL_INTERVAL_MS = 15000;
const TRANSCRIPTION_ATTEMPTS = 3;
const TRANSCRIPT_SUMMARY_CHARS = 40000;

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

function parseArgs(argv: string[]): Args {
  const args: Args = {
    classNum: null,
    dryRun: false,
    force: false,
    limit: null,
    medium: null,
    provider: "aws",
    skipExisting: true,
    sliceCount: null,
    sliceIndex: null,
    summarize: true,
    variants: ["default"],
    videoId: null,
  };

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage:",
        "  npm run transcribe:asha -- --video-id <uuid> [--variant default|hindi|both] [--force] [--no-summary] [--dry-run]",
        "  npm run transcribe:asha -- --class <number> [--medium English] [--limit <n>] [--slice-count <n> --slice-index <i>] [--variant default|hindi|both] [--force] [--no-summary] [--dry-run]",
        "  npm run transcribe:asha -- --video-id <uuid> --provider local",
        "  npm run transcribe:asha -- --video-id <uuid> --provider openrouter",
        "",
        "Notes:",
        "  Default provider is AWS Transcribe from S3 videos.",
        "  Use --provider local to transcribe with the local MLX Whisper helper without AWS Transcribe or OpenRouter.",
        "  Use --provider openrouter when AWS Transcribe permissions are not available.",
        "  OpenRouter transcripts use OPENROUTER_TRANSCRIPT_MODEL, defaulting to NVIDIA Nemotron 3 Nano Omni free.",
        "  Summaries/key points use OPENROUTER_NOTES_MODEL, defaulting to the transcript model.",
      ].join("\n")
    );
    process.exit(0);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--video-id") {
      args.videoId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--class") {
      args.classNum = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      args.limit = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--medium") {
      args.medium = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--variant") {
      const variant = argv[index + 1] ?? "default";
      args.variants = variant === "both" ? ["default", "hindi"] : [variant as Variant];
      index += 1;
      continue;
    }

    if (arg === "--provider") {
      args.provider = (argv[index + 1] ?? "aws") as Args["provider"];
      index += 1;
      continue;
    }

    if (arg === "--slice-count") {
      args.sliceCount = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--slice-index") {
      args.sliceIndex = Number(argv[index + 1] ?? "NaN");
      index += 1;
      continue;
    }

    if (arg === "--force") {
      args.force = true;
      args.skipExisting = false;
      continue;
    }

    if (arg === "--no-summary") {
      args.summarize = false;
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  if (!args.videoId && args.classNum === null) {
    throw new Error("Pass either --video-id <uuid> or --class <number>.");
  }

  if (args.videoId && args.classNum !== null) {
    throw new Error("Use only one of --video-id or --class.");
  }

  if (args.classNum !== null && Number.isNaN(args.classNum)) {
    throw new Error("Invalid --class value.");
  }

  if (args.limit !== null && (Number.isNaN(args.limit) || args.limit <= 0)) {
    throw new Error("Invalid --limit value.");
  }

  if (args.variants.some((variant) => variant !== "default" && variant !== "hindi")) {
    throw new Error("--variant must be default, hindi, or both.");
  }

  if (args.provider !== "aws" && args.provider !== "local" && args.provider !== "openrouter") {
    throw new Error("--provider must be aws, local, or openrouter.");
  }

  if ((args.sliceCount === null) !== (args.sliceIndex === null)) {
    throw new Error("Pass both --slice-count <n> and --slice-index <i> together.");
  }

  if (args.sliceCount !== null && (Number.isNaN(args.sliceCount) || args.sliceCount <= 0)) {
    throw new Error("Invalid --slice-count value.");
  }

  if (args.sliceIndex !== null && (Number.isNaN(args.sliceIndex) || args.sliceIndex < 0)) {
    throw new Error("Invalid --slice-index value.");
  }

  if (args.sliceCount !== null && args.sliceIndex !== null && args.sliceIndex >= args.sliceCount) {
    throw new Error("--slice-index must be smaller than --slice-count.");
  }

  return args;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = OPENROUTER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function languageForVariant(variant: Variant): { code: LanguageCode; label: "English" | "Hindi" } {
  return variant === "hindi"
    ? { code: "hi-IN", label: "Hindi" }
    : { code: "en-IN", label: "English" };
}

function s3Uri(bucket: string, key: string) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `s3://${bucket}/${encodedKey}`;
}

function sanitizeLogMessage(message: string) {
  return message
    .replace(/https?:\/\/\S+/g, "<signed-s3-url>")
    .replace(/AKIA[0-9A-Z]{16}/g, "<aws-access-key-id>");
}

function isNoAudioExtractionError(message: string) {
  return /does not contain any stream|matches no streams|no audio streams/i.test(message);
}

function noAudioTranscript(videoTitle: string) {
  return `No spoken audio was detected in this video. Lesson topic: ${videoTitle}.`;
}

function transcribeJobName(videoId: string, variant: Variant, sourceKey: string) {
  const hash = crypto.createHash("sha1").update(`${videoId}:${variant}:${sourceKey}`).digest("hex").slice(0, 16);
  return `edufleet-asha-${videoId}-${variant}-${hash}`.replace(/[^0-9A-Za-z._-]/g, "-").slice(0, 200);
}

function outputKey(videoId: string, variant: Variant) {
  return `transcripts/miss-asha/${videoId}/${variant}.json`;
}

async function bodyToString(body: unknown) {
  if (!body) return "";
  if (typeof body === "object" && "transformToString" in body && typeof body.transformToString === "function") {
    return body.transformToString();
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("Unsupported S3 response body.");
}

async function loadVideos(supabase: ReturnType<typeof createClient>, args: Args) {
  if (args.videoId) {
    const { data, error } = await supabase
      .from("videos")
      .select("id, title, title_hindi, s3_key, s3_key_hindi, duration_seconds, duration_seconds_hindi, chapter_id")
      .eq("id", args.videoId)
      .single();

    if (error) throw error;
    return [data as VideoRow];
  }

  const pageSize = 1000;
  const videos: VideoRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const remaining = args.limit ? args.limit - videos.length : pageSize;
    if (remaining <= 0) break;

    const to = from + Math.min(pageSize, remaining) - 1;
    let query = supabase
      .from("videos")
      .select(
        "id, title, title_hindi, s3_key, s3_key_hindi, duration_seconds, duration_seconds_hindi, chapter_id, chapters!inner(class,medium)"
      )
      .eq("chapters.class", args.classNum)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("id")
      .range(from, to);

    if (args.medium) {
      query = query.eq("chapters.medium", args.medium);
    }

    const { data, error } = await query;

    if (error) throw error;
    const rows = (data ?? []) as unknown as VideoRow[];
    videos.push(...rows);

    if (rows.length < to - from + 1) break;
  }

  if (args.sliceCount === null || args.sliceIndex === null) {
    return videos;
  }

  return videos.filter((_, index) => index % args.sliceCount! === args.sliceIndex);
}

async function getExistingNote(
  supabase: ReturnType<typeof createClient>,
  videoId: string,
  language: "English" | "Hindi"
) {
  const { data, error } = await supabase
    .from("ai_video_notes")
    .select("id, transcript")
    .eq("video_id", videoId)
    .eq("language", language)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; transcript: string | null } | null;
}

async function getVideoIdsForSourceKey(supabase: ReturnType<typeof createClient>, sourceKey: string) {
  const [defaultMatches, hindiMatches] = await Promise.all([
    supabase.from("videos").select("id").eq("s3_key", sourceKey),
    supabase.from("videos").select("id").eq("s3_key_hindi", sourceKey),
  ]);

  if (defaultMatches.error) throw defaultMatches.error;
  if (hindiMatches.error) throw hindiMatches.error;

  return Array.from(
    new Set([...(defaultMatches.data ?? []), ...(hindiMatches.data ?? [])].map((video) => video.id).filter(Boolean))
  );
}

async function getReusableNoteForSourceKey(params: {
  language: "English" | "Hindi";
  sourceKey: string;
  supabase: ReturnType<typeof createClient>;
  videoId: string;
}) {
  const videoIds = (await getVideoIdsForSourceKey(params.supabase, params.sourceKey)).filter((id) => id !== params.videoId);

  if (videoIds.length === 0) return null;

  for (let index = 0; index < videoIds.length; index += 100) {
    const { data, error } = await params.supabase
      .from("ai_video_notes")
      .select("summary, key_points, transcript")
      .eq("language", params.language)
      .not("transcript", "is", null)
      .in("video_id", videoIds.slice(index, index + 100))
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data?.transcript) {
      return data as { key_points: string | null; summary: string | null; transcript: string };
    }
  }

  return null;
}

async function upsertMatchingSourceNotes(params: {
  keyPoints: string | null;
  language: "English" | "Hindi";
  sourceKey: string;
  summary: string | null;
  supabase: ReturnType<typeof createClient>;
  transcript: string;
  videoId: string;
}) {
  const videoIds = await getVideoIdsForSourceKey(params.supabase, params.sourceKey);
  const rows = videoIds.map((videoId) => ({
    key_points: params.keyPoints,
    language: params.language,
    summary: params.summary,
    transcript: params.transcript,
    updated_at: new Date().toISOString(),
    video_id: videoId,
  }));

  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await params.supabase
      .from("ai_video_notes")
      .upsert(rows.slice(index, index + 100), { onConflict: "video_id,language" });

    if (error) throw error;
  }

  return videoIds.length;
}

async function startOrResumeTranscription(params: {
  bucket: string;
  force: boolean;
  jobName: string;
  languageCode: LanguageCode;
  outputKey: string;
  sourceKey: string;
  transcribe: TranscribeClient;
}) {
  const { bucket, force, jobName, languageCode, outputKey: targetOutputKey, sourceKey, transcribe } = params;

  if (force) {
    try {
      await transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: jobName }));
    } catch {
      // If it does not exist, there is nothing to delete.
    }
  }

  try {
    await transcribe.send(
      new StartTranscriptionJobCommand({
        LanguageCode: languageCode,
        Media: { MediaFileUri: s3Uri(bucket, sourceKey) },
        MediaFormat: "mp4",
        OutputBucketName: bucket,
        OutputKey: targetOutputKey,
        TranscriptionJobName: jobName,
      })
    );
  } catch (error) {
    if (!(error instanceof ConflictException)) {
      throw error;
    }
  }

  while (true) {
    const { TranscriptionJob: job } = await transcribe.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
    );

    const status = job?.TranscriptionJobStatus;
    if (status === "COMPLETED") return;
    if (status === "FAILED") {
      throw new Error(job?.FailureReason ?? `Transcription job failed: ${jobName}`);
    }

    process.stdout.write(".");
    await wait(POLL_INTERVAL_MS);
  }
}

async function readTranscriptFromS3(s3: S3Client, bucket: string, key: string) {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const rawJson = await bodyToString(object.Body);
  const parsed = JSON.parse(rawJson);
  const transcript = parsed?.results?.transcripts?.[0]?.transcript;
  if (typeof transcript !== "string" || !transcript.trim()) {
    throw new Error(`No transcript text found in ${key}`);
  }
  return transcript.trim();
}

async function downloadS3Object(s3: S3Client, bucket: string, key: string, targetPath: string) {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body) throw new Error(`Missing S3 body for ${key}`);

  if (object.Body instanceof Readable) {
    await pipeline(object.Body, fs.createWriteStream(targetPath));
    return;
  }

  const text = await bodyToString(object.Body);
  await fsp.writeFile(targetPath, text);
}

async function extractAudioForOpenRouter(videoPath: string, audioPath: string) {
  await execFile("ffmpeg", [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "48k",
    audioPath,
  ]);
}

async function extractAudioForLocal(sourceUrl: string, audioPath: string) {
  try {
    await execFile("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      sourceUrl,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      audioPath,
    ]);
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim()
        : "";
    throw new Error(`ffmpeg audio extraction failed${stderr ? `: ${sanitizeLogMessage(stderr)}` : "."}`);
  }
}

function localTranscribePython() {
  return (
    process.env.LOCAL_TRANSCRIBE_PYTHON?.trim() ||
    path.join(process.cwd(), ".local-data", "miss-asha", "venv", "bin", "python")
  );
}

function localTranscribeScript() {
  return process.env.LOCAL_TRANSCRIBE_SCRIPT?.trim() || path.join(process.cwd(), "scripts", "local-whisper-transcribe.py");
}

function localTranscriptModel() {
  return process.env.LOCAL_TRANSCRIPT_MODEL?.trim() || DEFAULT_LOCAL_TRANSCRIPT_MODEL;
}

async function transcribeWithLocal(params: {
  bucket: string;
  language: "English" | "Hindi";
  s3: S3Client;
  sourceKey: string;
  videoTitle: string;
}) {
  const tempRoot = process.env.MISS_ASHA_TMP_DIR?.trim() || os.tmpdir();
  const tempDir = await fsp.mkdtemp(path.join(tempRoot, "miss-asha-local-"));
  const audioPath = path.join(tempDir, "audio.mp3");
  const outputPath = path.join(tempDir, "transcript.json");

  try {
    const sourceUrl = await getSignedUrl(
      params.s3,
      new GetObjectCommand({ Bucket: params.bucket, Key: params.sourceKey }),
      { expiresIn: 3600 }
    );

    try {
      await extractAudioForLocal(sourceUrl, audioPath);
    } catch (error) {
      const message = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
      if (isNoAudioExtractionError(message)) {
        return noAudioTranscript(params.videoTitle);
      }
      throw error;
    }

    await execFile(
      localTranscribePython(),
      [
        localTranscribeScript(),
        "--audio",
        audioPath,
        "--language",
        params.language === "Hindi" ? "hi" : "en",
        "--model",
        localTranscriptModel(),
        "--title",
        params.videoTitle,
        "--output",
        outputPath,
      ],
      {
        env: {
          ...process.env,
          HF_HOME: process.env.HF_HOME || path.join(process.cwd(), ".local-data", "miss-asha", "hf-cache"),
        },
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    const parsed = JSON.parse(await fsp.readFile(outputPath, "utf8"));
    const transcript = parsed?.text;
    if (typeof transcript !== "string" || !transcript.trim()) {
      throw new Error("Local transcriber returned an empty transcript.");
    }
    return transcript.trim();
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

async function transcribeWithOpenRouter(params: {
  bucket: string;
  language: "English" | "Hindi";
  s3: S3Client;
  sourceKey: string;
  videoTitle: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY for --provider openrouter.");

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "miss-asha-transcript-"));
  const videoPath = path.join(tempDir, "source.mp4");
  const audioPath = path.join(tempDir, "audio.mp3");

  try {
    await downloadS3Object(params.s3, params.bucket, params.sourceKey, videoPath);
    await extractAudioForOpenRouter(videoPath, audioPath);
    const audio = await fsp.readFile(audioPath);
    const model = process.env.OPENROUTER_TRANSCRIPT_MODEL?.trim() || DEFAULT_TRANSCRIPT_MODEL;
    const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://edufleet.in",
        "X-Title": "EduFleet Miss Asha Transcript Builder",
      },
      body: JSON.stringify({
        model,
        max_tokens: 12000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  `Transcribe this ${params.language} school lesson audio exactly.`,
                  `Lesson title: ${params.videoTitle}`,
                  "Return only the transcript text. Do not summarize.",
                ].join("\n"),
              },
              {
                type: "input_audio",
                input_audio: {
                  data: audio.toString("base64"),
                  format: "mp3",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter transcription failed: ${text}`);
    }

    const data = await response.json();
    const transcript = data?.choices?.[0]?.message?.content;
    if (typeof transcript !== "string" || !transcript.trim()) {
      throw new Error("OpenRouter returned an empty transcript.");
    }
    return transcript.trim();
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
}

async function summarizeTranscript(params: {
  language: "English" | "Hindi";
  transcript: string;
  videoTitle: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return { summary: null, keyPoints: null };

  const model =
    process.env.OPENROUTER_NOTES_MODEL?.trim() ||
    process.env.OPENROUTER_TRANSCRIPT_MODEL?.trim() ||
    DEFAULT_TRANSCRIPT_MODEL;
  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://edufleet.in",
      "X-Title": "EduFleet Miss Asha Transcript Builder",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Create compact study notes for a school lesson transcript. Return only JSON with keys summary and key_points. key_points should be a short bullet list string.",
        },
        {
          role: "user",
          content: [
            `Lesson title: ${params.videoTitle}`,
            `Language: ${params.language}`,
            "Transcript:",
            params.transcript.slice(0, TRANSCRIPT_SUMMARY_CHARS),
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter summary failed: ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return { summary: null, keyPoints: null };

  try {
    const parsed = parseJsonObject(content);
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : null,
      keyPoints: typeof parsed.key_points === "string" ? parsed.key_points.trim() : null,
    };
  } catch {
    return { summary: content.trim(), keyPoints: null };
  }
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 24);
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 3).trim()}...`;
}

function buildExtractiveNotes(params: { transcript: string; videoTitle: string }) {
  const sentences = splitSentences(params.transcript);
  const summarySource = sentences.slice(0, 3).join(" ") || params.transcript.replace(/\s+/g, " ").trim();
  const keyPointSentences = sentences.slice(0, 6);

  return {
    summary: truncateText(summarySource, 700),
    keyPoints: keyPointSentences.length
      ? keyPointSentences.map((sentence) => `- ${truncateText(sentence, 220)}`).join("\n")
      : `- Transcript available for ${params.videoTitle}.`,
  };
}

async function upsertNote(params: {
  keyPoints: string | null;
  language: "English" | "Hindi";
  summary: string | null;
  supabase: ReturnType<typeof createClient>;
  transcript: string;
  videoId: string;
}) {
  const { error } = await params.supabase.from("ai_video_notes").upsert(
    {
      key_points: params.keyPoints,
      language: params.language,
      summary: params.summary,
      transcript: params.transcript,
      updated_at: new Date().toISOString(),
      video_id: params.videoId,
    },
    { onConflict: "video_id,language" }
  );

  if (error) throw error;
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const args = parseArgs(process.argv.slice(2));
  const region = getEnv("AWS_REGION");
  const bucket = getEnv("S3_BUCKET_NAME");
  const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const awsCredentials = {
    accessKeyId: getEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: getEnv("AWS_SECRET_ACCESS_KEY"),
  };
  const s3 = new S3Client({ region, credentials: awsCredentials });
  const transcribe = new TranscribeClient({ region, credentials: awsCredentials });

  const videos = await loadVideos(supabase, args);
  console.log(`Found ${videos.length} video row(s).`);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const video of videos) {
    for (const variant of args.variants) {
      try {
        const sourceKey = variant === "hindi" ? video.s3_key_hindi : video.s3_key;
        if (!sourceKey) {
          skipped += 1;
          console.log(`Skip ${video.title} (${variant}): no S3 key.`);
          continue;
        }

        const { code: languageCode, label: language } = languageForVariant(variant);
        const existing = await getExistingNote(supabase, video.id, language);
        if (args.skipExisting && existing?.transcript) {
          skipped += 1;
          console.log(`Skip ${video.title} (${language}): transcript already exists.`);
          continue;
        }

        const jobName = transcribeJobName(video.id, variant, sourceKey);
        const targetOutputKey = outputKey(video.id, variant);
        const title = variant === "hindi" && video.title_hindi ? video.title_hindi : video.title;

        const reusableNote = await getReusableNoteForSourceKey({
          language,
          sourceKey,
          supabase,
          videoId: video.id,
        });
        if (reusableNote) {
          const copiedRows = await upsertMatchingSourceNotes({
            keyPoints: reusableNote.key_points,
            language,
            sourceKey,
            summary: reusableNote.summary,
            supabase,
            transcript: reusableNote.transcript,
            videoId: video.id,
          });
          processed += 1;
          console.log(`Reuse ${title} (${language}): copied transcript to ${copiedRows} matching S3 row(s).`);
          continue;
        }

        console.log(`\n${args.dryRun ? "Would process" : "Processing"}: ${title} (${language})`);
        console.log(`S3: ${sourceKey}`);

        if (args.dryRun) {
          processed += 1;
          continue;
        }

        let transcript: string | null = null;
        for (let attempt = 1; attempt <= TRANSCRIPTION_ATTEMPTS; attempt += 1) {
          try {
            if (args.provider === "local") {
              transcript = await transcribeWithLocal({
                bucket,
                language,
                s3,
                sourceKey,
                videoTitle: title,
              });
            } else if (args.provider === "openrouter") {
              transcript = await transcribeWithOpenRouter({
                bucket,
                language,
                s3,
                sourceKey,
                videoTitle: title,
              });
            } else {
              await startOrResumeTranscription({
                bucket,
                force: args.force,
                jobName,
                languageCode,
                outputKey: targetOutputKey,
                sourceKey,
                transcribe,
              });
              console.log("\nTranscription complete.");
              transcript = await readTranscriptFromS3(s3, bucket, targetOutputKey);
            }
            break;
          } catch (error) {
            if (attempt >= TRANSCRIPTION_ATTEMPTS) throw error;
            const message = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
            console.log(`Retry ${attempt}/${TRANSCRIPTION_ATTEMPTS} for ${title}: ${message}`);
            await wait(3000 * attempt);
          }
        }

        if (!transcript) {
          throw new Error("Transcript was empty after retries.");
        }

        let notes = { summary: null as string | null, keyPoints: null as string | null };
        if (args.summarize) {
          try {
            notes =
              args.provider === "local"
                ? buildExtractiveNotes({ transcript, videoTitle: title })
                : await summarizeTranscript({ language, transcript, videoTitle: title });
          } catch (error) {
            const message = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
            console.log(`Summary failed for ${title}; saving transcript only. ${message}`);
          }
        }

        const copiedRows = await upsertMatchingSourceNotes({
          keyPoints: notes.keyPoints,
          language,
          sourceKey,
          summary: notes.summary,
          supabase,
          transcript,
          videoId: video.id,
        });

        processed += 1;
        console.log(
          `Saved ${transcript.length.toLocaleString()} transcript chars for ${title} into ${copiedRows} matching S3 row(s).`
        );
      } catch (error) {
        failed += 1;
        const message = sanitizeLogMessage(error instanceof Error ? error.message : String(error));
        console.log(`Failed ${video.title} (${variant}): ${message}`);
      }
    }
  }

  console.log(`\nDone. Processed ${processed}, skipped ${skipped}, failed ${failed}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
