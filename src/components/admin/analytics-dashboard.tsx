"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  Clock3,
  Loader2,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ClayCard } from "@/components/ui/clay-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { getAnalyticsDatasetAction } from "@/lib/actions/analytics";
import type {
  AnalyticsChapterView,
  AnalyticsDataset,
  AnalyticsLevel,
  AnalyticsPageData,
  AnalyticsRequest,
  AnalyticsRow,
  AnalyticsStudentDetail,
  AnalyticsStudentRow,
} from "@/lib/analytics/types";

type HistoryEntry = {
  label: string;
  request: AnalyticsRequest;
  dataset: AnalyticsDataset;
};

type ComparisonMetric = "students" | "activeStudents" | "completionRate" | "completedChapters";

const comparisonMetricOptions: Array<{
  key: ComparisonMetric;
  label: string;
  unit?: string;
}> = [
  { key: "students", label: "Students" },
  { key: "activeStudents", label: "Active 7d" },
  { key: "completionRate", label: "Completion Rate", unit: "%" },
  { key: "completedChapters", label: "Completed Chapters" },
];

const comparisonPalette = [
  "#E8871E",
  "#F3A847",
  "#EFC58B",
  "#C86B1D",
  "#DDA15E",
  "#B75A19",
  "#F7C873",
  "#9C4812",
];

function canDrill(level: AnalyticsLevel) {
  return level !== "chapters";
}

function buildNextRequest(currentRequest: AnalyticsRequest, level: AnalyticsLevel, row: AnalyticsRow): AnalyticsRequest {
  if (level === "organizations") {
    return { orgId: row.id };
  }

  if (level === "centres") {
    return {
      ...currentRequest,
      centreId: row.id,
      classNum: undefined,
      subjectId: undefined,
    };
  }

  if (level === "classes") {
    return {
      ...currentRequest,
      classNum: Number(row.id),
      subjectId: undefined,
    };
  }

  if (level === "subjects") {
    return {
      ...currentRequest,
      subjectId: row.id,
    };
  }

  return currentRequest;
}

function formatDate(value: string | null) {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number) {
  if (!seconds) return "0m";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (!mins) return `${secs}s`;
  if (!secs) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function getStudentStatus(student: AnalyticsStudentRow) {
  if (student.trackedUnits > 0 && student.completedUnits >= student.trackedUnits) return "Completed";
  if (student.lastWatchedAt) return "In progress";
  return "Not started";
}

function getLessonStatusTone(status: AnalyticsStudentDetail["lessons"][number]["status"]) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 border border-emerald-100";
  }

  if (status === "in_progress") {
    return "bg-orange-50 text-orange-primary border border-orange-primary/15";
  }

  return "bg-slate-50 text-slate-500 border border-slate-200";
}

function comparisonHeading(level: AnalyticsLevel) {
  if (level === "organizations") return "Organization comparison";
  if (level === "centres") return "Centre comparison";
  if (level === "classes") return "Class comparison";
  if (level === "subjects") return "Subject comparison";
  return "Chapter comparison";
}

function nextLevelLabel(level: AnalyticsLevel) {
  if (level === "organizations") return "View centres";
  if (level === "centres") return "View classes";
  if (level === "classes") return "View subjects";
  if (level === "subjects") return "View chapters";
  return "Details";
}

function scopeSummary(viewer: AnalyticsPageData["viewer"]) {
  if (viewer.roleScope === "platform") return "Platform-wide view across all organizations";
  if (viewer.roleScope === "organization") return `Organization scope: ${viewer.orgName ?? "Current organization"}`;
  return `Centre scope: ${viewer.centreName ?? "Current centre"}`;
}

function EmptyChapterSelectionState() {
  return (
    <ClayCard hover={false} className="!p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-clay-sm bg-orange-50 shadow-clay-pill">
          <BookOpen className="h-5 w-5 text-orange-primary" />
        </div>
        <div>
          <h3 className="font-poppins text-lg font-bold text-heading">Select A Chapter</h3>
          <p className="text-sm text-muted">
            Click a chapter card above to drill into that chapter and review the student watchlist.
          </p>
        </div>
      </div>
    </ClayCard>
  );
}

function comparisonValue(row: AnalyticsRow, metric: ComparisonMetric) {
  return row[metric];
}

function ComparisonChart({
  rows,
  metric,
}: {
  rows: AnalyticsRow[];
  metric: ComparisonMetric;
}) {
  const topRows = rows.slice(0, 8).map((row, index) => ({
    name: row.label,
    value: comparisonValue(row, metric),
    color: comparisonPalette[index % comparisonPalette.length],
  }));

  if (!topRows.length) {
    return <p className="text-sm text-muted">No comparison data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={topRows} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#7c6a58", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          dataKey="name"
          type="category"
          width={92}
          tick={{ fill: "#5d4f40", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(232, 135, 30, 0.08)" }}
          contentStyle={{
            borderRadius: 18,
            border: "1px solid rgba(232, 135, 30, 0.12)",
            boxShadow: "0 18px 40px rgba(142, 94, 37, 0.14)",
            backgroundColor: "#fff9f1",
          }}
        />
        <Bar dataKey="value" radius={[10, 10, 10, 10]}>
          {topRows.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendChart({ dataset }: { dataset: AnalyticsDataset }) {
  if (!dataset.timeline.length) {
    return <p className="text-sm text-muted">No trend data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={dataset.timeline} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <defs>
          <linearGradient id="watchSessionsFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#E8871E" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#E8871E" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="activeStudentsFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="#2A9D8F" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#2A9D8F" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eadbc8" />
        <XAxis dataKey="label" tick={{ fill: "#7c6a58", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#7c6a58", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 18,
            border: "1px solid rgba(232, 135, 30, 0.12)",
            boxShadow: "0 18px 40px rgba(142, 94, 37, 0.14)",
            backgroundColor: "#fff9f1",
          }}
        />
        <Area
          type="monotone"
          dataKey="watchSessions"
          stroke="#E8871E"
          fill="url(#watchSessionsFill)"
          strokeWidth={3}
          dot={false}
          name="Watch sessions"
        />
        <Area
          type="monotone"
          dataKey="activeStudents"
          stroke="#2A9D8F"
          fill="url(#activeStudentsFill)"
          strokeWidth={3}
          dot={false}
          name="Active students"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SummaryCards({ dataset }: { dataset: AnalyticsDataset }) {
  const { summary } = dataset;
  const scopedCompletionRate =
    dataset.level === "chapters"
      ? summary.trackedChapters
        ? Math.round((dataset.rows.filter((row) => row.completedChapters > 0).length / summary.trackedChapters) * 100)
        : 0
      : summary.completionRate;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-clay-sm clay-surface shadow-clay-pill">
            <Users className="h-6 w-6 text-orange-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-heading">{summary.students}</p>
            <p className="text-xs text-muted">Students in scope</p>
          </div>
        </div>
      </ClayCard>

      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-clay-sm bg-emerald-50 shadow-clay-pill">
            <Activity className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-heading">{summary.activeStudents}</p>
            <p className="text-xs text-muted">Active in last 7 days</p>
          </div>
        </div>
      </ClayCard>

      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center gap-4">
          <ProgressRing percentage={scopedCompletionRate} size={60} strokeWidth={7}>
            <span className="text-xs font-bold text-heading">{scopedCompletionRate}%</span>
          </ProgressRing>
          <div>
            <p className="text-lg font-bold text-heading">Content completion</p>
          </div>
        </div>
      </ClayCard>

      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-clay-sm bg-orange-50 shadow-clay-pill">
            <TrendingUp className="h-6 w-6 text-orange-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-heading">{summary.avgWatchPercentage}%</p>
            <p className="text-xs text-muted">Average watch quality</p>
          </div>
        </div>
      </ClayCard>

      <ClayCard hover={false} className="!p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-clay-sm bg-amber-50 shadow-clay-pill">
            <BookOpen className="h-6 w-6 text-amber-700" />
          </div>
          <div>
            <p className="text-2xl font-bold text-heading">{summary.trackedChapters}</p>
            <p className="text-xs text-muted">Chapters in scope</p>
          </div>
        </div>
      </ClayCard>
    </div>
  );
}

function DrilldownList({
  dataset,
  metric,
  onSelect,
  loadingRowId,
  selectedRowId,
}: {
  dataset: AnalyticsDataset;
  metric: ComparisonMetric;
  onSelect: (row: AnalyticsRow) => void;
  loadingRowId: string | null;
  selectedRowId?: string | null;
}) {
  if (!dataset.rows.length) {
    return (
      <ClayCard hover={false} className="!p-8">
        <p className="text-sm text-muted">{dataset.emptyMessage}</p>
      </ClayCard>
    );
  }

  return (
    <ClayCard hover={false} className="!p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-poppins text-lg font-bold text-heading">Drill-down leaderboard</h3>
          <p className="text-sm text-muted">
            Click a row to{" "}
            {dataset.level === "chapters"
              ? "focus a chapter and review the students in it"
              : nextLevelLabel(dataset.level).toLowerCase()}
            .
          </p>
        </div>
        <div className="rounded-full bg-orange-primary/10 px-3 py-1 text-xs font-semibold text-orange-primary">
          Ranking by {comparisonMetricOptions.find((option) => option.key === metric)?.label.toLowerCase()}
        </div>
      </div>

      <div className="space-y-3">
        {dataset.rows.map((row) => {
          const clickable = canDrill(dataset.level);
          const interactive = clickable || dataset.level === "chapters";
          const chapterFocusMode = dataset.level === "chapters";
          const selected = selectedRowId === row.id;
          const completionWidth = `${Math.min(row.completionRate, 100)}%`;
          const containerClassName = [
            "w-full rounded-clay px-4 py-4 text-left",
            chapterFocusMode
              ? "cursor-pointer border border-orange-primary/15 bg-white shadow-clay-pill ring-1 ring-orange-primary/5 transition hover:-translate-y-0.5 hover:border-orange-primary/35 hover:bg-[#fffaf4] hover:shadow-clay-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-primary/35"
              : interactive
                ? "cursor-pointer border border-orange-primary/10 bg-cream/60 transition hover:border-orange-primary/20 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-primary/30"
                : "border border-orange-primary/12 bg-white shadow-clay-pill",
            selected
              ? "border-orange-primary/35 bg-gradient-to-br from-white to-[#fff8f0] shadow-clay-orange"
              : "",
          ]
            .filter(Boolean)
            .join(" ");

          const content = (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-base font-semibold text-heading">{row.label}</p>
                    {clickable && !chapterFocusMode && (
                      <span className="rounded-full bg-orange-primary/10 px-2 py-0.5 text-[11px] font-semibold text-orange-primary">
                        Drill
                      </span>
                    )}
                    {selected && dataset.level === "chapters" && (
                      <span className="rounded-full bg-orange-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                        Selected
                      </span>
                    )}
                  </div>
                  {row.subtitle && (
                    <p className={`mt-1 text-sm ${chapterFocusMode ? "text-heading/70" : "text-muted"}`}>
                      {row.subtitle}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 text-right">
                  {chapterFocusMode && (
                    <span className="hidden rounded-full bg-orange-primary/10 px-3 py-1 text-[11px] font-semibold text-orange-primary md:inline-flex">
                      View students
                    </span>
                  )}
                  {loadingRowId === row.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-orange-primary" />
                  ) : interactive ? (
                    <ChevronRight className={`h-4 w-4 ${chapterFocusMode ? "text-orange-primary" : "text-muted"}`} />
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className={`rounded-2xl px-3 py-2 shadow-clay-pill ${chapterFocusMode ? "bg-[#fff9f4]" : "bg-white/80"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Students</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.students}</p>
                </div>
                <div className={`rounded-2xl px-3 py-2 shadow-clay-pill ${chapterFocusMode ? "bg-[#fff9f4]" : "bg-white/80"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Active 7d</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.activeStudents}</p>
                </div>
                <div className={`rounded-2xl px-3 py-2 shadow-clay-pill ${chapterFocusMode ? "bg-[#fff9f4]" : "bg-white/80"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completed chapters</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.completedChapters}</p>
                </div>
                <div className={`rounded-2xl px-3 py-2 shadow-clay-pill ${chapterFocusMode ? "bg-[#fff9f4]" : "bg-white/80"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.completionRate}%</p>
                </div>
                <div className={`rounded-2xl px-3 py-2 shadow-clay-pill ${chapterFocusMode ? "bg-[#fff9f4]" : "bg-white/80"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Last activity</p>
                  <p className="mt-1 text-sm font-semibold text-heading">{formatDate(row.lastActivityAt)}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>{dataset.level === "chapters" ? "Lesson progress" : "Chapter completion"}</span>
                  <span>{row.completionRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-orange-primary/10">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-orange-primary to-orange-400"
                    style={{ width: completionWidth }}
                  />
                </div>
              </div>
            </>
          );

          if (!interactive) {
            return (
              <div key={row.id} className={containerClassName}>
                {content}
              </div>
            );
          }

          return (
            <button
              type="button"
              key={row.id}
              onClick={() => onSelect(row)}
              className={containerClassName}
            >
              {content}
            </button>
          );
        })}
      </div>
    </ClayCard>
  );
}

function StudentTable({
  title,
  subtitle,
  rows,
  onSelect,
  selectedStudentId,
}: {
  title: string;
  subtitle: string;
  rows: AnalyticsDataset["students"];
  onSelect?: (student: AnalyticsStudentRow) => void;
  selectedStudentId?: string | null;
}) {
  if (!rows?.length) return null;

  return (
    <ClayCard hover={false} className="!p-6">
      <div className="mb-4">
        <h3 className="font-poppins text-lg font-bold text-heading">{title}</h3>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>

      <div className="space-y-3">
        {rows.map((student) => {
          const status = getStudentStatus(student);
          const selected = selectedStudentId === student.id;
          const interactive = Boolean(onSelect);
          const className = [
            "w-full rounded-clay border border-orange-primary/10 bg-cream/60 px-4 py-4 text-left",
            interactive ? "transition hover:border-orange-primary/20 hover:bg-white" : "",
            selected ? "border-orange-primary/30 bg-white shadow-clay-orange" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const content = (
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-heading">{student.name}</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      status === "Completed"
                        ? "bg-emerald-50 text-emerald-700"
                        : status === "In progress"
                          ? "bg-orange-50 text-orange-primary"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {[student.centreName, student.classLabel, student.board, student.medium].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</p>
                  <p className="mt-1 font-bold text-heading">{student.completionRate}%</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {student.unitLabel === "lessons" ? "Lessons" : "Chapters"}
                  </p>
                  <p className="mt-1 font-bold text-heading">
                    {student.completedUnits}/{student.trackedUnits}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Watch quality</p>
                  <p className="mt-1 font-bold text-heading">{student.avgWatchPercentage}%</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Last active</p>
                  <p className="mt-1 font-bold text-heading">{formatDate(student.lastWatchedAt)}</p>
                </div>
                <div className="hidden md:block">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Review</p>
                  <p className="mt-1 inline-flex items-center gap-1 font-bold text-orange-primary">
                    Open
                    {interactive && <ChevronRight className="h-4 w-4" />}
                  </p>
                </div>
              </div>
            </div>
          );

          if (!interactive) {
            return (
              <div key={student.id} className={className}>
                {content}
              </div>
            );
          }

          return (
            <button key={student.id} type="button" className={className} onClick={() => onSelect?.(student)}>
              {content}
            </button>
          );
        })}
      </div>
    </ClayCard>
  );
}

function StudentDetailDrawer({
  chapterView,
  student,
  detail,
  onClose,
}: {
  chapterView: AnalyticsChapterView | null;
  student: AnalyticsStudentRow | null;
  detail: AnalyticsStudentDetail | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!student || !detail || !chapterView) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [chapterView, detail, onClose, student]);

  if (!student || !detail || !chapterView) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close student breakdown"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-white/20 bg-gradient-to-br from-[#fffaf4] via-white to-[#fff5ea] shadow-[0_32px_80px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between border-b border-orange-primary/10 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-primary">
              {chapterView.chapterLabel}
            </p>
            <h2 className="mt-2 font-poppins text-xl font-bold text-heading">{student.name}</h2>
            <p className="mt-1 text-sm text-muted">{chapterView.chapterTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-muted shadow-sm transition hover:text-heading"
            aria-label="Close student breakdown"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <section className="rounded-[28px] border border-orange-primary/10 bg-white/85 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  getStudentStatus(student) === "Completed"
                    ? "bg-emerald-50 text-emerald-700"
                    : getStudentStatus(student) === "In progress"
                      ? "bg-orange-50 text-orange-primary"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {getStudentStatus(student)}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-muted shadow-sm">
                {[student.centreName, student.classLabel, student.board, student.medium].filter(Boolean).join(" · ")}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-3xl border border-orange-primary/10 bg-[#fff8f0] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Completion</p>
                <p className="mt-2 text-2xl font-bold text-heading">{detail.completionRate}%</p>
                <p className="text-sm text-muted">
                  {detail.completedLessons}/{detail.totalLessons} lessons complete
                </p>
              </div>
              <div className="rounded-3xl border border-orange-primary/10 bg-[#fff8f0] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Watch quality</p>
                <p className="mt-2 text-2xl font-bold text-heading">{detail.avgWatchPercentage}%</p>
                <p className="text-sm text-muted">
                  {detail.inProgressLessons} lesson{detail.inProgressLessons === 1 ? "" : "s"} in progress
                </p>
              </div>
              <div className="rounded-3xl border border-orange-primary/10 bg-[#fff8f0] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Last active</p>
                <p className="mt-2 text-lg font-bold text-heading">{formatDate(detail.lastWatchedAt)}</p>
              </div>
              <div className="rounded-3xl border border-orange-primary/10 bg-[#fff8f0] px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Chapter scope</p>
                <p className="mt-2 text-lg font-bold text-heading">{chapterView.lessonCount} lessons</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="font-poppins text-lg font-bold text-heading">Lesson breakdown</h3>
              <p className="text-sm text-muted">See exactly where this learner is progressing or getting stuck.</p>
            </div>

            <div className="space-y-3">
              {detail.lessons.map((lesson, index) => (
                <div
                  key={lesson.id}
                  className="rounded-[28px] border border-orange-primary/10 bg-white/90 px-4 py-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-sm font-semibold text-orange-primary">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-heading">{lesson.title}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getLessonStatusTone(lesson.status)}`}>
                          {lesson.status === "completed"
                            ? "Completed"
                            : lesson.status === "in_progress"
                              ? "In progress"
                              : "Not started"}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatDuration(lesson.durationSeconds)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {lesson.status === "completed" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <CirclePlay className="h-3.5 w-3.5 text-orange-primary" />
                          )}
                          {lesson.watchedPercentage}% watched
                        </span>
                        <span>{formatDate(lesson.lastWatchedAt)}</span>
                      </div>

                      <div className="mt-3 h-2 rounded-full bg-orange-primary/10">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-orange-primary to-orange-400"
                          style={{ width: `${Math.min(lesson.watchedPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function AlertsPanel({
  rows,
  onSelect,
  selectedStudentId,
}: {
  rows: AnalyticsStudentRow[];
  onSelect?: (student: AnalyticsStudentRow) => void;
  selectedStudentId?: string | null;
}) {
  const neverLoggedInRows = rows.filter((student) => !student.lastWatchedAt);
  const dropOffRows = rows.filter((student) => Boolean(student.lastWatchedAt));
  const averageCompletion = rows.length
    ? Math.round(rows.reduce((sum, student) => sum + student.completionRate, 0) / rows.length)
    : 0;

  const renderStudentRow = (student: AnalyticsStudentRow) => {
    const selected = selectedStudentId === student.id;
    const interactive = Boolean(onSelect);
    const className = [
      "w-full rounded-clay-sm border border-red-100 bg-red-50/60 px-4 py-3 text-left",
      interactive ? "transition hover:border-red-200 hover:bg-red-50" : "",
      selected ? "border-orange-primary/30 bg-white shadow-clay-orange" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const content = (
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-heading">{student.name}</p>
          <p className="text-sm text-muted">
            {[student.centreName, student.classLabel, student.board, student.medium].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</p>
            <p className="mt-1 font-bold text-heading">{student.completionRate}%</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {student.unitLabel === "lessons" ? "Lessons" : "Chapters"}
            </p>
            <p className="mt-1 font-bold text-heading">
              {student.completedUnits}/{student.trackedUnits}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Last active</p>
            <p className="mt-1 font-bold text-heading">{formatDate(student.lastWatchedAt)}</p>
          </div>
          <div className="hidden md:block">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Review</p>
            <p className="mt-1 inline-flex items-center gap-1 font-bold text-orange-primary">
              Open
              {interactive && <ChevronRight className="h-4 w-4" />}
            </p>
          </div>
        </div>
      </div>
    );

    if (!interactive) {
      return (
        <div key={student.id} className={className}>
          {content}
        </div>
      );
    }

    return (
      <button key={student.id} type="button" className={className} onClick={() => onSelect?.(student)}>
        {content}
      </button>
    );
  };

  if (!dropOffRows.length && !neverLoggedInRows.length) {
    return (
      <ClayCard hover={false} className="!p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-clay-sm bg-emerald-50 shadow-clay-pill">
            <Target className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-poppins text-lg font-bold text-heading">Drop-off alerts</h3>
            <p className="text-sm text-muted">No inactive students in the current scope right now.</p>
          </div>
        </div>
      </ClayCard>
    );
  }

  return (
    <ClayCard hover={false} className="!p-0 overflow-hidden">
      <details className="group">
        <summary className="list-none cursor-pointer px-6 py-6 marker:content-none">
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-clay-sm bg-red-50 shadow-clay-pill">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <h3 className="font-poppins text-lg font-bold text-heading">Drop-off alerts</h3>
                  <p className="text-sm text-muted">Students who have gone quiet or never started in the current scope.</p>
                </div>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-clay-sm bg-white shadow-clay-pill transition-transform group-open:rotate-180">
                <ChevronDown className="h-5 w-5 text-orange-primary" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-red-50/70 px-4 py-3 shadow-clay-pill">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Students at risk</p>
                <p className="mt-1 text-2xl font-bold text-heading">{rows.length}</p>
              </div>
              <div className="rounded-2xl bg-orange-50/70 px-4 py-3 shadow-clay-pill">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Gone quiet</p>
                <p className="mt-1 text-2xl font-bold text-heading">{dropOffRows.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-clay-pill">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Never logged in</p>
                <p className="mt-1 text-2xl font-bold text-heading">{neverLoggedInRows.length}</p>
                <p className="mt-1 text-xs text-muted">Avg completion {averageCompletion}%</p>
              </div>
            </div>
          </div>
        </summary>

        <div className="border-t border-orange-primary/10 px-6 pb-6 pt-2">
          <div className="space-y-6">
            {dropOffRows.length ? (
              <section>
                <div className="mb-3">
                  <h4 className="font-poppins text-base font-bold text-heading">Gone quiet</h4>
                  <p className="text-sm text-muted">Students who were active before, but have gone inactive in the current scope.</p>
                </div>

                <div className="space-y-3">
                  {dropOffRows.map(renderStudentRow)}
                </div>
              </section>
            ) : null}

            {neverLoggedInRows.length ? (
              <section>
                <div className="mb-3">
                  <h4 className="font-poppins text-base font-bold text-heading">Never logged in</h4>
                  <p className="text-sm text-muted">Students with no learning activity recorded yet in the current scope.</p>
                </div>

                <div className="space-y-3">
                  {neverLoggedInRows.map(renderStudentRow)}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </details>
    </ClayCard>
  );
}

export function AnalyticsDashboard({
  viewer,
  rootLabel,
  initialRequest,
  initialDataset,
  generatedAt,
}: AnalyticsPageData) {
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      label: rootLabel,
      request: initialRequest,
      dataset: initialDataset,
    },
  ]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(generatedAt);
  const [comparisonMetric, setComparisonMetric] = useState<ComparisonMetric>("students");
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const chapterStudentSectionRef = useRef<HTMLDivElement | null>(null);

  const current = history[history.length - 1];
  const currentChapterView =
    current.dataset.level === "chapters" && selectedChapterId
      ? current.dataset.chapterViews?.[selectedChapterId] ?? null
      : null;
  const visibleStudents =
    current.dataset.level === "chapters" ? currentChapterView?.students : current.dataset.students;
  const visibleInactiveStudents =
    current.dataset.level === "chapters" ? currentChapterView?.inactiveStudents ?? [] : current.dataset.inactiveStudents;
  const selectedStudent = selectedStudentId ? visibleStudents?.find((student) => student.id === selectedStudentId) ?? null : null;
  const selectedStudentDetail = selectedStudentId
    ? currentChapterView?.studentDetails.find((detail) => detail.studentId === selectedStudentId) ?? null
    : null;

  useEffect(() => {
    if (current.dataset.level !== "chapters") {
      if (selectedChapterId !== null) setSelectedChapterId(null);
      if (selectedStudentId !== null) setSelectedStudentId(null);
      return;
    }
    if (selectedChapterId && !current.dataset.chapterViews?.[selectedChapterId]) {
      setSelectedChapterId(null);
      setSelectedStudentId(null);
    }
  }, [current.dataset, selectedChapterId, selectedStudentId]);

  useEffect(() => {
    if (current.dataset.level !== "chapters") return;

    const chapterStudents = currentChapterView?.students ?? [];
    if (!selectedStudentId || chapterStudents.some((student) => student.id === selectedStudentId)) return;
    setSelectedStudentId(null);
  }, [current.dataset.level, currentChapterView, selectedStudentId]);

  const handleDrill = (row: AnalyticsRow) => {
    if (current.dataset.level === "chapters") {
      setSelectedChapterId(row.id);
      setSelectedStudentId(null);
      window.requestAnimationFrame(() => {
        chapterStudentSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }

    if (!canDrill(current.dataset.level)) return;

    const nextRequest = buildNextRequest(current.request, current.dataset.level, row);
    setLoadingRowId(row.id);
    setError(null);

    startTransition(() => {
      void getAnalyticsDatasetAction(nextRequest)
        .then((dataset) => {
          setHistory((previous) => [
            ...previous,
            {
              label: row.label,
              request: nextRequest,
              dataset,
            },
          ]);
          setLastUpdatedAt(new Date().toISOString());
          setSelectedChapterId(null);
          setSelectedStudentId(null);
        })
        .catch((caughtError) => {
          const message = caughtError instanceof Error ? caughtError.message : "Failed to load analytics.";
          setError(message);
        })
        .finally(() => {
          setLoadingRowId(null);
        });
    });
  };

  return (
    <div className="space-y-8">
      <ClayCard hover={false} className="!p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              {history.map((entry, index) => {
                const isLast = index === history.length - 1;

                return (
                  <div key={`${entry.label}-${index}`} className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isLast}
                      onClick={() => setHistory((previous) => previous.slice(0, index + 1))}
                      className="rounded-full px-3 py-1 font-medium text-muted transition hover:bg-orange-primary/10 hover:text-orange-primary disabled:bg-orange-primary/10 disabled:text-orange-primary"
                    >
                      {entry.label}
                    </button>
                    {!isLast && <ChevronRight className="h-4 w-4 text-muted" />}
                  </div>
                );
              })}
            </div>
            <h1 className="font-poppins text-2xl font-bold text-heading">{current.dataset.title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted">{current.dataset.subtitle}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-orange-primary/10 px-3 py-1 text-xs font-semibold text-orange-primary">
                {scopeSummary(viewer)}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                Updated {formatTimestamp(lastUpdatedAt)}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted shadow-[inset_0_0_0_1px_rgba(232,135,30,0.08)]">
                Completion is based on accessible chapters in the current scope
              </span>
            </div>
          </div>

          <div className="rounded-clay bg-gradient-to-br from-orange-primary/10 via-white to-amber-50 px-4 py-3 shadow-clay">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-primary">Current focus</p>
            <p className="mt-1 text-lg font-bold text-heading">{comparisonHeading(current.dataset.level)}</p>
            <p className="text-sm text-muted">{current.dataset.rows.length} visible segments</p>
          </div>
        </div>
      </ClayCard>

      {error && (
        <ClayCard hover={false} className="!p-4">
          <p className="text-sm text-red-500">{error}</p>
        </ClayCard>
      )}

      <SummaryCards dataset={current.dataset} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <ClayCard hover={false} className="!p-6">
          <div className="mb-4">
            <h3 className="font-poppins text-lg font-bold text-heading">Engagement trend</h3>
            <p className="text-sm text-muted">Daily active students and watch sessions over the last 30 days.</p>
          </div>
          <TrendChart dataset={current.dataset} />
        </ClayCard>

        <ClayCard hover={false} className="!p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-poppins text-lg font-bold text-heading">{comparisonHeading(current.dataset.level)}</h3>
              <p className="text-sm text-muted">Switch the metric to compare the current entities side by side.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {comparisonMetricOptions.map((option) => {
                const selected = option.key === comparisonMetric;
                return (
                  <button
                    type="button"
                    key={option.key}
                    onClick={() => setComparisonMetric(option.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      selected
                        ? "bg-orange-primary text-white shadow-clay-orange"
                        : "bg-orange-primary/10 text-orange-primary hover:bg-orange-primary/15"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ComparisonChart rows={current.dataset.rows} metric={comparisonMetric} />
        </ClayCard>
      </div>

      <DrilldownList
        dataset={current.dataset}
        metric={comparisonMetric}
        onSelect={handleDrill}
        loadingRowId={loadingRowId}
        selectedRowId={current.dataset.level === "chapters" ? selectedChapterId : null}
      />

      <div ref={chapterStudentSectionRef}>
        {current.dataset.level === "chapters" && !currentChapterView ? (
          <EmptyChapterSelectionState />
        ) : (
          <>
            {visibleStudents && (
              <StudentTable
                title={current.dataset.level === "chapters" && currentChapterView ? `${currentChapterView.chapterLabel} student watchlist` : "Student watchlist"}
                subtitle={
                  current.dataset.level === "chapters" && currentChapterView
                    ? `${currentChapterView.chapterTitle} · ${currentChapterView.lessonCount} lessons. Click a learner to review lesson-level progress.`
                    : "Learner-level progress for the selected subject."
                }
                rows={visibleStudents}
                onSelect={current.dataset.level === "chapters" ? (student) => setSelectedStudentId(student.id) : undefined}
                selectedStudentId={selectedStudentId}
              />
            )}

            <AlertsPanel
              rows={visibleInactiveStudents}
              onSelect={current.dataset.level === "chapters" ? (student) => setSelectedStudentId(student.id) : undefined}
              selectedStudentId={selectedStudentId}
            />
          </>
        )}
      </div>

      {current.dataset.level === "chapters" && (
        <StudentDetailDrawer
          chapterView={currentChapterView}
          student={selectedStudent}
          detail={selectedStudentDetail}
          onClose={() => setSelectedStudentId(null)}
        />
      )}

      {isPending && (
        <div className="fixed bottom-6 right-6 z-50 rounded-full bg-heading px-4 py-2 text-sm font-medium text-white shadow-2xl">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading next layer
          </span>
        </div>
      )}
    </div>
  );
}
