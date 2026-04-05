import type { Database } from "@/lib/supabase/types";

export type AnalyticsRole = "platform" | "organization" | "centre";
export type AnalyticsLevel =
  | "organizations"
  | "centres"
  | "classes"
  | "subjects"
  | "chapters";

export type AnalyticsRequest = {
  orgId?: string;
  centreId?: string;
  classNum?: number;
  subjectId?: string;
};

export type AnalyticsViewer = {
  role: Database["public"]["Enums"]["user_role"];
  roleScope: AnalyticsRole;
  roleLabel: string;
  orgId: string | null;
  orgName: string | null;
  centreId: string | null;
  centreName: string | null;
};

export type AnalyticsSummary = {
  students: number;
  activeStudents: number;
  completedChapters: number;
  completionRate: number;
  avgWatchPercentage: number;
  trackedChapters: number;
};

export type AnalyticsRow = {
  id: string;
  label: string;
  subtitle: string | null;
  students: number;
  activeStudents: number;
  completedChapters: number;
  completionRate: number;
  avgWatchPercentage: number;
  trackedChapters: number;
  lastActivityAt: string | null;
};

export type AnalyticsTimelinePoint = {
  date: string;
  label: string;
  activeStudents: number;
  watchSessions: number;
  completedChapters: number;
};

export type AnalyticsStudentRow = {
  id: string;
  name: string;
  centreName: string | null;
  classLabel: string | null;
  board: string | null;
  medium: string | null;
  completedChapters: number;
  trackedChapters: number;
  completionRate: number;
  avgWatchPercentage: number;
  lastWatchedAt: string | null;
  isActive: boolean;
};

export type AnalyticsDataset = {
  level: AnalyticsLevel;
  title: string;
  subtitle: string;
  summary: AnalyticsSummary;
  rows: AnalyticsRow[];
  timeline: AnalyticsTimelinePoint[];
  inactiveStudents: AnalyticsStudentRow[];
  students?: AnalyticsStudentRow[];
  emptyMessage: string;
};

export type AnalyticsPageData = {
  viewer: AnalyticsViewer;
  rootLabel: string;
  initialRequest: AnalyticsRequest;
  initialDataset: AnalyticsDataset;
};
