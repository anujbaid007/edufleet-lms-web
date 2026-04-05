"use client";

import { useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Loader2,
  Target,
  TrendingUp,
  Users,
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
  AnalyticsDataset,
  AnalyticsLevel,
  AnalyticsPageData,
  AnalyticsRequest,
  AnalyticsRow,
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
          <ProgressRing percentage={summary.completionRate} size={60} strokeWidth={7}>
            <span className="text-xs font-bold text-heading">{summary.completionRate}%</span>
          </ProgressRing>
          <div>
            <p className="text-lg font-bold text-heading">{summary.completedChapters}</p>
            <p className="text-xs text-muted">Completed chapters</p>
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
            <p className="text-xs text-muted">Chapter opportunities</p>
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
}: {
  dataset: AnalyticsDataset;
  metric: ComparisonMetric;
  onSelect: (row: AnalyticsRow) => void;
  loadingRowId: string | null;
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
            Click a row to {canDrill(dataset.level) ? nextLevelLabel(dataset.level).toLowerCase() : "review the current level"}.
          </p>
        </div>
        <div className="rounded-full bg-orange-primary/10 px-3 py-1 text-xs font-semibold text-orange-primary">
          Ranking by {comparisonMetricOptions.find((option) => option.key === metric)?.label.toLowerCase()}
        </div>
      </div>

      <div className="space-y-3">
        {dataset.rows.map((row) => {
          const clickable = canDrill(dataset.level);
          const completionWidth = `${Math.min(row.completionRate, 100)}%`;

          return (
            <button
              type="button"
              key={row.id}
              onClick={() => clickable && onSelect(row)}
              disabled={!clickable}
              className="w-full rounded-clay border border-orange-primary/10 bg-cream/60 px-4 py-4 text-left transition hover:border-orange-primary/20 hover:bg-white disabled:cursor-default"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="truncate text-base font-semibold text-heading">{row.label}</p>
                    {clickable && (
                      <span className="rounded-full bg-orange-primary/10 px-2 py-0.5 text-[11px] font-semibold text-orange-primary">
                        Drill
                      </span>
                    )}
                  </div>
                  {row.subtitle && <p className="mt-1 text-sm text-muted">{row.subtitle}</p>}
                </div>

                <div className="flex items-center gap-3 text-right">
                  {loadingRowId === row.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-orange-primary" />
                  ) : clickable ? (
                    <ChevronRight className="h-4 w-4 text-muted" />
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-2xl bg-white/70 px-3 py-2 shadow-clay-pill">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Students</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.students}</p>
                </div>
                <div className="rounded-2xl bg-white/70 px-3 py-2 shadow-clay-pill">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Active 7d</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.activeStudents}</p>
                </div>
                <div className="rounded-2xl bg-white/70 px-3 py-2 shadow-clay-pill">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completed chapters</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.completedChapters}</p>
                </div>
                <div className="rounded-2xl bg-white/70 px-3 py-2 shadow-clay-pill">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</p>
                  <p className="mt-1 text-base font-bold text-heading">{row.completionRate}%</p>
                </div>
                <div className="rounded-2xl bg-white/70 px-3 py-2 shadow-clay-pill">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Last activity</p>
                  <p className="mt-1 text-sm font-semibold text-heading">{formatDate(row.lastActivityAt)}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-muted">
                  <span>Chapter completion</span>
                  <span>{row.completionRate}%</span>
                </div>
                <div className="h-2 rounded-full bg-orange-primary/10">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-orange-primary to-orange-400"
                    style={{ width: completionWidth }}
                  />
                </div>
              </div>
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
}: {
  title: string;
  subtitle: string;
  rows: AnalyticsDataset["students"];
}) {
  if (!rows?.length) return null;

  return (
    <ClayCard hover={false} className="!p-6">
      <div className="mb-4">
        <h3 className="font-poppins text-lg font-bold text-heading">{title}</h3>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>

      <div className="space-y-3">
        {rows.map((student) => (
          <div
            key={student.id}
            className="rounded-clay border border-orange-primary/10 bg-cream/60 px-4 py-4"
          >
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <p className="text-base font-semibold text-heading">{student.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {[student.centreName, student.classLabel, student.board, student.medium].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</p>
                  <p className="mt-1 font-bold text-heading">{student.completionRate}%</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Chapters</p>
                  <p className="mt-1 font-bold text-heading">
                    {student.completedChapters}/{student.trackedChapters}
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </ClayCard>
  );
}

function AlertsPanel({ dataset }: { dataset: AnalyticsDataset }) {
  if (!dataset.inactiveStudents.length) {
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
    <ClayCard hover={false} className="!p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-clay-sm bg-red-50 shadow-clay-pill">
          <AlertTriangle className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h3 className="font-poppins text-lg font-bold text-heading">Drop-off alerts</h3>
          <p className="text-sm text-muted">Students who have gone quiet in the current scope.</p>
        </div>
      </div>

      <div className="space-y-3">
        {dataset.inactiveStudents.map((student) => (
          <div
            key={student.id}
            className="rounded-clay-sm border border-red-100 bg-red-50/60 px-4 py-3"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-heading">{student.name}</p>
                <p className="text-sm text-muted">
                  {[student.centreName, student.classLabel, student.board, student.medium].filter(Boolean).join(" · ")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Completion</p>
                  <p className="mt-1 font-bold text-heading">{student.completionRate}%</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Chapters</p>
                  <p className="mt-1 font-bold text-heading">
                    {student.completedChapters}/{student.trackedChapters}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Last active</p>
                  <p className="mt-1 font-bold text-heading">{formatDate(student.lastWatchedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ClayCard>
  );
}

export function AnalyticsDashboard({
  rootLabel,
  initialRequest,
  initialDataset,
}: AnalyticsPageData) {
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      label: rootLabel,
      request: initialRequest,
      dataset: initialDataset,
    },
  ]);
  const [comparisonMetric, setComparisonMetric] = useState<ComparisonMetric>("students");
  const [loadingRowId, setLoadingRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const current = history[history.length - 1];

  const handleDrill = (row: AnalyticsRow) => {
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
      />

      {current.dataset.students && (
        <StudentTable
          title="Student watchlist"
          subtitle="Learner-level progress for the selected subject."
          rows={current.dataset.students}
        />
      )}

      <AlertsPanel dataset={current.dataset} />

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
