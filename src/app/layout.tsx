import "./globals.css";
import type { Metadata } from "next";
import AppShell from "./components/AppShell";

export const metadata: Metadata = {
  title: "SiteDiary Dashboard",
  description: "Management dashboard for SiteDiary",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}