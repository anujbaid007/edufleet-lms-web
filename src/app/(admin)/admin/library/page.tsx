import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContentLibraryBrowser, type LibraryChapterCard } from "@/components/admin/content-library-browser";

export const metadata = { title: "Content Library" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type ChapterRow = {
  id: string;
  class: number;
  board: string;
  medium: string;
  chapter_no: number;
  title: string;
  subject_id: string;
  subjects: { name: string } | null;
};

type VideoRow = {
  id: string;
  title: string;
  duration_seconds: number | null;
  sort_order: number;
  chapter_id: string;
  s3_key: string | null;
};

const loadContentLibraryCards = unstable_cache(
  async (): Promise<LibraryChapterCard[]> => {
    const admin = createAdminClient();

    const [{ count: chapterCount }, { count: videoCount }] = await Promise.all([
      admin.from("chapters").select("*", { count: "exact", head: true }),
      admin.from("videos").select("*", { count: "exact", head: true }),
    ]);

    const chapterRanges = Array.from(
      { length: Math.ceil((chapterCount ?? 0) / PAGE_SIZE) },
      (_, index) => [index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1] as const
    );
    const videoRanges = Array.from(
      { length: Math.ceil((videoCount ?? 0) / PAGE_SIZE) },
      (_, index) => [index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1] as const
    );

    const [chapterPages, videoPages] = await Promise.all([
      Promise.all(
        chapterRanges.map(([from, to]) =>
          admin
            .from("chapters")
            .select("id, class, board, medium, chapter_no, title, subject_id, subjects(name)")
            .order("class")
            .order("chapter_no")
            .range(from, to)
        )
      ),
      Promise.all(
        videoRanges.map(([from, to]) =>
          admin
            .from("videos")
            .select("id, title, duration_seconds, sort_order, chapter_id, s3_key")
            .order("chapter_id")
            .order("sort_order")
            .range(from, to)
        )
      ),
    ]);

    const chapters = chapterPages.flatMap((page) => (page.data ?? []) as unknown as ChapterRow[]);
    const videos = videoPages.flatMap((page) => (page.data ?? []) as VideoRow[]);

    const videoSummaryByChapter = new Map<
      string,
      {
        videoCount: number;
        previewVideo:
          | {
              id: string;
              title: string;
              durationSeconds: number;
              s3Key: string | null;
            }
          | null;
      }
    >();

    for (const video of videos) {
      const current = videoSummaryByChapter.get(video.chapter_id);
      if (!current) {
        videoSummaryByChapter.set(video.chapter_id, {
          videoCount: 1,
          previewVideo: {
            id: video.id,
            title: video.title,
            durationSeconds: video.duration_seconds ?? 0,
            s3Key: video.s3_key,
          },
        });
        continue;
      }

      current.videoCount += 1;
    }

    return chapters
      .map((chapter) => {
        const videoSummary = videoSummaryByChapter.get(chapter.id);

        return {
          id: chapter.id,
          chapterNo: chapter.chapter_no,
          title: chapter.title,
          subjectName: (chapter.subjects as { name: string } | null)?.name ?? "Unknown",
          classNum: chapter.class,
          board: chapter.board,
          medium: chapter.medium,
          videoCount: videoSummary?.videoCount ?? 0,
          previewVideo: videoSummary?.previewVideo ?? null,
        } satisfies LibraryChapterCard;
      })
      .filter((chapter) => chapter.videoCount > 0)
      .sort((left, right) => {
        if (left.classNum !== right.classNum) return left.classNum - right.classNum;
        if (left.medium !== right.medium) return left.medium.localeCompare(right.medium);
        if (left.subjectName !== right.subjectName) return left.subjectName.localeCompare(right.subjectName);
        return left.chapterNo - right.chapterNo;
      });
  },
  ["admin-content-library-cards-v2"],
  { revalidate: 3600 }
);

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const chapters = await loadContentLibraryCards();

  return <ContentLibraryBrowser chapters={chapters} />;
}
