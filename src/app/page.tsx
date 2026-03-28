"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DiaryRecord } from "@/lib/types";

function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="metric-card">
      <p className="metric-label">{title}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-hint">{hint}</p>
    </div>
  );
}

export default function DashboardHome() {
  const [diaries, setDiaries] = useState<DiaryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "diaries"), orderBy("date", "desc"));
        const snap = await getDocs(q);
        const rows: DiaryRecord[] = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<DiaryRecord, "id">),
        }));
        setDiaries(rows);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const today = new Date().toISOString().split("T")[0];

  const stats = useMemo(() => {
    const todayRows = diaries.filter((d) => d.date === today);
    const supervisors = new Set(todayRows.map((d) => d.supervisorName).filter(Boolean));
    const areas = new Set(todayRows.map((d) => d.selectedArea).filter(Boolean));
    const issuesCount = todayRows.filter((d) => (d.issues || "").trim()).length;

    const totalHours = todayRows.reduce((sum, diary) => {
      const rowHours =
        diary.manpower?.reduce((s, row) => s + Number(row.hours || 0), 0) || 0;
      return sum + rowHours;
    }, 0);

    return {
      todayDiaries: todayRows.length,
      supervisorsToday: supervisors.size,
      areasToday: areas.size,
      issuesToday: issuesCount,
      hoursToday: totalHours.toFixed(2),
      totalDiaries: diaries.length,
    };
  }, [diaries, today]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="software-title">Dashboard Overview</h1>
        <p className="software-subtitle">
          Monitor diary activity, manpower, issues, and materials across the project
        </p>
      </div>

      {loading ? (
        <div className="software-card-strong p-8">Loading dashboard...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <Card title="Diaries Submitted Today" value={stats.todayDiaries} hint="Records captured for today" />
            <Card title="Supervisors Submitted Today" value={stats.supervisorsToday} hint="Unique supervisors reporting" />
            <Card title="Areas Worked Today" value={stats.areasToday} hint="Areas with diary activity" />
            <Card title="Issues Logged Today" value={stats.issuesToday} hint="Open delays or reported issues" />
            <Card title="Manpower Hours Today" value={stats.hoursToday} hint="Total recorded manpower hours" />
            <Card title="Total Diaries" value={stats.totalDiaries} hint="All submitted diary records" />
          </div>

          <div className="software-card-strong p-6">
            <div className="section-header">
              <div>
                <h2 className="text-xl font-bold">Recent Diaries</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Latest submitted records
                </p>
              </div>
              <span className="badge badge-neutral">{diaries.length} total</span>
            </div>

            <div className="overflow-x-auto">
              <table className="software-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Supervisor</th>
                    <th>Area</th>
                    <th>Sub Area</th>
                    <th>WBS</th>
                  </tr>
                </thead>
                <tbody>
                  {diaries.slice(0, 8).map((d) => (
                    <tr key={d.id}>
                      <td>{d.date || "-"}</td>
                      <td>{d.supervisorName || "-"}</td>
                      <td>{d.selectedArea || "-"}</td>
                      <td>{d.selectedSubArea || "-"}</td>
                      <td>{[d.wbsMain, d.wbsSub].filter(Boolean).join(" - ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}