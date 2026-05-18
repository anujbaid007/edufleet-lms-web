"use client";

import { useState, useMemo } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Header } from "@/components/dashboard/header";
import { ContentLibraryBrowser, type LibraryChapterCard } from "@/components/admin/content-library-browser";
import { ContentLibraryTree, type ClassGroup } from "@/components/admin/content-library-tree";
import { cn } from "@/lib/utils";

type LibraryStats = {
  chapterCount: number;
  videoCount: number;
  classCount: number;
};

type ViewMode = "showcase" | "list";
type ContentFilter = "all" | "regular" | "nep_demo";

export function ContentLibraryViewSwitcher({
  chapters,
  tree,
}: {
  chapters: LibraryChapterCard[];
  tree: ClassGroup[];
  stats?: LibraryStats;
}) {
  const [mode, setMode] = useState<ViewMode>("showcase");
  const [contentFilter, setContentFilter] = useState<ContentFilter>("regular");

  const hasNepDemos = chapters.some((c) => c.contentType === "nep_demo");

  const filteredChapters = useMemo(() => {
    if (contentFilter === "all") return chapters;
    return chapters.filter((c) => c.contentType === contentFilter);
  }, [chapters, contentFilter]);

  const filteredTree = useMemo(() => {
    if (contentFilter === "all") return tree;
    return tree
      .map((classGroup) => ({
        ...classGroup,
        mediums: classGroup.mediums
          .map((medium) => ({
            ...medium,
            subjects: medium.subjects
              .map((subject) => ({
                ...subject,
                chapters: subject.chapters.filter((ch) => ch.contentType === contentFilter),
              }))
              .filter((s) => s.chapters.length > 0),
          }))
          .filter((m) => m.subjects.length > 0),
      }))
      .filter((cg) => cg.mediums.length > 0);
  }, [tree, contentFilter]);

  const viewToggle = (
    <div className="flex items-center gap-3">
      {hasNepDemos && (
        <div className="inline-flex rounded-full border border-orange-primary/10 bg-[#fff8f1] p-1 shadow-clay-pill">
          {([
            { key: "regular" as ContentFilter, label: "Regular" },
            { key: "nep_demo" as ContentFilter, label: "NEP Demos" },
            { key: "all" as ContentFilter, label: "All" },
          ]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setContentFilter(opt.key)}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-semibold transition-all",
                contentFilter === opt.key
                  ? "clay-surface-orange text-white shadow-clay-orange"
                  : "text-body hover:text-heading"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      <div className="inline-flex rounded-full border border-orange-primary/10 bg-[#fff8f1] p-1 shadow-clay-pill">
        <button
          type="button"
          onClick={() => setMode("showcase")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
            mode === "showcase"
              ? "clay-surface-orange text-white shadow-clay-orange"
              : "text-body hover:text-heading"
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          Grid View
        </button>
        <button
          type="button"
          onClick={() => setMode("list")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
            mode === "list"
              ? "clay-surface-orange text-white shadow-clay-orange"
              : "text-body hover:text-heading"
          )}
        >
          <List className="h-4 w-4" />
          List View
        </button>
      </div>
    </div>
  );

  const filteredStats = {
    chapterCount: filteredChapters.length,
    videoCount: filteredChapters.reduce((s, c) => s + c.videoCount, 0),
    classCount: new Set(filteredChapters.map((c) => c.classNum)).size,
  };

  return (
    <div className="space-y-6">
      {mode === "showcase" ? (
        <ContentLibraryBrowser chapters={filteredChapters} searchAccessory={viewToggle} />
      ) : (
        <div className="space-y-6">
          <Header
            title="Content Library"
            subtitle={`${filteredStats.chapterCount} chapters · ${filteredStats.videoCount} videos across ${filteredStats.classCount} classes`}
          >
            {viewToggle}
          </Header>
          <ContentLibraryTree tree={filteredTree} />
        </div>
      )}
    </div>
  );
}
