"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  Boxes,
  BarChart3,
  Settings,
  FileBarChart,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/diaries", label: "Diaries", icon: FileText },
  { href: "/progress", label: "Weekly Progress", icon: BarChart3 },
  { href: "/issues", label: "Issues / Delays", icon: AlertTriangle },
  { href: "/materials", label: "Materials", icon: Boxes },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/company-settings", label: "Company Settings", icon: Settings },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/auth";
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (!mounted) {
    return <>{children}</>;
  }

  if (pathname === "/auth") {
    return <>{children}</>;
  }

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

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden md:inline text-sm text-slate-600">
                  {user.email}
                </span>

                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-100 transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/auth"
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
              >
                Login / Signup
              </Link>
            )}
          </div>
        </div>

        <nav className="top-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;

            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`top-nav-link ${
                  active ? "top-nav-link-active" : ""
                }`}
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