"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  Boxes,
  ChevronRight,
} from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/diaries", label: "Diaries", icon: FileText },
  { href: "/issues", label: "Issues / Delays", icon: AlertTriangle },
  { href: "/materials", label: "Materials", icon: Boxes },
];

type SidebarProps = {
  collapsed?: boolean;
};

export default function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`site-sidebar min-h-screen flex flex-col transition-all duration-300 ${
        collapsed ? "w-[92px]" : "w-[280px]"
      }`}
    >
      <div className="site-sidebar-header px-4 pt-8 pb-6">
        <div
          className={`flex items-center ${
            collapsed ? "justify-center" : "gap-3"
          }`}
        >
          <div className="site-sidebar-logo flex h-11 w-11 items-center justify-center rounded-2xl shrink-0">
            <FileText size={20} strokeWidth={2.3} />
          </div>

          {!collapsed && (
            <div>
              <h1 className="site-sidebar-brand">Site Diary</h1>
              <p className="site-sidebar-brand-subtitle">Reporting Dashboard</p>
            </div>
          )}
        </div>
      </div>

      <nav className="site-sidebar-nav px-3 py-6">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`site-sidebar-link group flex items-center rounded-2xl transition-all duration-300 ${
                active ? "site-sidebar-link-active" : ""
              } ${collapsed ? "justify-center px-2 py-4" : "justify-between px-4 py-4"}`}
              title={collapsed ? item.label : undefined}
            >
              <div
                className={`flex items-center min-w-0 ${
                  collapsed ? "justify-center" : "gap-3"
                }`}
              >
                <div
                  className={`site-sidebar-icon flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-300 ${
                    active ? "site-sidebar-icon-active" : ""
                  }`}
                >
                  <Icon size={19} strokeWidth={2.3} />
                </div>

                {!collapsed && (
                  <span className="site-sidebar-label truncate">
                    {item.label}
                  </span>
                )}
              </div>

              {!collapsed && (
                <ChevronRight
                  size={17}
                  className={`site-sidebar-arrow transition-all duration-300 ${
                    active ? "site-sidebar-arrow-active" : ""
                  }`}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-auto px-4 pb-6">
          <div className="site-sidebar-card rounded-3xl p-5">
            <p className="site-sidebar-card-kicker">Site Diary</p>
            <p className="site-sidebar-card-title">Daily Reporting System</p>
            <p className="site-sidebar-card-text">
              Track site activities, materials, delays, and daily reporting
              progress from one clean dashboard.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}