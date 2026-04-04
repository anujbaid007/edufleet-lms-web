"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  BarChart3,
  Users,
  GraduationCap,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/lib/actions/auth";

interface SidebarProps {
  userRole: string;
  userName: string;
}

const studentLinks = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/progress", label: "My Progress", icon: BarChart3 },
];

const teacherLinks = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/students", label: "My Students", icon: Users },
  { href: "/dashboard/progress", label: "My Progress", icon: BarChart3 },
];

export function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const links = userRole === "teacher" ? teacherLinks : studentLinks;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 z-40 flex flex-col clay-surface border-r-2 border-white/60 transition-all duration-300",
        collapsed ? "w-20" : "w-64"
      )}
      style={{
        boxShadow: "8px 0 32px rgba(200,160,120,0.08), inset -1px 0 0 rgba(255,255,255,0.8)",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-6 flex items-center gap-3 border-b border-orange-primary/10">
        <div className="shrink-0 w-10 h-10 rounded-clay-sm clay-surface-orange flex items-center justify-center shadow-clay-orange">
          <GraduationCap className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-poppins font-bold text-heading text-lg">
            Edu<span className="text-gradient-orange">Fleet</span>
          </span>
        )}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-clay-sm text-sm font-medium transition-all duration-200",
                isActive
                  ? "clay-surface-orange text-white shadow-clay-orange"
                  : "text-body hover:text-heading hover:bg-cream/80"
              )}
            >
              <link.icon className={cn("w-5 h-5 shrink-0", isActive && "text-white")} />
              {!collapsed && <span>{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User + Collapse */}
      <div className="px-3 py-4 border-t border-orange-primary/10 space-y-2">
        {!collapsed && (
          <div className="px-4 py-2">
            <p className="text-sm font-semibold text-heading truncate">{userName}</p>
            <p className="text-xs text-muted capitalize">{userRole}</p>
          </div>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-clay-sm text-sm font-medium text-body hover:text-red-600 hover:bg-red-50/80 transition-all"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </form>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 text-muted hover:text-heading transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
