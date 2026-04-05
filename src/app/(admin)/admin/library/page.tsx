import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/dashboard/header";
import { ContentLibraryTree } from "@/components/admin/content-library-tree";

export const metadata = { title: "Content Library" };

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  // Fetch chapters (paginated, ~1857 rows = 2 requests) and video counts (single RPC)
  type ChapterRow = { id: string; class: number; medium: string; chapter_no: number; title: string; subject_id: string; subjects: { name: string } | null };

  // Run chapters pagination and video counts RPC in parallel
  const videoCounts$ = supabase.rpc("get_video_counts_by_chapter");

  let chapters: ChapterRow[] = [];
  {
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("chapters")
        .select("id, class, medium, chapter_no, title, subject_id, subjects(name)")
        .order("class")
        .order("chapter_no")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      chapters = chapters.concat(data as unknown as ChapterRow[]);
      if (data.length < 1000) break;
      from += 1000;
    }
  }

  const { data: videoCounts } = await videoCounts$;

  // Build video count per chapter from RPC result
  const videoCountMap = new Map<string, number>();
  let totalVideos = 0;
  for (const row of videoCounts ?? []) {
    videoCountMap.set(row.chapter_id, Number(row.video_count));
    totalVideos += Number(row.video_count);
  }

  // Build nested tree: Class → Medium → Subject → Chapters (with video counts)
  type ChapterItem = {
    id: string;
    chapterNo: number;
    title: string;
    videoCount: number;
  };
  type SubjectGroup = {
    subjectName: string;
    chapters: ChapterItem[];
    totalVideos: number;
  };
  type MediumGroup = {
    medium: string;
    subjects: SubjectGroup[];
    totalChapters: number;
    totalVideos: number;
  };
  type ClassGroup = {
    classNum: number;
    mediums: MediumGroup[];
    totalChapters: number;
    totalVideos: number;
  };

  const classMap = new Map<number, Map<string, Map<string, ChapterItem[]>>>();

  for (const ch of chapters) {
    const subName = (ch.subjects as unknown as { name: string } | null)?.name ?? "Unknown";
    if (!classMap.has(ch.class)) classMap.set(ch.class, new Map());
    const mediumMap = classMap.get(ch.class)!;
    if (!mediumMap.has(ch.medium)) mediumMap.set(ch.medium, new Map());
    const subjectMap = mediumMap.get(ch.medium)!;
    if (!subjectMap.has(subName)) subjectMap.set(subName, []);
    subjectMap.get(subName)!.push({
      id: ch.id,
      chapterNo: ch.chapter_no,
      title: ch.title,
      videoCount: videoCountMap.get(ch.id) || 0,
    });
  }

  const tree: ClassGroup[] = Array.from(classMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([classNum, mediumMap]) => {
      const mediums: MediumGroup[] = Array.from(mediumMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([medium, subjectMap]) => {
          const subjects: SubjectGroup[] = Array.from(subjectMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([subjectName, chaps]) => ({
              subjectName,
              chapters: chaps.sort((a, b) => a.chapterNo - b.chapterNo),
              totalVideos: chaps.reduce((s, c) => s + c.videoCount, 0),
            }));
          return {
            medium,
            subjects,
            totalChapters: subjects.reduce((s, sub) => s + sub.chapters.length, 0),
            totalVideos: subjects.reduce((s, sub) => s + sub.totalVideos, 0),
          };
        });
      return {
        classNum,
        mediums,
        totalChapters: mediums.reduce((s, m) => s + m.totalChapters, 0),
        totalVideos: mediums.reduce((s, m) => s + m.totalVideos, 0),
      };
    });

  return (
    <div className="space-y-6">
      <Header
        title="Content Library"
        subtitle={`${chapters.length} chapters · ${totalVideos} videos across ${classMap.size} classes`}
      />
      <ContentLibraryTree tree={tree} />
    </div>
  );
}
