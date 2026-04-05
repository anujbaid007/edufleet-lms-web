"use client";

import { useState } from "react";
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

export function ContentLibraryViewSwitcher({
  chapters,
  tree,
  stats,
}: {
  chapters: LibraryChapterCard[];
  tree: ClassGroup[];
  stats: LibraryStats;
}) {
  const [mode, setMode] = useState<ViewMode>("showcase");

  const viewToggle = (
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
  );

  return (
    <div className="space-y-6">
      {mode === "showcase" ? (
        <ContentLibraryBrowser chapters={chapters} searchAccessory={viewToggle} />
      ) : (
        <div className="space-y-6">
          <Header
            title="Content Library"
            subtitle={`${stats.chapterCount} chapters · ${stats.videoCount} videos across ${stats.classCount} classes`}
          >
            {viewToggle}
          </Header>
          <ContentLibraryTree tree={tree} />
        </div>
      )}
    </div>
  );
}
