"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { DiaryRecord } from "@/lib/types";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function formatDateLabel(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function toDateOnlyString(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getStartOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getEndOfWeek(date: Date) {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function parseDiaryDate(value?: string) {
  if (!value) return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const parts = value.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    const fallback = new Date(y, (m || 1) - 1, d || 1);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return null;
}

type SupervisorProgress = {
  supervisorName: string;
  diaryCount: number;
  taskCount: number;
  issueCount: number;
  latestDate: string;
  areas: string[];
  subAreas: string[];
  wbsItems: string[];
  diaryIds: string[];
};

export default function WeeklyProgressPage() {
  const [diaries, setDiaries] = useState<DiaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const router = useRouter();

  const initialWeek = useMemo(() => {
    return toDateOnlyString(getStartOfWeek(new Date()));
  }, []);

  const [weekStart, setWeekStart] = useState(initialWeek);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [supervisor, setSupervisor] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthChecked(true);

      if (!user) {
        setDiaries([]);
        setLoading(false);
        router.push("/auth");
        return;
      }

      try {
        setLoading(true);

        // IMPORTANT:
        // The mobile app submits diaries to companies/{companyId}/diaries.
        // This page must NEVER read from the global collection(db, "diaries").
        // In the current owner-only setup, companyId === user.uid.
        const q = query(
          collection(db, "companies", user.uid, "diaries"),
          orderBy("date", "desc")
        );

        const snap = await getDocs(q);

        const rows: DiaryRecord[] = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<DiaryRecord, "id">),
        }));

        setDiaries(rows);
      } catch (err) {
        console.error("Error loading company weekly progress:", err);
        setDiaries([]);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const weekRange = useMemo(() => {
    const selected = parseDiaryDate(weekStart) || getStartOfWeek(new Date());
    return {
      start: getStartOfWeek(selected),
      end: getEndOfWeek(selected),
    };
  }, [weekStart]);

  const weeklyDiaries = useMemo(() => {
    return diaries.filter((d) => {
      const parsed = parseDiaryDate(d.date);
      if (!parsed) return false;
      return parsed >= weekRange.start && parsed <= weekRange.end;
    });
  }, [diaries, weekRange]);

  const areas = useMemo(() => {
    return uniqueSorted(weeklyDiaries.map((d) => d.selectedArea || ""));
  }, [weeklyDiaries]);

  const supervisorOptions = useMemo(() => {
    const scoped = weeklyDiaries.filter((d) => !area || d.selectedArea === area);
    return uniqueSorted(scoped.map((d) => d.supervisorName || ""));
  }, [weeklyDiaries, area]);

  const filteredWeeklyDiaries = useMemo(() => {
    const text = normalize(search);

    return weeklyDiaries.filter((d) => {
      const searchable = [
        d.date,
        d.supervisorName,
        d.selectedArea,
        d.selectedSubArea,
        d.wbsMain,
        d.wbsSub,
        d.issues,
        ...(d.tasks || []),
      ]
        .filter(Boolean)
        .join(" ");

      return (
        (!area || d.selectedArea === area) &&
        (!supervisor || d.supervisorName === supervisor) &&
        (!text || normalize(searchable).includes(text))
      );
    });
  }, [weeklyDiaries, area, supervisor, search]);

  const supervisorProgress = useMemo<SupervisorProgress[]>(() => {
    const map = new Map<string, SupervisorProgress>();

    for (const diary of filteredWeeklyDiaries) {
      const name = diary.supervisorName?.trim() || "Unassigned Supervisor";

      const existing = map.get(name) || {
        supervisorName: name,
        diaryCount: 0,
        taskCount: 0,
        issueCount: 0,
        latestDate: "",
        areas: [],
        subAreas: [],
        wbsItems: [],
        diaryIds: [],
      };

      existing.diaryCount += 1;
      existing.taskCount += (diary.tasks || []).filter(Boolean).length;
      existing.issueCount += (diary.issues || "").trim() ? 1 : 0;

      if (!existing.latestDate) {
        existing.latestDate = diary.date || "";
      } else {
        const existingDate = parseDiaryDate(existing.latestDate);
        const currentDate = parseDiaryDate(diary.date);

        if (
          currentDate &&
          (!existingDate || currentDate.getTime() > existingDate.getTime())
        ) {
          existing.latestDate = diary.date || existing.latestDate;
        }
      }

      if (diary.selectedArea) existing.areas.push(diary.selectedArea);
      if (diary.selectedSubArea) existing.subAreas.push(diary.selectedSubArea);

      const wbs = [diary.wbsMain, diary.wbsSub].filter(Boolean).join(" • ");
      if (wbs) existing.wbsItems.push(wbs);

      if (diary.id) existing.diaryIds.push(diary.id);

      map.set(name, existing);
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        areas: uniqueSorted(item.areas),
        subAreas: uniqueSorted(item.subAreas),
        wbsItems: uniqueSorted(item.wbsItems),
      }))
      .sort((a, b) => b.diaryCount - a.diaryCount);
  }, [filteredWeeklyDiaries]);

  const summary = useMemo(() => {
    const totalDiaries = filteredWeeklyDiaries.length;
    const totalSupervisors = supervisorProgress.length;

    const totalTasks = filteredWeeklyDiaries.reduce(
      (sum, d) => sum + (d.tasks || []).filter(Boolean).length,
      0
    );

    const totalIssues = filteredWeeklyDiaries.filter((d) =>
      (d.issues || "").trim()
    ).length;

    const activeAreas = new Set(
      filteredWeeklyDiaries.map((d) => d.selectedArea).filter(Boolean)
    ).size;

    return {
      totalDiaries,
      totalSupervisors,
      totalTasks,
      totalIssues,
      activeAreas,
    };
  }, [filteredWeeklyDiaries, supervisorProgress]);

  const dailyBreakdown = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(weekRange.start);
      date.setDate(weekRange.start.getDate() + index);

      const key = toDateOnlyString(date);
      const dayDiaries = filteredWeeklyDiaries.filter((d) => {
        const parsed = parseDiaryDate(d.date);
        return parsed ? toDateOnlyString(parsed) === key : false;
      });

      const tasks = dayDiaries.reduce(
        (sum, d) => sum + (d.tasks || []).filter(Boolean).length,
        0
      );

      const issues = dayDiaries.filter((d) => (d.issues || "").trim()).length;

      return {
        key,
        label: date.toLocaleDateString("en-ZA", { weekday: "short" }),
        dateLabel: formatDateLabel(key),
        diaries: dayDiaries.length,
        tasks,
        issues,
      };
    });

    return days;
  }, [filteredWeeklyDiaries, weekRange]);

  const resetFilters = () => {
    setSearch("");
    setArea("");
    setSupervisor("");
  };

  const toggleRow = (name: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  if (!authChecked || loading) {
    return (
      <div className="weekly-dashboard-page">
        <div className="weekly-loading">Loading company weekly progress...</div>
      </div>
    );
  }

  return (
    <div className="weekly-dashboard-page">
      <section className="weekly-hero">
        <div>
          <p className="weekly-kicker">Weekly Production Control</p>
          <h1>Weekly Progress Dashboard</h1>
          <p>
            Track weekly diary submissions, supervisors, tasks, WBS activity,
            active areas, and delays from one clear management view.
          </p>
        </div>

        <div className="weekly-hero-badge">
          {formatDateLabel(toDateOnlyString(weekRange.start))} -{" "}
          {formatDateLabel(toDateOnlyString(weekRange.end))}
        </div>
      </section>

      <section className="weekly-filter-panel">
        <div className="weekly-filter-top">
          <div>
            <h2>Weekly Filters</h2>
            <p>Select a week and narrow the progress register by area or supervisor.</p>
          </div>

          <button type="button" onClick={resetFilters} className="weekly-reset-btn">
            Reset Filters
          </button>
        </div>

        <div className="weekly-filter-grid">
          <div>
            <label>Week Starting</label>
            <input
              type="date"
              className="weekly-control"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>

          <div>
            <label>Area</label>
            <select
              className="weekly-control"
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setSupervisor("");
              }}
            >
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Supervisor</label>
            <select
              className="weekly-control"
              value={supervisor}
              onChange={(e) => setSupervisor(e.target.value)}
            >
              <option value="">All supervisors</option>
              {supervisorOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Search</label>
            <input
              className="weekly-control"
              placeholder="Search WBS, area, task, delay..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="weekly-metrics-grid">
        <div className="weekly-metric-card">
          <p>Weekly Diaries</p>
          <strong>{summary.totalDiaries}</strong>
          <span>Submitted diary records this week</span>
        </div>

        <div className="weekly-metric-card">
          <p>Active Supervisors</p>
          <strong>{summary.totalSupervisors}</strong>
          <span>Supervisors with weekly activity</span>
        </div>

        <div className="weekly-metric-card">
          <p>Tasks Logged</p>
          <strong>{summary.totalTasks}</strong>
          <span>Total task lines recorded</span>
        </div>

        <div className="weekly-metric-card danger">
          <p>Delays / Issues</p>
          <strong>{summary.totalIssues}</strong>
          <span>Diary records with delays</span>
        </div>

        <div className="weekly-metric-card">
          <p>Active Areas</p>
          <strong>{summary.activeAreas}</strong>
          <span>Areas covered in selected week</span>
        </div>
      </section>

      <section className="weekly-days-panel">
        <div className="weekly-section-title">
          <div>
            <h2>Daily Breakdown</h2>
            <p>Quick view of diary activity across the selected week.</p>
          </div>
        </div>

        <div className="weekly-days-grid">
          {dailyBreakdown.map((day) => (
            <div key={day.key} className="weekly-day-card">
              <p>{day.label}</p>
              <strong>{day.diaries}</strong>
              <span>{day.dateLabel}</span>

              <div className="weekly-day-mini">
                <em>{day.tasks} tasks</em>
                <em className={day.issues > 0 ? "has-issues" : ""}>
                  {day.issues} delays
                </em>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="weekly-sheet-shell">
        <div className="weekly-sheet-toolbar">
          <div>
            <h2>Supervisor Weekly Progress Matrix</h2>
            <p>
              Spreadsheet-style register for comparing supervisors and tracking weekly output.
            </p>
          </div>

          <div className="weekly-sheet-count">
            {supervisorProgress.length} supervisor
            {supervisorProgress.length === 1 ? "" : "s"}
          </div>
        </div>

        {supervisorProgress.length === 0 ? (
          <div className="weekly-empty-state">
            <h3>No weekly progress found</h3>
            <p>Try another week or change the filters.</p>
          </div>
        ) : (
          <div className="weekly-sheet-scroll">
            <table className="weekly-progress-table">
              <colgroup>
                <col className="w-row" />
                <col className="w-supervisor" />
                <col className="w-number" />
                <col className="w-number" />
                <col className="w-number" />
                <col className="w-date" />
                <col className="w-wide" />
                <col className="w-wide" />
                <col className="w-wide" />
                <col className="w-action" />
              </colgroup>

              <thead>
                <tr className="weekly-letters-row">
                  <th></th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>D</th>
                  <th>E</th>
                  <th>F</th>
                  <th>G</th>
                  <th>H</th>
                  <th>I</th>
                </tr>

                <tr className="weekly-header-row">
                  <th>#</th>
                  <th>Supervisor</th>
                  <th>Diaries</th>
                  <th>Tasks</th>
                  <th>Delays</th>
                  <th>Latest Update</th>
                  <th>Areas Covered</th>
                  <th>Sub Areas</th>
                  <th>WBS Activity</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {supervisorProgress.map((item, index) => {
                  const expanded = !!expandedRows[item.supervisorName];

                  const areaText = item.areas.join(", ") || "-";
                  const subAreaText = item.subAreas.join(", ") || "-";
                  const wbsText = item.wbsItems.join(", ") || "-";

                  return (
                    <Fragment key={item.supervisorName}>
                      <tr className="weekly-data-row">
                        <td className="weekly-row-number">{index + 1}</td>

                        <td className="weekly-supervisor-cell">
                          {item.supervisorName}
                        </td>

                        <td>
                          <span className="weekly-number-pill">
                            {item.diaryCount}
                          </span>
                        </td>

                        <td>
                          <span className="weekly-number-pill amber">
                            {item.taskCount}
                          </span>
                        </td>

                        <td>
                          <span
                            className={
                              item.issueCount > 0
                                ? "weekly-number-pill red"
                                : "weekly-number-pill green"
                            }
                          >
                            {item.issueCount}
                          </span>
                        </td>

                        <td>{formatDateLabel(item.latestDate)}</td>

                        <td title={areaText}>{areaText}</td>

                        <td title={subAreaText}>{subAreaText}</td>

                        <td title={wbsText}>{wbsText}</td>

                        <td>
                          <button
                            type="button"
                            onClick={() => toggleRow(item.supervisorName)}
                            className="weekly-expand-btn"
                          >
                            {expanded ? "Hide" : "Details"}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="weekly-expanded-row">
                          <td className="weekly-row-number"></td>
                          <td colSpan={9}>
                            <div className="weekly-expanded-content">
                              <div>
                                <h3>Areas Covered</h3>
                                <div className="weekly-chip-wrap">
                                  {item.areas.length > 0 ? (
                                    item.areas.map((x) => (
                                      <span key={x}>{x}</span>
                                    ))
                                  ) : (
                                    <span>-</span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <h3>Sub Areas Covered</h3>
                                <div className="weekly-chip-wrap">
                                  {item.subAreas.length > 0 ? (
                                    item.subAreas.map((x) => (
                                      <span key={x}>{x}</span>
                                    ))
                                  ) : (
                                    <span>-</span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <h3>WBS Activities</h3>
                                <div className="weekly-chip-wrap">
                                  {item.wbsItems.length > 0 ? (
                                    item.wbsItems.map((x) => (
                                      <span key={x}>{x}</span>
                                    ))
                                  ) : (
                                    <span>-</span>
                                  )}
                                </div>
                              </div>

                              <div className="weekly-expanded-actions">
                                {item.diaryIds[0] && (
                                  <Link
                                    href={`/diaries/${item.diaryIds[0]}`}
                                    className="weekly-view-btn"
                                  >
                                    Open Latest Diary
                                  </Link>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx global>{`
        .weekly-dashboard-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .weekly-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding: 22px;
          border-radius: 20px;
          background:
            radial-gradient(circle at top right, rgba(199, 137, 42, 0.22), transparent 30%),
            linear-gradient(135deg, #1f2a24 0%, #2d3a32 60%, #3c3222 100%);
          color: #ffffff;
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
        }

        .weekly-kicker {
          margin: 0 0 6px;
          color: #f3d59d;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .weekly-hero h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 950;
        }

        .weekly-hero p {
          max-width: 900px;
          margin: 9px 0 0;
          color: rgba(255, 255, 255, 0.78);
          font-size: 13.5px;
          line-height: 1.6;
        }

        .weekly-hero-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 36px;
          padding: 0 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.11);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .weekly-filter-panel,
        .weekly-days-panel {
          padding: 16px;
          border-radius: 18px;
          border: 1px solid var(--border, #dfe4dc);
          background: #ffffff;
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
        }

        .weekly-filter-top,
        .weekly-section-title,
        .weekly-sheet-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .weekly-filter-top {
          margin-bottom: 13px;
        }

        .weekly-filter-top h2,
        .weekly-section-title h2,
        .weekly-sheet-toolbar h2 {
          margin: 0;
          color: var(--text-strong, #0f1713);
          font-size: 17px;
          font-weight: 950;
          letter-spacing: -0.025em;
        }

        .weekly-filter-top p,
        .weekly-section-title p,
        .weekly-sheet-toolbar p {
          margin: 4px 0 0;
          color: var(--muted, #66726a);
          font-size: 12.5px;
        }

        .weekly-reset-btn {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 10px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          color: var(--text-strong, #0f1713);
          font-size: 12px;
          font-weight: 900;
        }

        .weekly-filter-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .weekly-filter-grid label {
          display: block;
          margin-bottom: 6px;
          color: var(--muted, #66726a);
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .weekly-control {
          width: 100%;
          height: 40px;
          border-radius: 10px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          padding: 0 12px;
          color: var(--text-strong, #0f1713);
          font-size: 13px;
          outline: none;
        }

        .weekly-control:focus {
          border-color: rgba(199, 137, 42, 0.8);
          box-shadow: 0 0 0 3px rgba(199, 137, 42, 0.14);
        }

        .weekly-metrics-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .weekly-metric-card {
          min-height: 118px;
          padding: 17px;
          border-radius: 17px;
          border: 1px solid var(--border, #dfe4dc);
          background: linear-gradient(180deg, #ffffff, #fafbf8);
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
          position: relative;
          overflow: hidden;
        }

        .weekly-metric-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 17px;
          bottom: 17px;
          width: 4px;
          border-radius: 999px;
          background: var(--accent, #c7892a);
        }

        .weekly-metric-card.danger::before {
          background: #b42318;
        }

        .weekly-metric-card p {
          margin: 0;
          color: var(--muted, #66726a);
          font-size: 12px;
          font-weight: 900;
        }

        .weekly-metric-card strong {
          display: block;
          margin-top: 9px;
          color: var(--text-strong, #0f1713);
          font-size: 32px;
          line-height: 1;
          letter-spacing: -0.045em;
          font-weight: 950;
        }

        .weekly-metric-card span {
          display: block;
          margin-top: 7px;
          color: var(--muted-2, #8a948d);
          font-size: 11.5px;
          line-height: 1.45;
        }

        .weekly-days-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .weekly-day-card {
          min-height: 122px;
          border-radius: 15px;
          border: 1px solid var(--border, #dfe4dc);
          background: #fafbf8;
          padding: 13px;
        }

        .weekly-day-card p {
          margin: 0;
          color: var(--muted, #66726a);
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .weekly-day-card strong {
          display: block;
          margin-top: 8px;
          color: var(--text-strong, #0f1713);
          font-size: 28px;
          line-height: 1;
          font-weight: 950;
        }

        .weekly-day-card span {
          display: block;
          margin-top: 6px;
          color: var(--muted-2, #8a948d);
          font-size: 11px;
        }

        .weekly-day-mini {
          display: flex;
          gap: 6px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .weekly-day-mini em {
          display: inline-flex;
          min-height: 22px;
          align-items: center;
          padding: 0 7px;
          border-radius: 999px;
          background: #eef1ec;
          color: #56635b;
          font-size: 10.5px;
          font-style: normal;
          font-weight: 900;
        }

        .weekly-day-mini em.has-issues {
          background: #fff1ef;
          color: #b42318;
        }

        .weekly-sheet-shell {
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid #c7d0c5;
          background: #ffffff;
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
        }

        .weekly-sheet-toolbar {
          padding: 14px 16px;
          border-bottom: 1px solid #cbd3c9;
          background: linear-gradient(180deg, #ffffff, #f3f5f1);
        }

        .weekly-sheet-count {
          display: inline-flex;
          min-height: 31px;
          align-items: center;
          justify-content: center;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid #ead5aa;
          background: #fff4df;
          color: #80520f;
          font-size: 12px;
          font-weight: 950;
          white-space: nowrap;
        }

        .weekly-sheet-scroll {
          width: 100%;
          overflow: auto;
          max-height: calc(100vh - 320px);
          background: #ffffff;
        }

        .weekly-progress-table {
          width: 1450px;
          min-width: 1450px;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 12px;
        }

        .w-row {
          width: 48px;
        }

        .w-supervisor {
          width: 190px;
        }

        .w-number {
          width: 95px;
        }

        .w-date {
          width: 140px;
        }

        .w-wide {
          width: 250px;
        }

        .w-action {
          width: 125px;
        }

        .weekly-progress-table th,
        .weekly-progress-table td {
          height: 36px;
          padding: 0 9px;
          border: 1px solid #d8ded5;
          background: #ffffff;
          color: #17201b;
          vertical-align: middle;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .weekly-letters-row th {
          position: sticky;
          top: 0;
          z-index: 20;
          height: 25px;
          padding: 0;
          text-align: center;
          background: #e5ebe2;
          color: #56635b;
          border-color: #c7d0c5;
          font-size: 11px;
          font-weight: 950;
        }

        .weekly-header-row th {
          position: sticky;
          top: 25px;
          z-index: 19;
          height: 38px;
          background: #1f2a24;
          color: #ffffff;
          border-color: #111a15;
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.045em;
          text-align: left;
        }

        .weekly-letters-row th:first-child,
        .weekly-header-row th:first-child {
          position: sticky;
          left: 0;
          z-index: 25;
          text-align: center;
        }

        .weekly-letters-row th:first-child {
          background: #dce4d9;
          color: #536059;
        }

        .weekly-header-row th:first-child {
          top: 25px;
          background: #1f2a24;
          color: #ffffff;
        }

        .weekly-row-number {
          position: sticky;
          left: 0;
          z-index: 10;
          text-align: center;
          background: #eff3ec !important;
          color: #66726a;
          font-weight: 950;
        }

        .weekly-data-row:nth-child(even) td {
          background: #fcfdf9;
        }

        .weekly-data-row:hover td {
          background: #fff7e6;
        }

        .weekly-supervisor-cell {
          color: var(--text-strong, #0f1713);
          font-weight: 950;
        }

        .weekly-number-pill {
          display: inline-flex;
          min-width: 38px;
          height: 24px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #eef1ec;
          color: #1f2a24;
          font-size: 11.5px;
          font-weight: 950;
        }

        .weekly-number-pill.amber {
          background: #fff4df;
          color: #80520f;
        }

        .weekly-number-pill.red {
          background: #fff1ef;
          color: #b42318;
        }

        .weekly-number-pill.green {
          background: #eaf6ef;
          color: #256b45;
        }

        .weekly-expand-btn,
        .weekly-view-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 950;
        }

        .weekly-expand-btn {
          border: 1px solid #ead5aa;
          background: #fff4df;
          color: #80520f;
        }

        .weekly-view-btn {
          background: #1f2a24;
          color: #ffffff;
        }

        .weekly-expanded-row td {
          height: auto;
          padding: 14px;
          background: #fafbf8 !important;
          white-space: normal;
        }

        .weekly-expanded-content {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
          gap: 12px;
        }

        .weekly-expanded-content h3 {
          margin: 0 0 8px;
          font-size: 12px;
          color: var(--muted, #66726a);
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .weekly-chip-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .weekly-chip-wrap span {
          display: inline-flex;
          min-height: 25px;
          align-items: center;
          padding: 0 8px;
          border-radius: 999px;
          background: #eef1ec;
          color: #405047;
          font-size: 11px;
          font-weight: 900;
        }

        .weekly-expanded-actions {
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
        }

        .weekly-loading,
        .weekly-empty-state {
          padding: 32px;
          color: var(--muted, #66726a);
        }

        .weekly-empty-state {
          text-align: center;
        }

        .weekly-empty-state h3 {
          margin: 0;
          font-size: 18px;
          color: var(--text-strong, #0f1713);
          font-weight: 950;
        }

        .weekly-empty-state p {
          margin: 6px 0 0;
          font-size: 13px;
        }

        @media (max-width: 1200px) {
          .weekly-filter-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .weekly-metrics-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .weekly-days-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .weekly-expanded-content {
            grid-template-columns: 1fr;
          }

          .weekly-expanded-actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 760px) {
          .weekly-hero,
          .weekly-filter-top,
          .weekly-sheet-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .weekly-filter-grid,
          .weekly-metrics-grid,
          .weekly-days-grid {
            grid-template-columns: 1fr;
          }

          .weekly-sheet-scroll {
            max-height: none;
          }
        }
      `}</style>
    </div>
  );
}
