/**
 * EduFleet Pen Drive Content Preparation CLI
 *
 * Usage:
 *   npx tsx scripts/pendrive-prepare.ts --class 6,7,8 --medium English --board CBSE --output /Volumes/USB_DRIVE
 *
 * What it does:
 *   1. Fetches chapters, videos, quizzes, questions from Supabase
 *   2. Downloads video files from S3
 *   3. Encrypts everything with AES-256-CBC(SHA256(KEY_A + KEY_B))
 *   4. Writes to --output/.edufleet/ with randomized filenames
 *   5. Generates and encrypts the manifest (content index with all UUIDs)
 *
 * Required env vars (from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME
 *   KEY_A, KEY_B
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from project root
config({ path: resolve(__dirname, "../.env.local") });

// Also load KEY_A and KEY_B from .env.pendrive if it exists
config({ path: resolve(__dirname, "../.env.pendrive"), override: true });

import { fetchChapters, fetchVideos, fetchQuizzes, fetchQuestions } from "./pendrive/catalog";
import { deriveKey } from "./pendrive/crypto";
import { downloadFromS3 } from "./pendrive/download";
import { buildManifest } from "./pendrive/manifest";
import { ensureOutputDir, writeManifest, writeEncryptedVideo, writeEncryptedQuiz } from "./pendrive/writer";

// ─── Parse args ───

function parseArgs() {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value) map.set(key, value);
  }

  const classArg = map.get("class");
  const medium = map.get("medium") ?? "English";
  const board = map.get("board") ?? "CBSE";
  const output = map.get("output");

  if (!classArg || !output) {
    console.error("Usage: npx tsx scripts/pendrive-prepare.ts --class 6,7,8 --medium English --board CBSE --output /path/to/usb");
    process.exit(1);
  }

  const classes = classArg.split(",").map(Number).filter((n) => !isNaN(n));
  if (!classes.length) {
    console.error("Error: --class must be comma-separated numbers (e.g. 6,7,8)");
    process.exit(1);
  }

  return { classes, medium, board, output };
}

// ─── Validate env ───

function validateEnv() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET_NAME",
    "KEY_A",
    "KEY_B",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    console.error("Set them in .env.local or .env.pendrive");
    process.exit(1);
  }
}

// ─── Main ───

async function main() {
  const { classes, medium, board, output } = parseArgs();
  validateEnv();

  console.log(`\n📦 EduFleet Pen Drive Preparation`);
  console.log(`   Classes: ${classes.map((c) => c === 0 ? "KG" : `Class ${c}`).join(", ")}`);
  console.log(`   Board: ${board}`);
  console.log(`   Medium: ${medium}`);
  console.log(`   Output: ${output}\n`);

  // 1. Fetch catalog
  console.log("1/5  Fetching content catalog from Supabase...");
  const chapters = await fetchChapters(classes, board, medium);
  console.log(`     ${chapters.length} chapters found`);

  const chapterIds = chapters.map((c) => c.id);
  const [videos, quizzes] = await Promise.all([
    fetchVideos(chapterIds),
    fetchQuizzes(chapterIds),
  ]);
  console.log(`     ${videos.length} videos, ${quizzes.length} quizzes`);

  const questions = await fetchQuestions(quizzes.map((q) => q.id));
  console.log(`     ${questions.length} quiz questions`);

  if (!videos.length) {
    console.error("\nError: No videos found for the given class/board/medium. Nothing to write.");
    process.exit(1);
  }

  // 2. Build manifest
  console.log("\n2/5  Building manifest...");
  const { manifest, fileMappings } = buildManifest(chapters, videos, quizzes, questions, medium);
  console.log(`     ${manifest.content.length} entries, drive_id: ${manifest.drive_id}`);

  // 3. Derive encryption key
  console.log("\n3/5  Deriving encryption key...");
  const key = deriveKey();

  // 4. Download and encrypt videos
  console.log(`\n4/5  Downloading and encrypting ${fileMappings.length} videos...`);
  const outputDir = ensureOutputDir(output);
  let downloaded = 0;

  for (const mapping of fileMappings) {
    downloaded++;
    const progress = `[${downloaded}/${fileMappings.length}]`;
    process.stdout.write(`     ${progress} ${mapping.s3Key}...`);

    try {
      const videoData = await downloadFromS3(mapping.s3Key);
      writeEncryptedVideo(videoData, mapping.encryptedName, key, outputDir);
      console.log(` ${(videoData.length / 1024 / 1024).toFixed(1)} MB ✓`);
    } catch (error) {
      console.log(` FAILED`);
      console.error(`     Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // 5. Write encrypted quizzes + manifest
  console.log("\n5/5  Writing quizzes and manifest...");
  const quizEntries = manifest.content.filter((e) => e.type === "quiz");
  for (const entry of quizEntries) {
    writeEncryptedQuiz(entry, key, outputDir);
  }
  console.log(`     ${quizEntries.length} quizzes encrypted`);

  writeManifest(manifest, key, outputDir);
  console.log(`     manifest.enc written`);

  // Summary
  const totalEntries = manifest.content.length;
  const totalVideos = fileMappings.length;
  const totalQuizzes = quizEntries.length;
  console.log(`\n✅ Done! Pen drive ready at ${output}`);
  console.log(`   ${totalEntries} files (${totalVideos} videos, ${totalQuizzes} quizzes)`);
  console.log(`   Drive ID: ${manifest.drive_id}`);
  console.log(`   Encrypted with AES-256-CBC\n`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
