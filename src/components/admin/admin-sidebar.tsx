"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  MapPin,
  Users,
  Shield,
  Upload,
  BarChart3,
  Library,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/lib/actions/auth";
import Image from "next/image";

interface AdminSidebarProps {
  userRole: string;
  userName: string;
}

const platformAdminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/orgs", label: "Organizations", icon: Building2 },
  { href: "/admin/centres", label: "Centres", icon: MapPin },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/library", label: "Content Library", icon: Library },
  { href: "/admin/access", label: "Content Access", icon: Shield },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

const orgAdminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/centres", label: "Centres", icon: MapPin },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/library", label: "Content Library", icon: Library },
  { href: "/admin/access", label: "Content Access", icon: Shield },
  { href: "/admin/bulk", label: "Bulk Upload", icon: Upload },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

const centreAdminLinks = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/library", label: "Content Library", icon: Library },
  { href: "/admin/bulk", label: "Bulk Upload", icon: Upload },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

function getLinks(role: string) {
  if (role === "platform_admin") return platformAdminLinks;
  if (role === "org_admin") return orgAdminLinks;
  return centreAdminLinks;
}

export function AdminSidebar({ userRole, userName }: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const links = getLinks(userRole);

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
      {/* Logo + Collapse */}
      <div className="px-5 py-5 flex items-center gap-3 border-b border-orange-primary/10 relative">
        <Image
          src="/logo-icon.png"
          alt="EduFleet"
          width={40}
          height={40}
          className="shrink-0 rounded-lg shadow-md"
        />
        {!collapsed && (
          <div>
            <Image
              src="/logo.png"
              alt="EduFleet"
              width={120}
              height={33}
              className="brightness-90 contrast-125"
            />
            <p className="text-[10px] text-orange-primary font-bold -mt-0.5 tracking-wide">ADMIN</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white shadow-md border border-orange-primary/20 flex items-center justify-center text-muted hover:text-orange-primary transition-colors z-50"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const isActive = pathname === link.href ||
            (link.href !== "/admin" && pathname.startsWith(link.href));
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

      {/* User */}
      <div className="px-3 py-4 border-t border-orange-primary/10 space-y-2">
        {!collapsed && (
          <div className="px-4 py-2">
            <p className="text-sm font-semibold text-heading truncate">{userName}</p>
            <p className="text-xs text-muted capitalize">{userRole.replace("_", " ")}</p>
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
      </div>
    </aside>
  );
}
