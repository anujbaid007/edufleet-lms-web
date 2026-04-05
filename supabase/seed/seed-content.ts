import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import * as path from "path";

// Usage: npx tsx supabase/seed/seed-content.ts
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const s3SubjectAliases: Record<string, string> = {
  Mathematics: "Maths",
};

function getS3SubjectName(subject: string): string {
  return s3SubjectAliases[subject] ?? subject;
}

// S3 key pattern: {Medium}/{Class}/{Subject}/{ChapterNo}. {ChapterTitle}/{VideoOrder}. {VideoTitle}.mp4
function buildS3Key(medium: string, classNum: number | string, subject: string, chapterNo: number, chapterTitle: string, videoOrder: number, videoTitle: string): string {
  const classStr = classNum === 0 ? "KG" : String(classNum);
  return `${medium}/${classStr}/${getS3SubjectName(subject)}/${chapterNo}. ${chapterTitle}/${videoOrder}. ${videoTitle}.mp4`;
}

function parseDuration(dur: string | null): number {
  if (!dur) return 0;
  const parts = dur.split(":");
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  return 0;
}

async function main() {
  const tocPath = path.join(__dirname, "TOC_updated.xlsx");
  const workbook = XLSX.readFile(tocPath);

  // ── Step 1: Extract unique subjects from "Chapter List-982" ──
  const masterSheet = workbook.Sheets["Chapter List-982"];
  const masterRows: any[] = XLSX.utils.sheet_to_json(masterSheet, { header: 1 });

  const subjectSet = new Set<string>();
  const subjectHindiMap = new Map<string, string>();

  for (let i = 1; i < masterRows.length; i++) {
    const row = masterRows[i];
    const subEng = row[2]?.toString().trim();
    const subHindi = row[4]?.toString().trim();
    if (subEng) {
      subjectSet.add(subEng);
      if (subHindi) subjectHindiMap.set(subEng, subHindi);
    }
  }

  // Insert subjects
  const subjectNameToId = new Map<string, string>();
  let displayOrder = 0;

  for (const name of subjectSet) {
    displayOrder++;
    const { data, error } = await supabase
      .from("subjects")
      .upsert({ name, name_hindi: subjectHindiMap.get(name) || null, display_order: displayOrder }, { onConflict: "name" })
      .select("id")
      .single();

    if (error) {
      console.error(`Failed to insert subject "${name}":`, error.message);
      continue;
    }
    subjectNameToId.set(name, data.id);
    console.log(`Subject: ${name} → ${data.id}`);
  }

  // ── Step 2: Parse per-class sheets for chapters + videos ──
  const classSheets = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

  for (const sheetName of classSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.log(`Sheet "${sheetName}" not found, skipping`);
      continue;
    }

    const classNum = parseInt(sheetName, 10);
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let currentSubject: string | null = null;
    let currentChapter: string | null = null;
    let currentChapterHindi: string | null = null;
    let currentChapterNo = 0;
    let videoOrder = 0;
    let chapterId: string | null = null;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Skip fully empty rows
      if (!row || (!row[0] && !row[1] && !row[2])) continue;

      // New subject?
      if (row[0]) {
        currentSubject = row[0].toString().trim();
      }

      if (!currentSubject) continue;
      const subjectId = subjectNameToId.get(currentSubject);
      if (!subjectId) {
        console.warn(`Unknown subject "${currentSubject}" in sheet ${sheetName}, skipping`);
        continue;
      }

      // New chapter?
      if (row[1]) {
        currentChapter = row[1].toString().trim();
        currentChapterHindi = row[5]?.toString().trim() || null;

        // Extract chapter number from title like "1. A Happy Child"
        const match = currentChapter.match(/^(\d+)\.\s*(.+)/);
        if (match) {
          currentChapterNo = parseInt(match[1], 10);
          currentChapter = match[2].trim();
          if (currentChapterHindi) {
            const hindiMatch = currentChapterHindi.match(/^(\d+)\.\s*(.+)/);
            if (hindiMatch) currentChapterHindi = hindiMatch[2].trim();
          }
        } else {
          currentChapterNo++;
        }

        videoOrder = 0;

        // Insert chapter
        const { data, error } = await supabase
          .from("chapters")
          .upsert(
            {
              subject_id: subjectId,
              class: classNum,
              board: "CBSE",
              medium: "English",
              chapter_no: currentChapterNo,
              title: currentChapter,
              title_hindi: currentChapterHindi,
            },
            { onConflict: "subject_id,class,board,medium,chapter_no" }
          )
          .select("id")
          .single();

        if (error) {
          console.error(`Failed to insert chapter "${currentChapter}":`, error.message);
          chapterId = null;
          continue;
        }
        chapterId = data.id;
        console.log(`  Class ${classNum} / ${currentSubject} / Ch.${currentChapterNo}: ${currentChapter} → ${data.id}`);
      }

      // Video (sub-topic)
      if (row[2] && chapterId) {
        videoOrder++;
        const videoTitleRaw = row[2].toString().trim();
        const videoTitleHindi = row[6]?.toString().trim() || null;
        const durationEng = row[3]?.toString() || null;
        const durationHindi = row[7]?.toString() || null;

        // Strip leading number from video title "1. Introduction" → "Introduction"
        const vMatch = videoTitleRaw.match(/^(\d+)\.\s*(.+)/);
        const videoTitle = vMatch ? vMatch[2].trim() : videoTitleRaw;
        const videoTitleHindiClean = videoTitleHindi
          ? (videoTitleHindi.match(/^(\d+)\.\s*(.+)/)?.[2]?.trim() || videoTitleHindi)
          : null;

        const s3Key = buildS3Key("English", classNum, currentSubject, currentChapterNo, currentChapter!, videoOrder, videoTitle);
        const s3KeyHindi = videoTitleHindiClean
          ? buildS3Key("Hindi", classNum, currentSubject, currentChapterNo, currentChapterHindi || currentChapter!, videoOrder, videoTitleHindiClean)
          : null;

        const { error } = await supabase.from("videos").upsert(
          {
            chapter_id: chapterId,
            title: videoTitle,
            title_hindi: videoTitleHindiClean,
            s3_key: s3Key,
            s3_key_hindi: s3KeyHindi,
            duration_seconds: parseDuration(durationEng),
            duration_seconds_hindi: durationHindi ? parseDuration(durationHindi) : null,
            sort_order: videoOrder,
          },
          { onConflict: "chapter_id,sort_order", ignoreDuplicates: false }
        );

        if (error) {
          console.error(`    Failed to insert video "${videoTitle}":`, error.message);
        }
      }
    }
  }

  // ── Step 3: Handle KG (from Chapter List sheet) ──
  const kgSubjectId = subjectNameToId.get("Pre-Nursery");
  if (kgSubjectId) {
    let kgChapterNo = 0;
    for (let i = 1; i < masterRows.length; i++) {
      const row = masterRows[i];
      if (row[1] === "KG" && row[2] === "Pre-Nursery" && row[3]) {
        kgChapterNo++;
        const titleRaw = row[3].toString().trim();
        const titleHindi = row[5]?.toString().trim() || null;
        const match = titleRaw.match(/^(\d+)\.\s*(.+)/);
        const title = match ? match[2].trim() : titleRaw;
        const chNo = match ? parseInt(match[1], 10) : kgChapterNo;

        const titleHindiClean = titleHindi
          ? (titleHindi.match(/^(\d+)\.\s*(.+)/)?.[2]?.trim() || titleHindi)
          : null;

        const { data, error } = await supabase
          .from("chapters")
          .upsert(
            {
              subject_id: kgSubjectId,
              class: 0,
              board: "CBSE",
              medium: "English",
              chapter_no: chNo,
              title,
              title_hindi: titleHindiClean,
            },
            { onConflict: "subject_id,class,board,medium,chapter_no" }
          )
          .select("id")
          .single();

        if (error) {
          console.error(`Failed to insert KG chapter "${title}":`, error.message);
          continue;
        }

        // KG chapters don't have sub-topics in the per-class sheets,
        // so create one video per chapter (the chapter IS the video)
        const s3Key = buildS3Key("English", "KG", "Pre-Nursery", chNo, title, 1, title);
        await supabase.from("videos").upsert({
          chapter_id: data.id,
          title,
          title_hindi: titleHindiClean,
          s3_key: s3Key,
          s3_key_hindi: null,
          duration_seconds: 0,
          sort_order: 1,
        }, { onConflict: "chapter_id,sort_order", ignoreDuplicates: false });

        console.log(`  KG / Pre-Nursery / Ch.${chNo}: ${title}`);
      }
    }
  }

  console.log("\nSeed complete!");
}

main().catch(console.error);
