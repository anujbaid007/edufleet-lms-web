"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  BarChart3,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Trophy,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/lib/actions/auth";
import Image from "next/image";

interface SidebarProps {
  userRole: string;
  userName: string;
  mobileSlot?: React.ReactNode;
}

type DashboardLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive?: (pathname: string) => boolean;
};

function isHomeActive(pathname: string) {
  return pathname === "/dashboard";
}

function isSubjectsActive(pathname: string) {
  return (
    pathname === "/dashboard/subjects" ||
    pathname.startsWith("/dashboard/subjects/") ||
    pathname.startsWith("/dashboard/chapters/") ||
    pathname.startsWith("/dashboard/watch/")
  ) && !pathname.includes("/quiz");
}

function isQuizActive(pathname: string) {
  return pathname === "/dashboard/quizzes" || pathname.startsWith("/dashboard/chapters/") && pathname.endsWith("/quiz");
}

const studentLinks = [
  { href: "/dashboard", label: "Home", icon: Home, isActive: isHomeActive },
  { href: "/dashboard/subjects", label: "Subjects", icon: BookOpen, isActive: isSubjectsActive },
  { href: "/dashboard/quizzes", label: "Quiz", icon: Trophy, isActive: isQuizActive },
  { href: "/dashboard/progress", label: "My Progress", icon: BarChart3 },
] satisfies DashboardLink[];

const teacherLinks = [
  { href: "/dashboard", label: "Home", icon: Home, isActive: isHomeActive },
  { href: "/dashboard/subjects", label: "Subjects", icon: BookOpen, isActive: isSubjectsActive },
  { href: "/dashboard/quizzes", label: "Quiz", icon: Trophy, isActive: isQuizActive },
  { href: "/dashboard/students", label: "My Students", icon: Users },
  { href: "/dashboard/progress", label: "My Progress", icon: BarChart3 },
] satisfies DashboardLink[];

export function Sidebar({ userRole, userName, mobileSlot }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = userRole === "teacher" ? teacherLinks : studentLinks;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 border-b border-orange-primary/10 bg-[rgba(253,248,243,0.92)] px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 rounded-xl transition hover:opacity-90"
            aria-label="Go to dashboard"
          >
            <Image
              src="/logo-icon.png"
              alt="EduFleet"
              width={36}
              height={36}
              className="rounded-lg shadow-md"
            />
            <Image
              src="/logo.png"
              alt="EduFleet"
              width={108}
              height={30}
              className="brightness-90 contrast-125"
            />
          </Link>
          <div className="flex items-center gap-2">
            {mobileSlot}
            <button
              type="button"
              onClick={() => setMobileOpen((current) => !current)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-primary/15 bg-white/90 text-heading shadow-[0_10px_24px_rgba(214,153,68,0.12)]"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 flex flex-col clay-surface border-r-2 border-white/60 transition-all duration-300",
          "w-[84vw] max-w-[320px] lg:z-40",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-20" : "lg:w-64"
        )}
        style={{
          boxShadow: "8px 0 32px rgba(200,160,120,0.08), inset -1px 0 0 rgba(255,255,255,0.8)",
        }}
      >
        <div className="flex items-center gap-3 border-b border-orange-primary/10 px-5 py-5 relative">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 rounded-xl transition hover:opacity-90"
            aria-label="Go to dashboard"
          >
            <Image
              src="/logo-icon.png"
              alt="EduFleet"
              width={40}
              height={40}
              className="shrink-0 rounded-lg shadow-md"
            />
            {!collapsed && (
              <Image
                src="/logo.png"
                alt="EduFleet"
                width={120}
                height={33}
                className="brightness-90 contrast-125"
              />
            )}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-orange-primary/20 bg-white text-muted shadow-md transition-colors hover:text-orange-primary lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {links.map((link) => {
            const isActive = link.isActive
              ? link.isActive(pathname)
              : link.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-clay-sm px-4 py-3 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "clay-surface-orange text-white shadow-clay-orange"
                    : "text-body hover:bg-cream/80 hover:text-heading"
                )}
              >
                <link.icon className={cn("h-5 w-5 shrink-0", isActive && "text-white")} />
                {!collapsed && <span>{link.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-orange-primary/10 px-3 py-4">
          {!collapsed && (
            <div className="px-4 py-2">
              <p className="truncate text-sm font-semibold text-heading">{userName}</p>
              <p className="text-xs capitalize text-muted">{userRole}</p>
            </div>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-clay-sm px-4 py-3 text-sm font-medium text-body transition-all hover:bg-red-50/80 hover:text-red-600"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
