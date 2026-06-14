"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
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

export default function IssuesPage() {
  const [diaries, setDiaries] = useState<DiaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({});

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [subArea, setSubArea] = useState("");
  const [wbsMain, setWbsMain] = useState("");
  const [supervisor, setSupervisor] = useState("");

  useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    try {
      setLoading(true);

      if (!user) {
        setDiaries([]);
        return;
      }

      const userRef = doc(db, "companies", user.uid, "users", user.uid);
      const userSnap = await getDoc(userRef);

      const companyId = userSnap.exists()
        ? userSnap.data()?.companyId || user.uid
        : user.uid;

      const q = query(
        collection(db, "companies", companyId, "diaries"),
        orderBy("date", "desc")
      );

      const snap = await getDocs(q);

      const rows: DiaryRecord[] = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<DiaryRecord, "id">),
      }));

      setDiaries(rows);
    } catch (error) {
      console.error("Load company issues error:", error);
      setDiaries([]);
    } finally {
      setLoading(false);
    }
  });

  return () => unsubscribe();
}, []);
  const issuesOnly = useMemo(() => {
    return diaries.filter((d) => (d.issues || "").trim());
  }, [diaries]);

  const areas = useMemo(() => {
    return uniqueSorted(issuesOnly.map((d) => d.selectedArea || ""));
  }, [issuesOnly]);

  const subAreas = useMemo(() => {
    const scoped = issuesOnly.filter((d) => !area || d.selectedArea === area);
    return uniqueSorted(scoped.map((d) => d.selectedSubArea || ""));
  }, [issuesOnly, area]);

  const wbsMainOptions = useMemo(() => {
    const scoped = issuesOnly.filter((d) => {
      return (
        (!area || d.selectedArea === area) &&
        (!subArea || d.selectedSubArea === subArea)
      );
    });

    return uniqueSorted(scoped.map((d) => d.wbsMain || ""));
  }, [issuesOnly, area, subArea]);

  const supervisorOptions = useMemo(() => {
    const scoped = issuesOnly.filter((d) => {
      return (
        (!area || d.selectedArea === area) &&
        (!subArea || d.selectedSubArea === subArea) &&
        (!wbsMain || d.wbsMain === wbsMain)
      );
    });

    return uniqueSorted(scoped.map((d) => d.supervisorName || ""));
  }, [issuesOnly, area, subArea, wbsMain]);

  const filtered = useMemo(() => {
    const text = normalize(search);

    return issuesOnly.filter((d) => {
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
        (!supervisor || d.supervisorName === supervisor) &&
        (!text || normalize(searchable).includes(text))
      );
    });
  }, [issuesOnly, search, area, subArea, wbsMain, supervisor]);

  const summary = useMemo(() => {
    const total = filtered.length;

    const uniqueAreas = new Set(
      filtered.map((d) => d.selectedArea).filter(Boolean)
    ).size;

    const uniqueSupervisors = new Set(
      filtered.map((d) => d.supervisorName).filter(Boolean)
    ).size;

    const uniqueWbs = new Set(
      filtered.map((d) => d.wbsMain).filter(Boolean)
    ).size;

    const latestDate = filtered[0]?.date || "-";

    return {
      total,
      uniqueAreas,
      uniqueSupervisors,
      uniqueWbs,
      latestDate,
    };
  }, [filtered]);

  const resetFilters = () => {
    setSearch("");
    setArea("");
    setSubArea("");
    setWbsMain("");
    setSupervisor("");
  };

  const toggleIssue = (id: string) => {
    setExpandedIssues((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="issues-dashboard-page">
      <section className="issues-hero">
        <div>
          <p className="issues-kicker">Site Control Register</p>
          <h1>Issues & Delays Dashboard</h1>
          <p>
            A clear management view of blockers, delays, site instructions, and
            reported issues from daily supervisor diaries.
          </p>
        </div>

        <div className="issues-hero-badge">
          <span></span>
          Action tracking view
        </div>
      </section>

      <section className="issues-filter-panel">
        <div className="issues-filter-top">
          <div>
            <h2>Issue Filters</h2>
            <p>Filter by area, WBS, supervisor, or search inside the issue text.</p>
          </div>

          <button type="button" onClick={resetFilters} className="issues-reset-btn">
            Reset Filters
          </button>
        </div>

        <div className="issues-filter-grid">
          <input
            className="issues-control issues-search"
            placeholder="Search issue, date, area, WBS, supervisor, task..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="issues-control"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setSubArea("");
              setWbsMain("");
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
            className="issues-control"
            value={subArea}
            onChange={(e) => {
              setSubArea(e.target.value);
              setWbsMain("");
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
            className="issues-control"
            value={wbsMain}
            onChange={(e) => {
              setWbsMain(e.target.value);
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
            className="issues-control"
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
      </section>

      <section className="issues-metrics-grid">
        <div className="issues-metric-card danger">
          <p>Logged Issues</p>
          <strong>{summary.total}</strong>
          <span>Issue reports matching current filters</span>
        </div>

        <div className="issues-metric-card">
          <p>Affected Areas</p>
          <strong>{summary.uniqueAreas}</strong>
          <span>Areas where issues were recorded</span>
        </div>

        <div className="issues-metric-card">
          <p>WBS Groups</p>
          <strong>{summary.uniqueWbs}</strong>
          <span>Work groups affected by issues</span>
        </div>

        <div className="issues-metric-card">
          <p>Supervisors</p>
          <strong>{summary.uniqueSupervisors}</strong>
          <span>Supervisors who reported issues</span>
        </div>

        <div className="issues-metric-card">
          <p>Latest Issue Date</p>
          <strong className="date-value">{formatDateLabel(summary.latestDate)}</strong>
          <span>Most recent issue in this view</span>
        </div>
      </section>

      <section className="issues-register-shell">
        <div className="issues-register-toolbar">
          <div>
            <h2>Issue Register</h2>
            <p>Big readable cards for fast management review and action follow-up.</p>
          </div>

          <div className="issues-register-count">
            {filtered.length} issue{filtered.length === 1 ? "" : "s"}
          </div>
        </div>

        {loading ? (
          <div className="issues-loading">Loading issues...</div>
        ) : filtered.length === 0 ? (
          <div className="issues-empty-state">
            <h3>No issues found</h3>
            <p>Try changing the filters or search text.</p>
          </div>
        ) : (
          <div className="issues-card-list">
            {filtered.map((d, index) => {
              const issueText = (d.issues || "").trim();
              const isExpanded = !!expandedIssues[d.id];
              const shouldClamp = issueText.length > 240;

              return (
                <article key={d.id} className="big-issue-card">
                  <div className="issue-index-block">
                    <span>#{index + 1}</span>
                    <strong>Issue</strong>
                  </div>

                  <div className="issue-content-block">
                    <div className="issue-card-top">
                      <div>
                        <p className="issue-date">{formatDateLabel(d.date)}</p>
                        <h3>
                          {d.selectedArea || "Unknown Area"}
                          {d.selectedSubArea ? ` • ${d.selectedSubArea}` : ""}
                        </h3>
                      </div>

                      <span className="issue-status-pill">Needs Review</span>
                    </div>

                    <div className="issue-meta-grid">
                      <div>
                        <span>Supervisor</span>
                        <strong>{d.supervisorName || "-"}</strong>
                      </div>

                      <div>
                        <span>WBS Main</span>
                        <strong>{d.wbsMain || "-"}</strong>
                      </div>

                      <div>
                        <span>WBS Sub</span>
                        <strong>{d.wbsSub || "-"}</strong>
                      </div>

                      <div>
                        <span>Date</span>
                        <strong>{formatDateLabel(d.date)}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleIssue(d.id)}
                      className="issue-message-box"
                    >
                      <span>Reported Issue / Delay</span>

                      <p className={!isExpanded && shouldClamp ? "issue-clamped" : ""}>
                        {issueText}
                      </p>

                      {shouldClamp && (
                        <strong>
                          {isExpanded ? "Show less" : "Read full issue"}
                        </strong>
                      )}
                    </button>

                    <div className="issue-card-actions">
                      <Link href={`/diaries/${d.id}`} className="issue-primary-action">
                        View Full Diary
                      </Link>

                      <button
                        type="button"
                        onClick={() => toggleIssue(d.id)}
                        className="issue-secondary-action"
                      >
                        {isExpanded ? "Collapse Issue" : "Expand Issue"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <style jsx global>{`
        .issues-dashboard-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .issues-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 22px;
          border-radius: 20px;
          border: 1px solid rgba(244, 199, 195, 0.34);
          background:
            radial-gradient(circle at top right, rgba(180, 35, 24, 0.24), transparent 30%),
            linear-gradient(135deg, #241f1d 0%, #3a2724 55%, #1f2a24 100%);
          color: #ffffff;
          box-shadow: 0 18px 42px rgba(31, 42, 36, 0.16);
        }

        .issues-kicker {
          margin: 0 0 6px;
          color: #f4c7c3;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .issues-hero h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 950;
        }

        .issues-hero p {
          margin: 9px 0 0;
          max-width: 900px;
          color: rgba(255, 255, 255, 0.78);
          font-size: 13.5px;
          line-height: 1.6;
        }

        .issues-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 36px;
          padding: 0 13px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .issues-hero-badge span {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #f97316;
          box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.16);
        }

        .issues-filter-panel {
          padding: 16px;
          border-radius: 18px;
          border: 1px solid var(--border, #dfe4dc);
          background: #ffffff;
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
        }

        .issues-filter-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 13px;
        }

        .issues-filter-top h2 {
          margin: 0;
          color: var(--text-strong, #0f1713);
          font-size: 16px;
          font-weight: 950;
        }

        .issues-filter-top p {
          margin: 4px 0 0;
          color: var(--muted, #66726a);
          font-size: 12.5px;
        }

        .issues-reset-btn {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 10px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          color: var(--text-strong, #0f1713);
          font-size: 12px;
          font-weight: 900;
          transition: 0.18s ease;
        }

        .issues-reset-btn:hover {
          transform: translateY(-1px);
          background: #f8faf7;
        }

        .issues-filter-grid {
          display: grid;
          grid-template-columns: 2fr repeat(4, minmax(120px, 1fr));
          gap: 10px;
        }

        .issues-control {
          width: 100%;
          min-width: 0;
          height: 40px;
          border-radius: 10px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          padding: 0 12px;
          color: var(--text-strong, #0f1713);
          font-size: 13px;
          outline: none;
        }

        .issues-control:focus {
          border-color: rgba(180, 35, 24, 0.58);
          box-shadow: 0 0 0 3px rgba(180, 35, 24, 0.12);
        }

        .issues-metrics-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .issues-metric-card {
          min-height: 118px;
          padding: 17px;
          border-radius: 17px;
          border: 1px solid var(--border, #dfe4dc);
          background: linear-gradient(180deg, #ffffff, #fafbf8);
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
          position: relative;
          overflow: hidden;
        }

        .issues-metric-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 17px;
          bottom: 17px;
          width: 4px;
          border-radius: 999px;
          background: var(--accent, #c7892a);
        }

        .issues-metric-card.danger::before {
          background: #b42318;
        }

        .issues-metric-card p {
          margin: 0;
          font-size: 12px;
          font-weight: 900;
          color: var(--muted, #66726a);
        }

        .issues-metric-card strong {
          display: block;
          margin-top: 9px;
          font-size: 32px;
          line-height: 1;
          letter-spacing: -0.045em;
          color: var(--text-strong, #0f1713);
          font-weight: 950;
        }

        .issues-metric-card strong.date-value {
          font-size: 20px;
          line-height: 1.15;
        }

        .issues-metric-card span {
          display: block;
          margin-top: 7px;
          color: var(--muted-2, #8a948d);
          font-size: 11.5px;
          line-height: 1.45;
        }

        .issues-register-shell {
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid var(--border, #dfe4dc);
          background: #ffffff;
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
        }

        .issues-register-toolbar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          padding: 16px 18px;
          border-bottom: 1px solid var(--border, #dfe4dc);
          background: linear-gradient(180deg, #ffffff, #f6f8f4);
        }

        .issues-register-toolbar h2 {
          margin: 0;
          color: var(--text-strong, #0f1713);
          font-size: 18px;
          font-weight: 950;
          letter-spacing: -0.03em;
        }

        .issues-register-toolbar p {
          margin: 4px 0 0;
          color: var(--muted, #66726a);
          font-size: 12.5px;
        }

        .issues-register-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          background: #fff1ef;
          color: #b42318;
          border: 1px solid #f4c7c3;
          font-size: 12px;
          font-weight: 950;
          white-space: nowrap;
        }

        .issues-card-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 16px;
          background: #f7f8f4;
        }

        .big-issue-card {
          display: grid;
          grid-template-columns: 92px minmax(0, 1fr);
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid #e4c7c4;
          background: #ffffff;
          box-shadow: 0 10px 26px rgba(18, 26, 22, 0.07);
        }

        .issue-index-block {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;
          background:
            linear-gradient(180deg, #b42318, #7f1d1d);
          color: #ffffff;
          padding: 14px 10px;
        }

        .issue-index-block span {
          font-size: 22px;
          font-weight: 950;
          letter-spacing: -0.04em;
        }

        .issue-index-block strong {
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          opacity: 0.9;
        }

        .issue-content-block {
          padding: 16px;
          min-width: 0;
        }

        .issue-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 13px;
        }

        .issue-date {
          margin: 0 0 4px;
          color: #b42318;
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .issue-card-top h3 {
          margin: 0;
          color: var(--text-strong, #0f1713);
          font-size: 20px;
          line-height: 1.15;
          letter-spacing: -0.035em;
          font-weight: 950;
        }

        .issue-status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 0 10px;
          border-radius: 999px;
          background: #fff1ef;
          color: #b42318;
          border: 1px solid #f4c7c3;
          font-size: 11.5px;
          font-weight: 950;
          white-space: nowrap;
        }

        .issue-meta-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 13px;
        }

        .issue-meta-grid div {
          min-width: 0;
          border-radius: 12px;
          border: 1px solid var(--border, #dfe4dc);
          background: #fafbf8;
          padding: 10px;
        }

        .issue-meta-grid span {
          display: block;
          color: var(--muted, #66726a);
          font-size: 10.5px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .issue-meta-grid strong {
          display: block;
          margin-top: 4px;
          color: var(--text-strong, #0f1713);
          font-size: 13px;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .issue-message-box {
          width: 100%;
          display: block;
          text-align: left;
          border: 1px solid #f4c7c3;
          background: #fffafa;
          border-radius: 15px;
          padding: 14px;
          cursor: pointer;
        }

        .issue-message-box span {
          display: block;
          margin-bottom: 7px;
          color: #b42318;
          font-size: 11.5px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .issue-message-box p {
          margin: 0;
          color: #1f2933;
          font-size: 17px;
          line-height: 1.65;
          font-weight: 650;
          white-space: pre-wrap;
        }

        .issue-message-box p.issue-clamped {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .issue-message-box strong {
          display: inline-flex;
          margin-top: 10px;
          color: #b42318;
          font-size: 12px;
          font-weight: 950;
        }

        .issue-card-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 13px;
        }

        .issue-primary-action,
        .issue-secondary-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          padding: 0 14px;
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 950;
          transition: 0.18s ease;
        }

        .issue-primary-action {
          background: #1f2a24;
          color: #ffffff;
        }

        .issue-secondary-action {
          border: 1px solid #f4c7c3;
          background: #fff1ef;
          color: #b42318;
        }

        .issue-primary-action:hover,
        .issue-secondary-action:hover {
          transform: translateY(-1px);
        }

        .issues-loading,
        .issues-empty-state {
          padding: 32px;
          color: var(--muted, #66726a);
        }

        .issues-empty-state {
          text-align: center;
        }

        .issues-empty-state h3 {
          margin: 0;
          font-size: 18px;
          color: var(--text-strong, #0f1713);
          font-weight: 950;
        }

        .issues-empty-state p {
          margin: 6px 0 0;
          font-size: 13px;
        }

        @media (max-width: 1180px) {
          .issues-filter-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .issues-search {
            grid-column: span 3;
          }

          .issues-metrics-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .issue-meta-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .issues-hero,
          .issues-filter-top,
          .issues-register-toolbar,
          .issue-card-top {
            flex-direction: column;
            align-items: stretch;
          }

          .issues-filter-grid {
            grid-template-columns: 1fr;
          }

          .issues-search {
            grid-column: span 1;
          }

          .issues-metrics-grid {
            grid-template-columns: 1fr;
          }

          .big-issue-card {
            grid-template-columns: 1fr;
          }

          .issue-index-block {
            flex-direction: row;
            justify-content: flex-start;
          }

          .issue-meta-grid {
            grid-template-columns: 1fr;
          }

          .issue-message-box p {
            font-size: 15px;
          }
        }
      `}</style>
    </div>
  );
}