import { unstable_cache } from "next/cache";
import { redirect } from "next/navigation";
import { ContentLibraryViewSwitcher } from "@/components/admin/content-library-view-switcher";
import { type LibraryChapterCard } from "@/components/admin/content-library-browser";
import { type ClassGroup, type ChapterItem } from "@/components/admin/content-library-tree";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  title_hindi: string | null;
  subject_id: string;
  subjects: { name: string } | null;
};

type VideoRow = {
  id: string;
  title: string;
  title_hindi: string | null;
  duration_seconds: number | null;
  sort_order: number;
  chapter_id: string;
  s3_key: string | null;
  s3_key_hindi: string | null;
};

type LibraryPayload = {
  chapters: LibraryChapterCard[];
  tree: ClassGroup[];
  stats: {
    chapterCount: number;
    videoCount: number;
    classCount: number;
  };
};

const loadContentLibraryData = unstable_cache(
  async (): Promise<LibraryPayload> => {
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
            .select("id, class, board, medium, chapter_no, title, title_hindi, subject_id, subjects(name)")
            .order("class")
            .order("chapter_no")
            .range(from, to)
        )
      ),
      Promise.all(
        videoRanges.map(([from, to]) =>
          admin
            .from("videos")
            .select("id, title, title_hindi, duration_seconds, sort_order, chapter_id, s3_key, s3_key_hindi")
            .order("chapter_id")
            .order("sort_order")
            .range(from, to)
        )
      ),
    ]);

    const chapters = chapterPages.flatMap((page) => (page.data ?? []) as unknown as ChapterRow[]);
    const videos = videoPages.flatMap((page) => (page.data ?? []) as VideoRow[]);

    const videosByChapter = new Map<string, VideoRow[]>();
    for (const video of videos) {
      const group = videosByChapter.get(video.chapter_id);
      if (group) {
        group.push(video);
      } else {
        videosByChapter.set(video.chapter_id, [video]);
      }
    }

    const classMap = new Map<number, Map<string, Map<string, ChapterItem[]>>>();

    const chapterCards = chapters
      .map<LibraryChapterCard | null>((chapter) => {
        const subjectName = (chapter.subjects as { name: string } | null)?.name ?? "Unknown";
        const chapterVideos = (videosByChapter.get(chapter.id) ?? []).sort((left, right) => left.sort_order - right.sort_order);
        if (chapterVideos.length === 0) return null;
        const chapterTitle = chapter.medium === "Hindi" && chapter.title_hindi ? chapter.title_hindi : chapter.title;

        const chapterItem: ChapterItem = {
          id: chapter.id,
          chapterNo: chapter.chapter_no,
          title: chapterTitle,
          videoCount: chapterVideos.length,
          classNum: chapter.class,
          medium: chapter.medium,
          subjectName,
          videos: chapterVideos.map((video) => ({
            id: video.id,
            title: chapter.medium === "Hindi" && video.title_hindi ? video.title_hindi : video.title,
            durationSeconds: video.duration_seconds ?? 0,
            s3Key: chapter.medium === "Hindi" && video.s3_key_hindi ? video.s3_key_hindi : video.s3_key,
            playbackVariant: chapter.medium === "Hindi" && video.s3_key_hindi ? "hindi" : "default",
            sortOrder: video.sort_order,
          })),
        };

        if (!classMap.has(chapter.class)) classMap.set(chapter.class, new Map());
        const mediumMap = classMap.get(chapter.class)!;
        if (!mediumMap.has(chapter.medium)) mediumMap.set(chapter.medium, new Map());
        const subjectMap = mediumMap.get(chapter.medium)!;
        if (!subjectMap.has(subjectName)) subjectMap.set(subjectName, []);
        subjectMap.get(subjectName)!.push(chapterItem);

        return {
          id: chapter.id,
          chapterNo: chapter.chapter_no,
          title: chapterTitle,
          subjectName,
          classNum: chapter.class,
          board: chapter.board,
          medium: chapter.medium,
          videoCount: chapterVideos.length,
          previewVideo: {
            id: chapterVideos[0].id,
            title: chapter.medium === "Hindi" && chapterVideos[0].title_hindi ? chapterVideos[0].title_hindi : chapterVideos[0].title,
            durationSeconds: chapterVideos[0].duration_seconds ?? 0,
            s3Key: chapter.medium === "Hindi" && chapterVideos[0].s3_key_hindi ? chapterVideos[0].s3_key_hindi : chapterVideos[0].s3_key,
            playbackVariant: chapter.medium === "Hindi" && chapterVideos[0].s3_key_hindi ? "hindi" : "default",
          },
        } satisfies LibraryChapterCard;
      })
      .filter((chapter): chapter is LibraryChapterCard => chapter !== null)
      .sort((left, right) => {
        if (left.classNum !== right.classNum) return left.classNum - right.classNum;
        if (left.medium !== right.medium) return left.medium.localeCompare(right.medium);
        if (left.subjectName !== right.subjectName) return left.subjectName.localeCompare(right.subjectName);
        return left.chapterNo - right.chapterNo;
      });

    const tree: ClassGroup[] = Array.from(classMap.entries())
      .sort(([left], [right]) => left - right)
      .map(([classNum, mediumMap]) => {
        const mediums = Array.from(mediumMap.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([medium, subjectMap]) => {
            const subjects = Array.from(subjectMap.entries())
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([subjectName, chapterItems]) => ({
                subjectName,
                chapters: chapterItems.sort((left, right) => left.chapterNo - right.chapterNo),
                totalVideos: chapterItems.reduce((sum, chapter) => sum + chapter.videoCount, 0),
              }));

            return {
              medium,
              subjects,
              totalChapters: subjects.reduce((sum, subject) => sum + subject.chapters.length, 0),
              totalVideos: subjects.reduce((sum, subject) => sum + subject.totalVideos, 0),
            };
          });

        return {
          classNum,
          mediums,
          totalChapters: mediums.reduce((sum, medium) => sum + medium.totalChapters, 0),
          totalVideos: mediums.reduce((sum, medium) => sum + medium.totalVideos, 0),
        };
      });

    return {
      chapters: chapterCards,
      tree,
      stats: {
        chapterCount: chapterCards.length,
        videoCount: videos.length,
        classCount: classMap.size,
      },
    };
  },
  ["admin-content-library-data-v5"],
  { revalidate: 3600 }
);

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const { chapters, tree, stats } = await loadContentLibraryData();

  return <ContentLibraryViewSwitcher chapters={chapters} tree={tree} stats={stats} />;
}
