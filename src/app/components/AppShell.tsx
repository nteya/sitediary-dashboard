"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  Boxes,
  BarChart3,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/diaries", label: "Diaries", icon: FileText },
  { href: "/progress", label: "Weekly Progress", icon: BarChart3 },
  { href: "/issues", label: "Issues / Delays", icon: AlertTriangle },
  { href: "/materials", label: "Materials", icon: Boxes },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="main-topbar">
        <div className="topbar-header-row">
          <div>
            <h1 className="topbar-brand">Site Diary</h1>
            <p className="topbar-subtitle">
              Daily production reporting, materials, delays, and management
              oversight
            </p>
          </div>
        </div>

        <nav className="top-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`top-nav-link ${active ? "top-nav-link-active" : ""}`}
              >
                <span className="top-nav-icon">
                  <Icon size={17} strokeWidth={2.2} />
                </span>
                <span className="top-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="main-shell">
        <div className="main-content">{children}</div>
      </main>
    </div>
  );
}