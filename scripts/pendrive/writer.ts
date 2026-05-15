import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { encrypt, encryptJson } from "./crypto";
import type { Manifest, ManifestEntry } from "./manifest";

/** Write the encrypted manifest to the output directory. */
export function writeManifest(manifest: Manifest, key: Buffer, outputDir: string): void {
  const encryptedManifest = encryptJson(manifest, key);
  writeFileSync(join(outputDir, "manifest.enc"), encryptedManifest);
}

/** Write an encrypted video file. */
export function writeEncryptedVideo(
  videoData: Buffer,
  encryptedName: string,
  key: Buffer,
  outputDir: string,
): void {
  const encrypted = encrypt(videoData, key);
  writeFileSync(join(outputDir, encryptedName), encrypted);
}

/** Write an encrypted quiz file (quiz questions as JSON). */
export function writeEncryptedQuiz(
  entry: ManifestEntry,
  key: Buffer,
  outputDir: string,
): void {
  if (!entry.questions?.length) return;
  const quizData = {
    quiz_id: entry.quiz_id,
    chapter_id: entry.chapter_id,
    questions: entry.questions,
  };
  const encrypted = encryptJson(quizData, key);
  writeFileSync(join(outputDir, entry.file), encrypted);
}

/** Ensure the .edufleet output directory exists. */
export function ensureOutputDir(outputPath: string): string {
  const edufleetDir = join(outputPath, ".edufleet");
  mkdirSync(edufleetDir, { recursive: true });
  return edufleetDir;
}
