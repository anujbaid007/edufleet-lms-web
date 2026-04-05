import "server-only";

import { redirect } from "next/navigation";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type {
  AnalyticsChapterView,
  AnalyticsDataset,
  AnalyticsLevel,
  AnalyticsPageData,
  AnalyticsRequest,
  AnalyticsRow,
  AnalyticsStudentDetail,
  AnalyticsStudentRow,
  AnalyticsSummary,
  AnalyticsTimelinePoint,
  AnalyticsViewer,
} from "./types";

type Supabase = SupabaseClient<Database>;
type UserRole = Database["public"]["Enums"]["user_role"];

type StudentRow = {
  id: string;
  name: string;
  org_id: string | null;
  centre_id: string | null;
  class: number | null;
  board: string | null;
  medium: string | null;
  teacher_id: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type CentreRow = {
  id: string;
  name: string;
  org_id: string;
  location: string | null;
};

type ProgressRow = {
  user_id: string;
  video_id: string;
  completed: boolean;
  last_watched_at: string;
  watched_percentage: number;
};

type VideoRow = {
  id: string;
  chapter_id: string;
};

type VideoLessonRow = {
  id: string;
  chapter_id: string;
  title: string;
  sort_order: number;
  duration_seconds: number;
};

type VideoChapterRow = {
  chapter_id: string;
};

type ChapterRow = {
  id: string;
  class: number;
  board: string;
  medium: string;
  subject_id: string;
  chapter_no: number;
  title: string;
  subjects: {
    name: string;
    display_order: number;
  } | null;
};

type RestrictionRow = {
  org_id: string;
  chapter_id: string;
};

type VideoCountRow = {
  chapter_id: string;
  video_count: number | string;
};

type ChapterCatalogItem = {
  id: string;
  classNum: number;
  board: string;
  medium: string;
  subjectId: string;
  subjectName: string;
  subjectOrder: number;
  chapterNo: number;
  title: string;
  videoCount: number;
};

type SubjectMeta = {
  id: string;
  name: string;
  order: number;
  chapterCount: number;
};

type AccessibleContent = {
  totalChapters: number;
  totalVideos: number;
  subjectTotals: Map<string, number>;
  subjectMeta: Map<string, SubjectMeta>;
  chapterTotals: Map<string, number>;
  chaptersBySubject: Map<string, ChapterCatalogItem[]>;
};

type StudentSnapshot = {
  id: string;
  name: string;
  orgId: string | null;
  centreId: string | null;
  classNum: number | null;
  board: string | null;
  medium: string | null;
  totalChapters: number;
  totalVideos: number;
  subjectTotals: Map<string, number>;
  chapterTotals: Map<string, number>;
  subjectMeta: Map<string, SubjectMeta>;
  chaptersBySubject: Map<string, ChapterCatalogItem[]>;
  active7d: boolean;
  activeSubjectIds: Set<string>;
  activeChapterIds: Set<string>;
  completedCount: number;
  completedBySubject: Map<string, number>;
  completedByChapter: Map<string, number>;
  completedLessonsBySubject: Map<string, number>;
  completedLessonsByChapter: Map<string, number>;
  progressCount: number;
  progressBySubject: Map<string, number>;
  progressByChapter: Map<string, number>;
  watchPercentageSum: number;
  watchPercentageBySubject: Map<string, number>;
  watchPercentageByChapter: Map<string, number>;
  lastWatchedAt: string | null;
  lastWatchedAtBySubject: Map<string, string>;
  lastWatchedAtByChapter: Map<string, string>;
};

type ScopedMetrics = {
  trackedChapters: number;
  completedChapters: number;
  completionNumerator: number;
  completionDenominator: number;
  completedUnits: number;
  trackedUnits: number;
  unitLabel: "chapters" | "lessons";
  progressCount: number;
  watchSum: number;
  active: boolean;
  lastActivityAt: string | null;
};

type ScopeFilter =
  | {
      subjectId: string;
    }
  | {
      chapterId: string;
    }
  | undefined;

const ACTIVE_DAYS = 7;
const TIMELINE_DAYS = 30;
const PAGE_SIZE = 1000;
const USER_ID_CHUNK = 300;
const VIDEO_ID_CHUNK = 500;
const ADMIN_ROLES = new Set<UserRole>(["platform_admin", "org_admin", "centre_admin"]);

function roleScopeFromRole(role: UserRole): AnalyticsViewer["roleScope"] {
  if (role === "platform_admin") return "platform";
  if (role === "org_admin") return "organization";
  return "centre";
}

function roleLabelFromRole(role: UserRole) {
  if (role === "platform_admin") return "Platform";
  if (role === "org_admin") return "Organization";
  return "Centre";
}

function comboKey(classNum: number | null, board: string | null, medium: string | null) {
  return `${classNum ?? "na"}|${board ?? "na"}|${medium ?? "na"}`;
}

function accessKey(orgId: string | null, classNum: number | null, board: string | null, medium: string | null) {
  return `${orgId ?? "na"}|${comboKey(classNum, board, medium)}`;
}

function startOfDayIso(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

function formatTimelineLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toPercentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function incrementNumberMap(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function updateLatestMap(map: Map<string, string>, key: string, value: string) {
  const current = map.get(key);
  if (!current || current < value) map.set(key, value);
}

function buildInitialRequest(viewer: AnalyticsViewer): AnalyticsRequest {
  if (viewer.roleScope === "platform") return {};
  if (viewer.roleScope === "organization") return viewer.orgId ? { orgId: viewer.orgId } : {};
  return {
    orgId: viewer.orgId ?? undefined,
    centreId: viewer.centreId ?? undefined,
  };
}

function buildRootLabel(viewer: AnalyticsViewer) {
  if (viewer.roleScope === "platform") return "Organizations";
  if (viewer.roleScope === "organization") return viewer.orgName ?? "Centres";
  return viewer.centreName ?? "Classes";
}

function normalizeRequest(viewer: AnalyticsViewer, request: AnalyticsRequest): AnalyticsRequest {
  if (viewer.roleScope === "platform") {
    return {
      orgId: request.orgId,
      centreId: request.centreId,
      classNum: request.classNum,
      subjectId: request.subjectId,
    };
  }

  if (viewer.roleScope === "organization") {
    return {
      orgId: viewer.orgId ?? request.orgId,
      centreId: request.centreId,
      classNum: request.classNum,
      subjectId: request.subjectId,
    };
  }

  return {
    orgId: viewer.orgId ?? request.orgId,
    centreId: viewer.centreId ?? request.centreId,
    classNum: request.classNum,
    subjectId: request.subjectId,
  };
}

function getDatasetLevel(viewer: AnalyticsViewer, request: AnalyticsRequest): AnalyticsLevel {
  if (request.subjectId) return "chapters";
  if (request.classNum !== undefined) return "subjects";
  if (request.centreId) return "classes";
  if (request.orgId) return "centres";
  if (viewer.roleScope === "platform") return "organizations";
  return "centres";
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: PostgrestError | null }>
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function chunkValues(values: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function getViewer(supabase: Supabase): Promise<AnalyticsViewer> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, org_id, centre_id")
    .eq("id", session.user.id)
    .single();

  if (!profile || !ADMIN_ROLES.has(profile.role)) redirect("/dashboard");

  const [orgResult, centreResult] = await Promise.all([
    profile.org_id
      ? supabase.from("organizations").select("name").eq("id", profile.org_id).single()
      : Promise.resolve({ data: null }),
    profile.centre_id
      ? supabase.from("centres").select("name").eq("id", profile.centre_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    role: profile.role,
    roleScope: roleScopeFromRole(profile.role),
    roleLabel: roleLabelFromRole(profile.role),
    orgId: profile.org_id,
    orgName: orgResult.data?.name ?? null,
    centreId: profile.centre_id,
    centreName: centreResult.data?.name ?? null,
  };
}

async function fetchOrganizations(supabase: Supabase, request: AnalyticsRequest) {
  return fetchAllPages<OrganizationRow>(async (from, to) => {
    let query = supabase
      .from("organizations")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .range(from, to);

    if (request.orgId) query = query.eq("id", request.orgId);

    return query;
  });
}

async function fetchCentres(supabase: Supabase, request: AnalyticsRequest) {
  return fetchAllPages<CentreRow>(async (from, to) => {
    let query = supabase
      .from("centres")
      .select("id, name, org_id, location")
      .eq("is_active", true)
      .order("name")
      .range(from, to);

    if (request.orgId) query = query.eq("org_id", request.orgId);
    if (request.centreId) query = query.eq("id", request.centreId);

    return query;
  });
}

async function fetchStudents(supabase: Supabase, request: AnalyticsRequest) {
  return fetchAllPages<StudentRow>(async (from, to) => {
    let query = supabase
      .from("profiles")
      .select("id, name, org_id, centre_id, class, board, medium, teacher_id")
      .eq("role", "student")
      .eq("is_active", true)
      .order("name")
      .range(from, to);

    if (request.orgId) query = query.eq("org_id", request.orgId);
    if (request.centreId) query = query.eq("centre_id", request.centreId);
    if (request.classNum !== undefined) query = query.eq("class", request.classNum);

    return query;
  });
}

async function fetchRestrictions(supabase: Supabase, orgIds: string[]) {
  if (!orgIds.length) return [] as RestrictionRow[];

  return fetchAllPages<RestrictionRow>(async (from, to) => {
    return supabase
      .from("content_restrictions")
      .select("org_id, chapter_id")
      .in("org_id", orgIds)
      .range(from, to);
  });
}

async function fetchChapters(
  supabase: Supabase,
  classes: number[],
  boards: string[],
  media: string[]
) {
  if (!classes.length || !boards.length || !media.length) return [] as ChapterRow[];

  return fetchAllPages<ChapterRow>(async (from, to) => {
    return supabase
      .from("chapters")
      .select("id, class, board, medium, subject_id, chapter_no, title, subjects(name, display_order)")
      .in("class", classes)
      .in("board", boards)
      .in("medium", media)
      .order("class")
      .order("chapter_no")
      .range(from, to);
  });
}

async function fetchProgressForUsers(supabase: Supabase, userIds: string[]) {
  if (!userIds.length) return [] as ProgressRow[];

  const progressRows: ProgressRow[] = [];

  for (const idChunk of chunkValues(userIds, USER_ID_CHUNK)) {
    const chunkRows = await fetchAllPages<ProgressRow>(async (from, to) => {
      return supabase
        .from("video_progress")
        .select("user_id, video_id, completed, last_watched_at, watched_percentage")
        .in("user_id", idChunk)
        .range(from, to);
    });

    progressRows.push(...chunkRows);
  }

  return progressRows;
}

async function fetchVideosByIds(supabase: Supabase, videoIds: string[]) {
  if (!videoIds.length) return [] as VideoRow[];

  const videos: VideoRow[] = [];

  for (const idChunk of chunkValues(videoIds, VIDEO_ID_CHUNK)) {
    const { data, error } = await supabase
      .from("videos")
      .select("id, chapter_id")
      .in("id", idChunk);

    if (error) throw error;
    videos.push(...(data ?? []));
  }

  return videos;
}

async function fetchVideosByChapterIds(supabase: Supabase, chapterIds: string[]) {
  if (!chapterIds.length) return [] as VideoLessonRow[];

  const videos: VideoLessonRow[] = [];

  for (const idChunk of chunkValues(chapterIds, VIDEO_ID_CHUNK)) {
    const { data, error } = await supabase
      .from("videos")
      .select("id, chapter_id, title, sort_order, duration_seconds")
      .in("chapter_id", idChunk)
      .order("chapter_id")
      .order("sort_order");

    if (error) throw error;
    videos.push(...(data ?? []));
  }

  return videos;
}

async function fetchVideoCountsByChapter(supabase: Supabase) {
  const videoRows = await fetchAllPages<VideoChapterRow>(async (from, to) => {
    return supabase.from("videos").select("chapter_id").order("chapter_id").range(from, to);
  });

  const counts = new Map<string, number>();
  for (const row of videoRows) {
    counts.set(row.chapter_id, (counts.get(row.chapter_id) ?? 0) + 1);
  }

  return {
    data: Array.from(counts.entries()).map<VideoCountRow>(([chapter_id, video_count]) => ({
      chapter_id,
      video_count,
    })),
    error: null,
  };
}

function buildAccessibleContentFactory(
  chapters: ChapterCatalogItem[],
  restrictions: RestrictionRow[]
) {
  const chaptersByCombo = new Map<string, ChapterCatalogItem[]>();
  for (const chapter of chapters) {
    const key = comboKey(chapter.classNum, chapter.board, chapter.medium);
    const list = chaptersByCombo.get(key) ?? [];
    list.push(chapter);
    chaptersByCombo.set(key, list);
  }

  const blockedByOrg = new Map<string, Set<string>>();
  for (const row of restrictions) {
    const blocked = blockedByOrg.get(row.org_id) ?? new Set<string>();
    blocked.add(row.chapter_id);
    blockedByOrg.set(row.org_id, blocked);
  }

  const cache = new Map<string, AccessibleContent>();

  return (orgId: string | null, classNum: number | null, board: string | null, medium: string | null) => {
    const key = accessKey(orgId, classNum, board, medium);
    const cached = cache.get(key);
    if (cached) return cached;

    const blocked = orgId ? blockedByOrg.get(orgId) ?? new Set<string>() : new Set<string>();
    const relevant = (chaptersByCombo.get(comboKey(classNum, board, medium)) ?? []).filter(
      (chapter) => !blocked.has(chapter.id)
    );

    const subjectTotals = new Map<string, number>();
    const subjectMeta = new Map<string, SubjectMeta>();
    const chapterTotals = new Map<string, number>();
    const chaptersBySubject = new Map<string, ChapterCatalogItem[]>();

    let totalChapters = 0;
    let totalVideos = 0;

    for (const chapter of relevant) {
      totalVideos += chapter.videoCount;
      if (chapter.videoCount === 0) continue;

      totalChapters += 1;
      chapterTotals.set(chapter.id, 1);
      incrementNumberMap(subjectTotals, chapter.subjectId, 1);

      const existingMeta = subjectMeta.get(chapter.subjectId);
      if (existingMeta) {
        existingMeta.chapterCount += 1;
      } else {
        subjectMeta.set(chapter.subjectId, {
          id: chapter.subjectId,
          name: chapter.subjectName,
          order: chapter.subjectOrder,
          chapterCount: 1,
        });
      }

      const chapterList = chaptersBySubject.get(chapter.subjectId) ?? [];
      chapterList.push(chapter);
      chaptersBySubject.set(chapter.subjectId, chapterList);
    }

    const result: AccessibleContent = {
      totalChapters,
      totalVideos,
      subjectTotals,
      subjectMeta,
      chapterTotals,
      chaptersBySubject,
    };

    cache.set(key, result);
    return result;
  };
}

function getScopedMetrics(snapshot: StudentSnapshot, filter?: ScopeFilter): ScopedMetrics {
  if (!filter) {
    return {
      trackedChapters: snapshot.totalChapters,
      completedChapters: snapshot.completedCount,
      completionNumerator: snapshot.completedCount,
      completionDenominator: snapshot.totalChapters,
      completedUnits: snapshot.completedCount,
      trackedUnits: snapshot.totalChapters,
      unitLabel: "chapters",
      progressCount: snapshot.progressCount,
      watchSum: snapshot.watchPercentageSum,
      active: snapshot.active7d,
      lastActivityAt: snapshot.lastWatchedAt,
    };
  }

  if ("subjectId" in filter) {
    const subjectChapters = snapshot.chaptersBySubject.get(filter.subjectId) ?? [];
    let completedChapters = 0;
    let progressCount = 0;
    let watchSum = 0;
    let lastActivityAt: string | null = null;
    let active = false;

    for (const chapter of subjectChapters) {
      if (snapshot.completedByChapter.get(chapter.id)) completedChapters += 1;
      progressCount += snapshot.progressByChapter.get(chapter.id) ?? 0;
      watchSum += snapshot.watchPercentageByChapter.get(chapter.id) ?? 0;

      const chapterLastWatchedAt = snapshot.lastWatchedAtByChapter.get(chapter.id) ?? null;
      if (chapterLastWatchedAt && (!lastActivityAt || lastActivityAt < chapterLastWatchedAt)) {
        lastActivityAt = chapterLastWatchedAt;
      }

      if (snapshot.activeChapterIds.has(chapter.id)) {
        active = true;
      }
    }

    return {
      trackedChapters: subjectChapters.length,
      completedChapters,
      completionNumerator: completedChapters,
      completionDenominator: subjectChapters.length,
      completedUnits: completedChapters,
      trackedUnits: subjectChapters.length,
      unitLabel: "chapters",
      progressCount,
      watchSum,
      active,
      lastActivityAt,
    };
  }

  const chapterMeta = Array.from(snapshot.chaptersBySubject.values())
    .flat()
    .find((chapter) => chapter.id === filter.chapterId);
  const trackedLessons = chapterMeta?.videoCount ?? 0;
  const completedLessons = snapshot.completedLessonsByChapter.get(filter.chapterId) ?? 0;

  return {
    trackedChapters: snapshot.chapterTotals.get(filter.chapterId) ?? 0,
    completedChapters: snapshot.completedByChapter.get(filter.chapterId) ?? 0,
    completionNumerator: completedLessons,
    completionDenominator: trackedLessons,
    completedUnits: completedLessons,
    trackedUnits: trackedLessons,
    unitLabel: "lessons",
    progressCount: snapshot.progressByChapter.get(filter.chapterId) ?? 0,
    watchSum: snapshot.watchPercentageByChapter.get(filter.chapterId) ?? 0,
    active: snapshot.activeChapterIds.has(filter.chapterId),
    lastActivityAt: snapshot.lastWatchedAtByChapter.get(filter.chapterId) ?? null,
  };
}

function buildSummary(snapshots: StudentSnapshot[], filter?: ScopeFilter): AnalyticsSummary {
  let activeStudents = 0;
  let completedChapters = 0;
  let completionNumerator = 0;
  let completionDenominator = 0;
  let watchSum = 0;
  let progressCount = 0;
  const trackedChapterIds = new Set<string>();

  for (const snapshot of snapshots) {
    const metrics = getScopedMetrics(snapshot, filter);
    if (metrics.active) activeStudents += 1;
    completedChapters += metrics.completedChapters;
    completionNumerator += metrics.completionNumerator;
    completionDenominator += metrics.completionDenominator;
    watchSum += metrics.watchSum;
    progressCount += metrics.progressCount;

    if (!filter) {
      for (const chapterId of Array.from(snapshot.chapterTotals.keys())) {
        trackedChapterIds.add(chapterId);
      }
      continue;
    }

    if ("subjectId" in filter) {
      for (const chapter of snapshot.chaptersBySubject.get(filter.subjectId) ?? []) {
        trackedChapterIds.add(chapter.id);
      }
      continue;
    }

    if ((snapshot.chapterTotals.get(filter.chapterId) ?? 0) > 0) {
      trackedChapterIds.add(filter.chapterId);
    }
  }

  return {
    students: snapshots.length,
    activeStudents,
    completedChapters,
    completionRate: toPercentage(completionNumerator, completionDenominator),
    avgWatchPercentage: progressCount ? Math.round(watchSum / progressCount) : 0,
    trackedChapters: trackedChapterIds.size,
  };
}

function buildStudentRows(
  snapshots: StudentSnapshot[],
  centresById: Map<string, CentreRow>,
  filter?: ScopeFilter
) {
  return snapshots
    .map<AnalyticsStudentRow>((snapshot) => {
      const metrics = getScopedMetrics(snapshot, filter);
      return {
        id: snapshot.id,
        name: snapshot.name,
        centreName: snapshot.centreId ? centresById.get(snapshot.centreId)?.name ?? null : null,
        classLabel: snapshot.classNum ? `Class ${snapshot.classNum}` : null,
        board: snapshot.board,
        medium: snapshot.medium,
        completedChapters: metrics.completedChapters,
        trackedChapters: metrics.trackedChapters,
        completedUnits: metrics.completedUnits,
        trackedUnits: metrics.trackedUnits,
        unitLabel: metrics.unitLabel,
        completionRate: toPercentage(metrics.completionNumerator, metrics.completionDenominator),
        avgWatchPercentage: metrics.progressCount ? Math.round(metrics.watchSum / metrics.progressCount) : 0,
        lastWatchedAt: metrics.lastActivityAt,
        isActive: metrics.active,
      };
    })
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      const leftTime = left.lastWatchedAt ? new Date(left.lastWatchedAt).getTime() : 0;
      const rightTime = right.lastWatchedAt ? new Date(right.lastWatchedAt).getTime() : 0;
      return rightTime - leftTime || left.name.localeCompare(right.name);
    });
}

function buildChapterViews(
  snapshots: StudentSnapshot[],
  centresById: Map<string, CentreRow>,
  subjectId: string,
  videosByChapter: Map<string, VideoLessonRow[]>,
  progressByStudentVideo: Map<string, Map<string, ProgressRow>>
) {
  const chapterMap = new Map<string, ChapterCatalogItem>();

  for (const snapshot of snapshots) {
    for (const chapter of snapshot.chaptersBySubject.get(subjectId) ?? []) {
      chapterMap.set(chapter.id, chapter);
    }
  }

  const chapterViews = Object.fromEntries(
    Array.from(chapterMap.values())
      .sort((left, right) => left.chapterNo - right.chapterNo)
      .map<[string, AnalyticsChapterView]>((chapter) => {
        const chapterSnapshots = snapshots.filter((snapshot) => (snapshot.chapterTotals.get(chapter.id) ?? 0) > 0);
        const students = buildStudentRows(chapterSnapshots, centresById, { chapterId: chapter.id });
        const inactiveStudents = buildStudentRows(
          chapterSnapshots.filter((snapshot) => !getScopedMetrics(snapshot, { chapterId: chapter.id }).active),
          centresById,
          { chapterId: chapter.id }
        ).slice(0, 8);
        const lessons = videosByChapter.get(chapter.id) ?? [];

        const studentDetails = students.map<AnalyticsStudentDetail>((student) => {
          const lessonProgress = progressByStudentVideo.get(student.id) ?? new Map<string, ProgressRow>();
          let completedLessons = 0;
          let inProgressLessons = 0;

          const lessonRows = lessons.map((lesson) => {
            const progress = lessonProgress.get(lesson.id);
            const watchedPercentage = Math.round(progress?.watched_percentage ?? 0);
            const completed = Boolean(progress?.completed) || watchedPercentage >= 90;
            const status: AnalyticsStudentDetail["lessons"][number]["status"] = completed
              ? "completed"
              : watchedPercentage > 0
                ? "in_progress"
                : "not_started";

            if (completed) {
              completedLessons += 1;
            } else if (status === "in_progress") {
              inProgressLessons += 1;
            }

            return {
              id: lesson.id,
              title: lesson.title,
              sortOrder: lesson.sort_order,
              durationSeconds: lesson.duration_seconds,
              watchedPercentage,
              completed,
              lastWatchedAt: progress?.last_watched_at ?? null,
              status,
            };
          });

          return {
            studentId: student.id,
            chapterId: chapter.id,
            completedLessons,
            totalLessons: lessons.length,
            inProgressLessons,
            completionRate: lessons.length ? toPercentage(completedLessons, lessons.length) : 0,
            avgWatchPercentage: student.avgWatchPercentage,
            lastWatchedAt: student.lastWatchedAt,
            lessons: lessonRows,
          };
        });

        return [
          chapter.id,
          {
            chapterId: chapter.id,
            chapterLabel: `Chapter ${chapter.chapterNo}`,
            chapterTitle: chapter.title,
            lessonCount: lessons.length,
            students,
            inactiveStudents,
            studentDetails,
          },
        ];
      })
  );

  return chapterViews;
}

function buildTimeline(
  progressRows: ProgressRow[],
  allowedStudentIds: Set<string>,
  chapterByVideoId: Map<string, ChapterCatalogItem>,
  filter?: ScopeFilter
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (TIMELINE_DAYS - 1));
  const startIso = startOfDayIso(startDate);

  const points = new Map<
    string,
    {
      label: string;
      activeStudents: Set<string>;
      watchSessions: number;
      completedChapters: number;
    }
  >();

  for (let index = 0; index < TIMELINE_DAYS; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = startOfDayIso(date).slice(0, 10);
    points.set(dateKey, {
      label: formatTimelineLabel(date),
      activeStudents: new Set<string>(),
      watchSessions: 0,
      completedChapters: 0,
    });
  }

  const chapterCompletionCandidates = new Map<
    string,
    {
      totalVideos: number;
      completedVideos: number;
      completedAt: string | null;
      subjectId: string;
      chapterId: string;
    }
  >();

  for (const row of progressRows) {
    if (!allowedStudentIds.has(row.user_id)) continue;
    if (!row.last_watched_at || row.last_watched_at < startIso) continue;

    const chapter = chapterByVideoId.get(row.video_id);
    if (!chapter) continue;

    if (filter && "subjectId" in filter && chapter.subjectId !== filter.subjectId) continue;
    if (filter && "chapterId" in filter && chapter.id !== filter.chapterId) continue;

    const dateKey = row.last_watched_at.slice(0, 10);
    const point = points.get(dateKey);
    if (!point) continue;

    point.activeStudents.add(row.user_id);
    point.watchSessions += 1;
    if (!row.completed) continue;

    const completionKey = `${row.user_id}:${chapter.id}`;
    const existing = chapterCompletionCandidates.get(completionKey) ?? {
      totalVideos: chapter.videoCount,
      completedVideos: 0,
      completedAt: null,
      subjectId: chapter.subjectId,
      chapterId: chapter.id,
    };

    existing.completedVideos += 1;
    if (!existing.completedAt || existing.completedAt < row.last_watched_at) {
      existing.completedAt = row.last_watched_at;
    }
    chapterCompletionCandidates.set(completionKey, existing);
  }

  for (const candidate of Array.from(chapterCompletionCandidates.values())) {
    if (candidate.totalVideos === 0 || candidate.completedVideos < candidate.totalVideos || !candidate.completedAt) {
      continue;
    }

    if (filter && "subjectId" in filter && candidate.subjectId !== filter.subjectId) continue;
    if (filter && "chapterId" in filter && candidate.chapterId !== filter.chapterId) continue;

    const point = points.get(candidate.completedAt.slice(0, 10));
    if (!point) continue;
    point.completedChapters += 1;
  }

  return Array.from(points.entries()).map<AnalyticsTimelinePoint>(([date, point]) => ({
    date,
    label: point.label,
    activeStudents: point.activeStudents.size,
    watchSessions: point.watchSessions,
    completedChapters: point.completedChapters,
  }));
}

function getDatasetText(
  level: AnalyticsLevel,
  viewer: AnalyticsViewer,
  request: AnalyticsRequest,
  organizationsById: Map<string, OrganizationRow>,
  centresById: Map<string, CentreRow>,
  subjectMetaById: Map<string, SubjectMeta>
) {
  if (level === "organizations") {
    return {
      title: "Platform Analytics",
      subtitle: "Compare organizations, activity, and completion momentum across the LMS.",
      emptyMessage: "No organizations are available yet.",
    };
  }

  if (level === "centres") {
    const orgName = request.orgId ? organizationsById.get(request.orgId)?.name ?? viewer.orgName : viewer.orgName;
    return {
      title: orgName ? `${orgName} Analytics` : "Centre Analytics",
      subtitle: "Track centre performance, compare engagement, and drill into class-wise outcomes.",
      emptyMessage: "No centres are available in this scope yet.",
    };
  }

  if (level === "classes") {
    const centreName = request.centreId ? centresById.get(request.centreId)?.name ?? viewer.centreName : viewer.centreName;
    return {
      title: centreName ? `${centreName} Class Analytics` : "Class Analytics",
      subtitle: "Understand how each class is progressing before drilling into subject performance.",
      emptyMessage: "No students are assigned to classes in this scope yet.",
    };
  }

  if (level === "subjects") {
    return {
      title: request.classNum !== undefined ? `Class ${request.classNum} Subject Analytics` : "Subject Analytics",
      subtitle: "Compare subjects side by side to find where engagement is strongest and where it drops.",
      emptyMessage: "No subject-level learner data is available for this class yet.",
    };
  }

  const subjectName = request.subjectId ? subjectMetaById.get(request.subjectId)?.name ?? "Subject" : "Subject";
  return {
    title: `${subjectName} Chapter Analytics`,
    subtitle: "Review chapter progress and pinpoint which students are slipping inside this subject.",
    emptyMessage: "No chapter-level activity is available for this subject yet.",
  };
}

function buildDatasetRows(
  level: AnalyticsLevel,
  snapshots: StudentSnapshot[],
  organizations: OrganizationRow[],
  centres: CentreRow[],
  request: AnalyticsRequest,
  organizationsById: Map<string, OrganizationRow>,
  subjectMetaById: Map<string, SubjectMeta>
) {
  if (level === "organizations") {
    const centreCountByOrg = new Map<string, number>();
    for (const centre of centres) {
      centreCountByOrg.set(centre.org_id, (centreCountByOrg.get(centre.org_id) ?? 0) + 1);
    }

    return organizations.map<AnalyticsRow>((organization) => {
      const orgSnapshots = snapshots.filter((snapshot) => snapshot.orgId === organization.id);
      const summary = buildSummary(orgSnapshots);
      const lastActivityAt = orgSnapshots.reduce<string | null>((latest, snapshot) => {
        if (!snapshot.lastWatchedAt) return latest;
        if (!latest || latest < snapshot.lastWatchedAt) return snapshot.lastWatchedAt;
        return latest;
      }, null);

      return {
        id: organization.id,
        label: organization.name,
        subtitle: `${centreCountByOrg.get(organization.id) ?? 0} centres`,
        students: summary.students,
        activeStudents: summary.activeStudents,
        completedChapters: summary.completedChapters,
        completionRate: summary.completionRate,
        avgWatchPercentage: summary.avgWatchPercentage,
        trackedChapters: summary.trackedChapters,
        lastActivityAt,
      };
    });
  }

  if (level === "centres") {
    return centres.map<AnalyticsRow>((centre) => {
      const centreSnapshots = snapshots.filter((snapshot) => snapshot.centreId === centre.id);
      const summary = buildSummary(centreSnapshots);
      const lastActivityAt = centreSnapshots.reduce<string | null>((latest, snapshot) => {
        if (!snapshot.lastWatchedAt) return latest;
        if (!latest || latest < snapshot.lastWatchedAt) return snapshot.lastWatchedAt;
        return latest;
      }, null);

      return {
        id: centre.id,
        label: centre.name,
        subtitle: centre.location,
        students: summary.students,
        activeStudents: summary.activeStudents,
        completedChapters: summary.completedChapters,
        completionRate: summary.completionRate,
        avgWatchPercentage: summary.avgWatchPercentage,
        trackedChapters: summary.trackedChapters,
        lastActivityAt,
      };
    });
  }

  if (level === "classes") {
    const classNumbers = Array.from(
      new Set(snapshots.map((snapshot) => snapshot.classNum).filter((value): value is number => value !== null))
    ).sort((left, right) => left - right);

    return classNumbers.map<AnalyticsRow>((classNum) => {
      const classSnapshots = snapshots.filter((snapshot) => snapshot.classNum === classNum);
      const summary = buildSummary(classSnapshots);
      const boards = new Set(classSnapshots.map((snapshot) => snapshot.board).filter(Boolean));
      const media = new Set(classSnapshots.map((snapshot) => snapshot.medium).filter(Boolean));
      const lastActivityAt = classSnapshots.reduce<string | null>((latest, snapshot) => {
        if (!snapshot.lastWatchedAt) return latest;
        if (!latest || latest < snapshot.lastWatchedAt) return snapshot.lastWatchedAt;
        return latest;
      }, null);

      const parts = [`${boards.size} board${boards.size === 1 ? "" : "s"}`, `${media.size} medium${media.size === 1 ? "" : "s"}`];

      return {
        id: String(classNum),
        label: `Class ${classNum}`,
        subtitle: parts.join(" · "),
        students: summary.students,
        activeStudents: summary.activeStudents,
        completedChapters: summary.completedChapters,
        completionRate: summary.completionRate,
        avgWatchPercentage: summary.avgWatchPercentage,
        trackedChapters: summary.trackedChapters,
        lastActivityAt,
      };
    });
  }

  if (level === "subjects") {
    const rows: AnalyticsRow[] = [];
    const orderedSubjects = Array.from(subjectMetaById.values())
      .filter((subject) => snapshots.some((snapshot) => (snapshot.subjectTotals.get(subject.id) ?? 0) > 0))
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));

    for (const subject of orderedSubjects) {
      const scopedSnapshots = snapshots.filter((snapshot) => (snapshot.subjectTotals.get(subject.id) ?? 0) > 0);
      const summary = buildSummary(scopedSnapshots, { subjectId: subject.id });
      const lastActivityAt = scopedSnapshots.reduce<string | null>((latest, snapshot) => {
        const lastWatched = snapshot.lastWatchedAtBySubject.get(subject.id);
        if (!lastWatched) return latest;
        if (!latest || latest < lastWatched) return lastWatched;
        return latest;
      }, null);

      rows.push({
        id: subject.id,
        label: subject.name,
        subtitle: `${subject.chapterCount} chapters`,
        students: summary.students,
        activeStudents: summary.activeStudents,
        completedChapters: summary.completedChapters,
        completionRate: summary.completionRate,
        avgWatchPercentage: summary.avgWatchPercentage,
        trackedChapters: summary.trackedChapters,
        lastActivityAt,
      });
    }

    return rows;
  }

  const subjectId = request.subjectId;
  if (!subjectId) return [] as AnalyticsRow[];

  const chapterMap = new Map<string, ChapterCatalogItem>();
  for (const snapshot of snapshots) {
    for (const chapter of snapshot.chaptersBySubject.get(subjectId) ?? []) {
      chapterMap.set(chapter.id, chapter);
    }
  }

  return Array.from(chapterMap.values())
    .sort((left, right) => left.chapterNo - right.chapterNo)
    .map<AnalyticsRow>((chapter) => {
      const scopedSnapshots = snapshots.filter((snapshot) => (snapshot.chapterTotals.get(chapter.id) ?? 0) > 0);
      const summary = buildSummary(scopedSnapshots, { chapterId: chapter.id });
      const lastActivityAt = scopedSnapshots.reduce<string | null>((latest, snapshot) => {
        const lastWatched = snapshot.lastWatchedAtByChapter.get(chapter.id);
        if (!lastWatched) return latest;
        if (!latest || latest < lastWatched) return lastWatched;
        return latest;
      }, null);

      return {
        id: chapter.id,
        label: `Chapter ${chapter.chapterNo}`,
        subtitle: `${chapter.title} · ${chapter.videoCount} videos`,
        students: summary.students,
        activeStudents: summary.activeStudents,
        completedChapters: summary.completedChapters,
        completionRate: summary.completionRate,
        avgWatchPercentage: summary.avgWatchPercentage,
        trackedChapters: summary.trackedChapters,
        lastActivityAt,
      };
    });
}

async function buildAnalyticsDataset(viewer: AnalyticsViewer, request: AnalyticsRequest): Promise<AnalyticsDataset> {
  // Auth is verified through the viewer session, then analytics reads use the
  // admin client so reporting is not accidentally limited by RLS visibility.
  const supabase = createAdminClient();
  const normalized = normalizeRequest(viewer, request);
  const level = getDatasetLevel(viewer, normalized);

  const [organizations, centres, students] = await Promise.all([
    fetchOrganizations(supabase, normalized),
    fetchCentres(supabase, normalized),
    fetchStudents(supabase, normalized),
  ]);

  const orgIds = Array.from(
    new Set(
      [
        normalized.orgId,
        ...students.map((student) => student.org_id),
      ].filter((value): value is string => Boolean(value))
    )
  );

  const classes = Array.from(
    new Set(students.map((student) => student.class).filter((value): value is number => value !== null))
  );
  const boards = Array.from(
    new Set(students.map((student) => student.board).filter((value): value is string => Boolean(value)))
  );
  const media = Array.from(
    new Set(students.map((student) => student.medium).filter((value): value is string => Boolean(value)))
  );

  const [restrictions, videoCounts, chapters, progressRows] = await Promise.all([
    fetchRestrictions(supabase, orgIds),
    classes.length && boards.length && media.length
      ? fetchVideoCountsByChapter(supabase)
      : Promise.resolve({ data: [] as VideoCountRow[], error: null }),
    fetchChapters(supabase, classes, boards, media),
    fetchProgressForUsers(
      supabase,
      students.map((student) => student.id)
    ),
  ]);

  if (videoCounts.error) throw videoCounts.error;

  const progressVideoIds = Array.from(new Set(progressRows.map((row) => row.video_id)));
  const videos = await fetchVideosByIds(supabase, progressVideoIds);

  const organizationsById = new Map(organizations.map((row) => [row.id, row]));
  const centresById = new Map(centres.map((row) => [row.id, row]));

  const videoCountMap = new Map<string, number>();
  for (const row of videoCounts.data ?? []) {
    videoCountMap.set(row.chapter_id, Number(row.video_count));
  }

  const chapterCatalog: ChapterCatalogItem[] = chapters.map((chapter) => ({
    id: chapter.id,
    classNum: chapter.class,
    board: chapter.board,
    medium: chapter.medium,
    subjectId: chapter.subject_id,
    subjectName: chapter.subjects?.name ?? "Unknown",
    subjectOrder: chapter.subjects?.display_order ?? 999,
    chapterNo: chapter.chapter_no,
    title: chapter.title,
    videoCount: videoCountMap.get(chapter.id) ?? 0,
  }));

  const chapterById = new Map(chapterCatalog.map((chapter) => [chapter.id, chapter]));
  const videoToChapter = new Map(videos.map((video) => [video.id, video.chapter_id]));
  const chapterByVideoId = new Map<string, ChapterCatalogItem>();
  for (const [videoId, chapterId] of Array.from(videoToChapter.entries())) {
    const chapter = chapterById.get(chapterId);
    if (chapter) chapterByVideoId.set(videoId, chapter);
  }

  const getAccessibleContent = buildAccessibleContentFactory(chapterCatalog, restrictions);
  const activeSince = new Date(Date.now() - ACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const snapshots = new Map<string, StudentSnapshot>();
  const subjectMetaById = new Map<string, SubjectMeta>();
  const progressByStudentVideo = new Map<string, Map<string, ProgressRow>>();

  for (const student of students) {
    const accessible = getAccessibleContent(student.org_id, student.class, student.board, student.medium);
    for (const [subjectId, meta] of Array.from(accessible.subjectMeta.entries())) {
      const current = subjectMetaById.get(subjectId);
      if (!current || current.chapterCount < meta.chapterCount) {
        subjectMetaById.set(subjectId, { ...meta });
      }
    }

    snapshots.set(student.id, {
      id: student.id,
      name: student.name,
      orgId: student.org_id,
      centreId: student.centre_id,
      classNum: student.class,
      board: student.board,
      medium: student.medium,
      totalChapters: accessible.totalChapters,
      totalVideos: accessible.totalVideos,
      subjectTotals: new Map(accessible.subjectTotals),
      chapterTotals: new Map(accessible.chapterTotals),
      subjectMeta: new Map(accessible.subjectMeta),
      chaptersBySubject: new Map(accessible.chaptersBySubject),
      active7d: false,
      activeSubjectIds: new Set<string>(),
      activeChapterIds: new Set<string>(),
      completedCount: 0,
      completedBySubject: new Map<string, number>(),
      completedByChapter: new Map<string, number>(),
      completedLessonsBySubject: new Map<string, number>(),
      completedLessonsByChapter: new Map<string, number>(),
      progressCount: 0,
      progressBySubject: new Map<string, number>(),
      progressByChapter: new Map<string, number>(),
      watchPercentageSum: 0,
      watchPercentageBySubject: new Map<string, number>(),
      watchPercentageByChapter: new Map<string, number>(),
      lastWatchedAt: null,
      lastWatchedAtBySubject: new Map<string, string>(),
      lastWatchedAtByChapter: new Map<string, string>(),
    });
  }

  const chapterProgressByStudent = new Map<
    string,
    Map<
      string,
      {
        totalVideos: number;
        completedVideos: number;
        subjectId: string;
      }
    >
  >();

  for (const row of progressRows) {
    const snapshot = snapshots.get(row.user_id);
    const chapter = chapterByVideoId.get(row.video_id);

    if (!snapshot || !chapter) continue;
    if ((snapshot.chapterTotals.get(chapter.id) ?? 0) === 0) continue;

    const progressMap = progressByStudentVideo.get(snapshot.id) ?? new Map<string, ProgressRow>();
    progressMap.set(row.video_id, row);
    progressByStudentVideo.set(snapshot.id, progressMap);

    snapshot.progressCount += 1;
    snapshot.watchPercentageSum += row.watched_percentage ?? 0;
    incrementNumberMap(snapshot.progressBySubject, chapter.subjectId, 1);
    incrementNumberMap(snapshot.progressByChapter, chapter.id, 1);
    incrementNumberMap(snapshot.watchPercentageBySubject, chapter.subjectId, row.watched_percentage ?? 0);
    incrementNumberMap(snapshot.watchPercentageByChapter, chapter.id, row.watched_percentage ?? 0);

    if (row.last_watched_at) {
      if (!snapshot.lastWatchedAt || snapshot.lastWatchedAt < row.last_watched_at) {
        snapshot.lastWatchedAt = row.last_watched_at;
      }
      updateLatestMap(snapshot.lastWatchedAtBySubject, chapter.subjectId, row.last_watched_at);
      updateLatestMap(snapshot.lastWatchedAtByChapter, chapter.id, row.last_watched_at);

      if (row.last_watched_at >= activeSince) {
        snapshot.active7d = true;
        snapshot.activeSubjectIds.add(chapter.subjectId);
        snapshot.activeChapterIds.add(chapter.id);
      }
    }

    const studentChapterProgress = chapterProgressByStudent.get(snapshot.id) ?? new Map();
    const chapterProgress = studentChapterProgress.get(chapter.id) ?? {
      totalVideos: chapter.videoCount,
      completedVideos: 0,
      subjectId: chapter.subjectId,
    };

    if (row.completed) {
      chapterProgress.completedVideos += 1;
    }

    studentChapterProgress.set(chapter.id, chapterProgress);
    chapterProgressByStudent.set(snapshot.id, studentChapterProgress);
  }

  for (const [studentId, chaptersForStudent] of Array.from(chapterProgressByStudent.entries())) {
    const snapshot = snapshots.get(studentId);
    if (!snapshot) continue;

    for (const [chapterId, chapterProgress] of Array.from(chaptersForStudent.entries())) {
      incrementNumberMap(snapshot.completedLessonsBySubject, chapterProgress.subjectId, chapterProgress.completedVideos);
      snapshot.completedLessonsByChapter.set(chapterId, chapterProgress.completedVideos);

      if (chapterProgress.totalVideos === 0 || chapterProgress.completedVideos < chapterProgress.totalVideos) continue;

      snapshot.completedCount += 1;
      incrementNumberMap(snapshot.completedBySubject, chapterProgress.subjectId, 1);
      snapshot.completedByChapter.set(chapterId, 1);
    }
  }

  const snapshotList = Array.from(snapshots.values());
  const datasetFilter: ScopeFilter = normalized.subjectId ? { subjectId: normalized.subjectId } : undefined;
  const allowedStudentIds = new Set(snapshotList.map((snapshot) => snapshot.id));
  const subjectChapterIds = normalized.subjectId
    ? Array.from(
        new Set(
          snapshotList.flatMap((snapshot) =>
            (snapshot.chaptersBySubject.get(normalized.subjectId ?? "") ?? []).map((chapter) => chapter.id)
          )
        )
      )
    : [];
  const chapterVideos = subjectChapterIds.length ? await fetchVideosByChapterIds(supabase, subjectChapterIds) : [];
  const videosByChapter = new Map<string, VideoLessonRow[]>();
  for (const video of chapterVideos) {
    const list = videosByChapter.get(video.chapter_id) ?? [];
    list.push(video);
    videosByChapter.set(video.chapter_id, list);
  }
  const summary = buildSummary(snapshotList, datasetFilter);
  const rows = buildDatasetRows(
    level,
    snapshotList,
    organizations,
    centres,
    normalized,
    organizationsById,
    subjectMetaById
  );
  const timeline = buildTimeline(progressRows, allowedStudentIds, chapterByVideoId, datasetFilter);
  const inactiveStudents = buildStudentRows(
    snapshotList.filter((snapshot) => !getScopedMetrics(snapshot, datasetFilter).active),
    centresById,
    datasetFilter
  ).slice(0, 8);

  const copy = getDatasetText(level, viewer, normalized, organizationsById, centresById, subjectMetaById);
  const chapterViews =
    level === "chapters" && normalized.subjectId
      ? buildChapterViews(snapshotList, centresById, normalized.subjectId, videosByChapter, progressByStudentVideo)
      : undefined;

  return {
    level,
    title: copy.title,
    subtitle: copy.subtitle,
    summary,
    rows,
    timeline,
    inactiveStudents,
    students: level === "chapters" ? buildStudentRows(snapshotList, centresById, datasetFilter) : undefined,
    chapterViews,
    emptyMessage: copy.emptyMessage,
  };
}

export async function loadInitialAnalyticsPageData(): Promise<AnalyticsPageData> {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  const initialRequest = buildInitialRequest(viewer);
  const initialDataset = await buildAnalyticsDataset(viewer, initialRequest);

  return {
    viewer,
    rootLabel: buildRootLabel(viewer),
    initialRequest,
    initialDataset,
  };
}

export async function loadAnalyticsDataset(request: AnalyticsRequest) {
  const supabase = await createClient();
  const viewer = await getViewer(supabase);
  return buildAnalyticsDataset(viewer, request);
}
