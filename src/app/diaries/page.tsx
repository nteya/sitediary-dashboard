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

function getPdfUrl(
  diary: DiaryRecord & {
    pdfUrl?: string;
    pdfLink?: string;
    downloadUrl?: string;
    fileUrl?: string;
  }
) {
  return diary.pdfUrl || diary.pdfLink || diary.downloadUrl || diary.fileUrl || "";
}

export default function DiariesPage() {
  const [diaries, setDiaries] = useState<DiaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openIssues, setOpenIssues] = useState<Record<string, boolean>>({});
  const [authChecked, setAuthChecked] = useState(false);

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [subArea, setSubArea] = useState("");
  const [wbsMain, setWbsMain] = useState("");
  const [wbsSub, setWbsSub] = useState("");
  const [supervisor, setSupervisor] = useState("");

  const router = useRouter();

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
        // This page must NEVER read from collection(db, "diaries").
        // The mobile app submits to companies/{companyId}/diaries.
        // For the current owner-only setup, companyId === user.uid.
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
        console.error("Error loading company diaries:", err);
        setDiaries([]);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const areas = useMemo(() => {
    return uniqueSorted(diaries.map((d) => d.selectedArea || ""));
  }, [diaries]);

  const subAreas = useMemo(() => {
    const scoped = diaries.filter((d) => !area || d.selectedArea === area);
    return uniqueSorted(scoped.map((d) => d.selectedSubArea || ""));
  }, [diaries, area]);

  const wbsMainOptions = useMemo(() => {
    const scoped = diaries.filter((d) => {
      return (
        (!area || d.selectedArea === area) &&
        (!subArea || d.selectedSubArea === subArea)
      );
    });

    return uniqueSorted(scoped.map((d) => d.wbsMain || ""));
  }, [diaries, area, subArea]);

  const wbsSubOptions = useMemo(() => {
    const scoped = diaries.filter((d) => {
      return (
        (!area || d.selectedArea === area) &&
        (!subArea || d.selectedSubArea === subArea) &&
        (!wbsMain || d.wbsMain === wbsMain)
      );
    });

    return uniqueSorted(scoped.map((d) => d.wbsSub || ""));
  }, [diaries, area, subArea, wbsMain]);

  const supervisorOptions = useMemo(() => {
    const scoped = diaries.filter((d) => {
      return (
        (!area || d.selectedArea === area) &&
        (!subArea || d.selectedSubArea === subArea) &&
        (!wbsMain || d.wbsMain === wbsMain) &&
        (!wbsSub || d.wbsSub === wbsSub)
      );
    });

    return uniqueSorted(scoped.map((d) => d.supervisorName || ""));
  }, [diaries, area, subArea, wbsMain, wbsSub]);

  const filtered = useMemo(() => {
    const text = normalize(search);

    return diaries.filter((d) => {
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
        (!subArea || d.selectedSubArea === subArea) &&
        (!wbsMain || d.wbsMain === wbsMain) &&
        (!wbsSub || d.wbsSub === wbsSub) &&
        (!supervisor || d.supervisorName === supervisor) &&
        (!text || normalize(searchable).includes(text))
      );
    });
  }, [diaries, search, area, subArea, wbsMain, wbsSub, supervisor]);

  const summary = useMemo(() => {
    const issueCount = filtered.filter((d) => (d.issues || "").trim()).length;
    const supervisorCount = new Set(
      filtered.map((d) => d.supervisorName).filter(Boolean)
    ).size;

    const taskCount = filtered.reduce((total, diary) => {
      return total + (diary.tasks?.filter(Boolean).length || 0);
    }, 0);

    return {
      total: filtered.length,
      issueCount,
      supervisorCount,
      taskCount,
      latestDate: filtered[0]?.date || "",
    };
  }, [filtered]);

  const resetFilters = () => {
    setSearch("");
    setArea("");
    setSubArea("");
    setWbsMain("");
    setWbsSub("");
    setSupervisor("");
  };

  const toggleIssue = (id: string) => {
    setOpenIssues((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  if (!authChecked || loading) {
    return (
      <div className="diary-dashboard-page">
        <div className="software-card-strong p-8">Loading company diaries...</div>
      </div>
    );
  }

  return (
    <div className="diary-dashboard-page">
      <div className="diary-dashboard-hero">
        <div>
          <p className="diary-kicker">SiteDiary Register</p>
          <h1>Diary Analysis Dashboard</h1>
          <p>
            Spreadsheet-style diary control sheet for analysing daily supervisor
            submissions, issues, tasks, WBS progress, and site activity.
          </p>
        </div>

        <div className="diary-live-chip">
          <span></span>
          Company register
        </div>
      </div>

      <div className="diary-filter-board">
        <div className="diary-filter-top">
          <div>
            <h2>Filters</h2>
            <p>Control the spreadsheet view by area, WBS, supervisor, or text search.</p>
          </div>

          <button type="button" onClick={resetFilters} className="diary-reset-btn">
            Reset Filters
          </button>
        </div>

        <div className="diary-filter-grid">
          <input
            className="diary-control diary-search"
            placeholder="Search date, supervisor, area, WBS, task, issue..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="diary-control"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setSubArea("");
              setWbsMain("");
              setWbsSub("");
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

          <select
            className="diary-control"
            value={subArea}
            onChange={(e) => {
              setSubArea(e.target.value);
              setWbsMain("");
              setWbsSub("");
              setSupervisor("");
            }}
          >
            <option value="">All sub areas</option>
            {subAreas.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="diary-control"
            value={wbsMain}
            onChange={(e) => {
              setWbsMain(e.target.value);
              setWbsSub("");
              setSupervisor("");
            }}
          >
            <option value="">All WBS main</option>
            {wbsMainOptions.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>

          <select
            className="diary-control"
            value={wbsSub}
            onChange={(e) => {
              setWbsSub(e.target.value);
              setSupervisor("");
            }}
          >
            <option value="">All WBS sub</option>
            {wbsSubOptions.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>

          <select
            className="diary-control"
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
      </div>

      <div className="diary-metrics-grid">
        <div className="diary-metric-card">
          <p>Matching Diaries</p>
          <strong>{summary.total}</strong>
          <span>Rows currently displayed</span>
        </div>

        <div className="diary-metric-card">
          <p>Supervisors</p>
          <strong>{summary.supervisorCount}</strong>
          <span>Unique people in this view</span>
        </div>

        <div className="diary-metric-card">
          <p>Total Tasks</p>
          <strong>{summary.taskCount}</strong>
          <span>Recorded task lines</span>
        </div>

        <div className="diary-metric-card danger">
          <p>Issues Logged</p>
          <strong>{summary.issueCount}</strong>
          <span>Diaries with issues or delays</span>
        </div>

        <div className="diary-metric-card">
          <p>Latest Date</p>
          <strong className="date-value">{formatDateLabel(summary.latestDate)}</strong>
          <span>Newest diary in this view</span>
        </div>
      </div>

      <div className="excel-dashboard-shell">
        <div className="excel-dashboard-toolbar">
          <div>
            <h2>Daily Diary Spreadsheet</h2>
            <p>
              Rows are supervisor diary submissions. Columns are fixed for clean
              analysis like Excel.
            </p>
          </div>

          <div className="excel-toolbar-stats">
            <span>{filtered.length} filtered</span>
            <span>{diaries.length} total</span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="excel-empty-state">
            <h3>No diaries found</h3>
            <p>Try changing the filters or search text.</p>
          </div>
        ) : (
          <div className="excel-grid-scroll">
            <table className="excel-grid-table">
              <colgroup>
                <col className="col-row-number" />
                <col className="col-date" />
                <col className="col-supervisor" />
                <col className="col-area" />
                <col className="col-sub-area" />
                <col className="col-wbs-main" />
                <col className="col-wbs-sub" />
                <col className="col-tasks" />
                <col className="col-issues" />
                <col className="col-actions" />
              </colgroup>

              <thead>
                <tr className="excel-column-letters">
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

                <tr className="excel-field-headers">
                  <th>#</th>
                  <th>Date</th>
                  <th>Supervisor</th>
                  <th>Area</th>
                  <th>Sub Area</th>
                  <th>WBS Main</th>
                  <th>WBS Sub</th>
                  <th>Tasks</th>
                  <th>Issues</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((d, index) => {
                  const tasks = d.tasks?.filter(Boolean) || [];
                  const taskCount = tasks.length;
                  const firstTask = tasks[0] || "";
                  const hasIssues = !!(d.issues || "").trim();
                  const pdfUrl = getPdfUrl(
                    d as DiaryRecord & {
                      pdfUrl?: string;
                      pdfLink?: string;
                      downloadUrl?: string;
                      fileUrl?: string;
                    }
                  );

                  return (
                    <Fragment key={d.id}>
                      <tr className="excel-data-row">
                        <td className="excel-row-number-cell">{index + 1}</td>

                        <td className="excel-date-cell">
                          {formatDateLabel(d.date)}
                        </td>

                        <td title={d.supervisorName || "-"}>
                          {d.supervisorName || "-"}
                        </td>

                        <td title={d.selectedArea || "-"}>
                          {d.selectedArea || "-"}
                        </td>

                        <td title={d.selectedSubArea || "-"}>
                          {d.selectedSubArea || "-"}
                        </td>

                        <td title={d.wbsMain || "-"}>{d.wbsMain || "-"}</td>

                        <td title={d.wbsSub || "-"}>{d.wbsSub || "-"}</td>

                        <td className="excel-task-cell" title={firstTask || ""}>
                          <span className="task-count">
                            {taskCount} task{taskCount === 1 ? "" : "s"}
                          </span>
                          <span className="task-preview">
                            {firstTask || "No task recorded"}
                          </span>
                        </td>

                        <td>
                          {hasIssues ? (
                            <button
                              type="button"
                              onClick={() => toggleIssue(d.id)}
                              className="excel-status issue"
                            >
                              {openIssues[d.id] ? "Hide" : "Issue"}
                            </button>
                          ) : (
                            <span className="excel-status clear">Clear</span>
                          )}
                        </td>

                        <td>
                          <div className="excel-actions">
                            <Link
                              href={`/diaries/${d.id}`}
                              className="excel-btn view"
                            >
                              View
                            </Link>

                            {pdfUrl ? (
                              <a
                                href={pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="excel-btn pdf"
                              >
                                PDF
                              </a>
                            ) : (
                              <span className="excel-btn disabled">No PDF</span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {hasIssues && openIssues[d.id] && (
                        <tr className="excel-expanded-row">
                          <td className="excel-row-number-cell"></td>
                          <td colSpan={9}>
                            <div className="excel-issue-panel">
                              <strong>Logged Issue / Delay</strong>
                              <p>{d.issues}</p>
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
      </div>

      <style jsx global>{`
        .diary-dashboard-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .diary-dashboard-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding: 20px;
          border: 1px solid var(--border, #dfe4dc);
          border-radius: 18px;
          background:
            linear-gradient(135deg, rgba(31, 42, 36, 0.98), rgba(48, 61, 53, 0.96)),
            radial-gradient(circle at top right, rgba(199, 137, 42, 0.28), transparent 30%);
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
          color: #ffffff;
        }

        .diary-kicker {
          margin: 0 0 6px;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: #f3d59d;
        }

        .diary-dashboard-hero h1 {
          margin: 0;
          font-size: 26px;
          line-height: 1.05;
          letter-spacing: -0.04em;
          font-weight: 950;
        }

        .diary-dashboard-hero p {
          max-width: 900px;
          margin: 8px 0 0;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.78);
        }

        .diary-live-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }

        .diary-live-chip span {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #86efac;
          box-shadow: 0 0 0 4px rgba(134, 239, 172, 0.14);
        }

        .diary-filter-board {
          border: 1px solid var(--border, #dfe4dc);
          border-radius: 18px;
          background: #ffffff;
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
          padding: 15px;
        }

        .diary-filter-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 12px;
        }

        .diary-filter-top h2 {
          margin: 0;
          font-size: 16px;
          color: var(--text-strong, #0f1713);
          font-weight: 950;
          letter-spacing: -0.02em;
        }

        .diary-filter-top p {
          margin: 4px 0 0;
          font-size: 12.5px;
          color: var(--muted, #66726a);
        }

        .diary-reset-btn {
          min-height: 34px;
          padding: 0 12px;
          border-radius: 10px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          color: var(--text-strong, #0f1713);
          font-size: 12px;
          font-weight: 900;
          transition: 0.18s ease;
        }

        .diary-reset-btn:hover {
          background: #f8faf7;
          transform: translateY(-1px);
        }

        .diary-filter-grid {
          display: grid;
          grid-template-columns: 2fr repeat(5, minmax(120px, 1fr));
          gap: 9px;
        }

        .diary-control {
          width: 100%;
          min-width: 0;
          height: 38px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          border-radius: 10px;
          padding: 0 11px;
          color: var(--text-strong, #0f1713);
          font-size: 12.5px;
          outline: none;
          box-shadow: 0 1px 2px rgba(18, 26, 22, 0.03);
        }

        .diary-control:focus {
          border-color: rgba(199, 137, 42, 0.8);
          box-shadow: 0 0 0 3px rgba(199, 137, 42, 0.14);
        }

        .diary-metrics-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .diary-metric-card {
          position: relative;
          overflow: hidden;
          min-height: 112px;
          padding: 16px;
          border-radius: 16px;
          border: 1px solid var(--border, #dfe4dc);
          background: linear-gradient(180deg, #ffffff, #fafbf8);
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
        }

        .diary-metric-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 16px;
          bottom: 16px;
          width: 4px;
          border-radius: 999px;
          background: var(--accent, #c7892a);
        }

        .diary-metric-card.danger::before {
          background: #b42318;
        }

        .diary-metric-card p {
          margin: 0;
          font-size: 12px;
          font-weight: 850;
          color: var(--muted, #66726a);
        }

        .diary-metric-card strong {
          display: block;
          margin-top: 8px;
          font-size: 30px;
          line-height: 1;
          letter-spacing: -0.04em;
          color: var(--text-strong, #0f1713);
          font-weight: 950;
        }

        .diary-metric-card strong.date-value {
          font-size: 20px;
          line-height: 1.15;
        }

        .diary-metric-card span {
          display: block;
          margin-top: 7px;
          font-size: 11.5px;
          line-height: 1.45;
          color: var(--muted-2, #8a948d);
        }

        .excel-dashboard-shell {
          overflow: hidden;
          border-radius: 16px;
          border: 1px solid #c7d0c5;
          background: #ffffff;
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
        }

        .excel-dashboard-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          padding: 13px 15px;
          border-bottom: 1px solid #cbd3c9;
          background:
            linear-gradient(180deg, #f7f9f5, #edf1eb);
        }

        .excel-dashboard-toolbar h2 {
          margin: 0;
          font-size: 16px;
          font-weight: 950;
          letter-spacing: -0.02em;
          color: var(--text-strong, #0f1713);
        }

        .excel-dashboard-toolbar p {
          margin: 4px 0 0;
          font-size: 12px;
          color: var(--muted, #66726a);
        }

        .excel-toolbar-stats {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .excel-toolbar-stats span {
          min-height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 9px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid #d8ded5;
          color: #405047;
          font-size: 11px;
          font-weight: 900;
          white-space: nowrap;
        }

        .excel-grid-scroll {
          width: 100%;
          max-height: calc(100vh - 320px);
          overflow: auto;
          background: #ffffff;
        }

        .excel-grid-table {
          width: 1320px;
          min-width: 1320px;
          table-layout: fixed;
          border-collapse: collapse;
          border-spacing: 0;
          font-size: 12px;
          background: #ffffff;
        }

        .col-row-number {
          width: 48px;
        }

        .col-date {
          width: 132px;
        }

        .col-supervisor {
          width: 165px;
        }

        .col-area {
          width: 145px;
        }

        .col-sub-area {
          width: 150px;
        }

        .col-wbs-main {
          width: 145px;
        }

        .col-wbs-sub {
          width: 145px;
        }

        .col-tasks {
          width: 300px;
        }

        .col-issues {
          width: 95px;
        }

        .col-actions {
          width: 135px;
        }

        .excel-grid-table th,
        .excel-grid-table td {
          height: 34px;
          padding: 0 8px;
          border: 1px solid #d8ded5;
          background: #ffffff;
          color: #17201b;
          vertical-align: middle;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .excel-column-letters th {
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

        .excel-field-headers th {
          position: sticky;
          top: 25px;
          z-index: 19;
          height: 37px;
          background: #1f2a24;
          color: #ffffff;
          border-color: #111a15;
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.045em;
          text-align: left;
        }

        .excel-column-letters th:first-child,
        .excel-field-headers th:first-child {
          position: sticky;
          left: 0;
          z-index: 25;
          text-align: center;
          background: #dce4d9;
          color: #536059;
          border-color: #c7d0c5;
        }

        .excel-field-headers th:first-child {
          top: 25px;
          background: #1f2a24;
          color: #ffffff;
          border-color: #111a15;
        }

        .excel-row-number-cell {
          position: sticky;
          left: 0;
          z-index: 10;
          text-align: center;
          background: #eff3ec !important;
          color: #66726a;
          font-weight: 950;
          border-right-color: #c7d0c5 !important;
        }

        .excel-data-row:nth-child(even) td {
          background: #fcfdf9;
        }

        .excel-data-row:hover td {
          background: #fff7e6;
        }

        .excel-data-row:hover .excel-row-number-cell {
          background: #eadfc8 !important;
        }

        .excel-date-cell {
          font-weight: 900;
          color: #0f1713;
        }

        .excel-task-cell {
          white-space: normal !important;
          line-height: 1.2;
        }

        .task-count {
          display: block;
          font-size: 11.5px;
          font-weight: 950;
          color: #0f1713;
        }

        .task-preview {
          display: block;
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11.5px;
          color: #66726a;
        }

        .excel-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 56px;
          height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 950;
          border: 1px solid transparent;
        }

        .excel-status.issue {
          background: #fff1ef;
          color: #b42318;
          border-color: #f4c7c3;
          cursor: pointer;
        }

        .excel-status.clear {
          background: #eaf6ef;
          color: #256b45;
          border-color: #c9e8d4;
        }

        .excel-actions {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .excel-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 24px;
          padding: 0 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 950;
          white-space: nowrap;
        }

        .excel-btn.view {
          background: #1f2a24;
          color: #ffffff;
        }

        .excel-btn.pdf {
          background: #fff4df;
          color: #80520f;
          border: 1px solid #ead5aa;
        }

        .excel-btn.disabled {
          background: #eef1ec;
          color: #8a948d;
        }

        .excel-expanded-row td {
          height: auto;
          padding: 11px;
          background: #fffafa !important;
          white-space: normal;
        }

        .excel-issue-panel {
          border: 1px solid #f4c7c3;
          background: #fff1ef;
          color: #7f1d1d;
          border-radius: 10px;
          padding: 11px;
        }

        .excel-issue-panel strong {
          display: block;
          font-size: 11.5px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .excel-issue-panel p {
          margin: 5px 0 0;
          font-size: 13px;
          line-height: 1.55;
        }

        .excel-loading,
        .excel-empty-state {
          padding: 28px;
          color: var(--muted, #66726a);
        }

        .excel-empty-state {
          text-align: center;
        }

        .excel-empty-state h3 {
          margin: 0;
          font-size: 17px;
          color: var(--text-strong, #0f1713);
          font-weight: 950;
        }

        .excel-empty-state p {
          margin: 6px 0 0;
          font-size: 13px;
        }

        @media (max-width: 1180px) {
          .diary-filter-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .diary-search {
            grid-column: span 3;
          }

          .diary-metrics-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .diary-dashboard-hero,
          .diary-filter-top,
          .excel-dashboard-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .diary-filter-grid {
            grid-template-columns: 1fr;
          }

          .diary-search {
            grid-column: span 1;
          }

          .diary-metrics-grid {
            grid-template-columns: 1fr;
          }

          .excel-grid-scroll {
            max-height: none;
          }
        }
      `}</style>
    </div>
  );
}
