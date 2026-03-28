"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DiaryRecord } from "@/lib/types";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function IssuesPage() {
  const [diaries, setDiaries] = useState<DiaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>(
    {}
  );

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [subArea, setSubArea] = useState("");
  const [wbsMain, setWbsMain] = useState("");
  const [supervisor, setSupervisor] = useState("");

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

  const issuesOnly = useMemo(
    () => diaries.filter((d) => (d.issues || "").trim()),
    [diaries]
  );

  const areas = useMemo(() => {
    return uniqueSorted(issuesOnly.map((d) => d.selectedArea || ""));
  }, [issuesOnly]);

  const subAreas = useMemo(() => {
    const scoped = issuesOnly.filter((d) => !area || d.selectedArea === area);
    return uniqueSorted(scoped.map((d) => d.selectedSubArea || ""));
  }, [issuesOnly, area]);

  const wbsMainOptions = useMemo(() => {
    const scoped = issuesOnly.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
      const matchSubArea = !subArea || d.selectedSubArea === subArea;
      return matchArea && matchSubArea;
    });

    return uniqueSorted(scoped.map((d) => d.wbsMain || ""));
  }, [issuesOnly, area, subArea]);

  const supervisorOptions = useMemo(() => {
    const scoped = issuesOnly.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
      const matchSubArea = !subArea || d.selectedSubArea === subArea;
      const matchWbsMain = !wbsMain || d.wbsMain === wbsMain;
      return matchArea && matchSubArea && matchWbsMain;
    });

    return uniqueSorted(scoped.map((d) => d.supervisorName || ""));
  }, [issuesOnly, area, subArea, wbsMain]);

  const filtered = useMemo(() => {
    const text = normalize(search);

    return issuesOnly.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
      const matchSubArea = !subArea || d.selectedSubArea === subArea;
      const matchWbsMain = !wbsMain || d.wbsMain === wbsMain;
      const matchSupervisor = !supervisor || d.supervisorName === supervisor;

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

      const matchSearch = !text || normalize(searchable).includes(text);

      return (
        matchArea &&
        matchSubArea &&
        matchWbsMain &&
        matchSupervisor &&
        matchSearch
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
    const latestDate = filtered[0]?.date || "-";

    return {
      total,
      uniqueAreas,
      uniqueSupervisors,
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
    <div className="space-y-6">
      <div>
        <h1 className="software-title">Issues / Delays</h1>
        <p className="software-subtitle">
          Review all reported delays, blockers, and site instructions
        </p>
      </div>

      <div className="software-card p-5 space-y-4">
        <div className="section-header !mb-0">
          <div>
            <h2 className="text-[18px] font-extrabold text-slate-900">
              Issue Filters
            </h2>
            <p className="software-subtitle !mt-1">
              Narrow down issue reports by area, work breakdown, supervisor, or
              text search
            </p>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="soft-button soft-button-secondary"
          >
            Reset Filters
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 md:grid-cols-2 gap-4">
          <input
            className="soft-input xl:col-span-2"
            placeholder="Search by date, area, WBS, supervisor, or issue text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="soft-select"
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
            className="soft-select"
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
            className="soft-select"
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            className="soft-select"
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

          <div className="software-card px-4 py-3 flex items-center">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Current Area Focus
              </p>
              <p className="mt-1 text-[14px] font-semibold text-slate-900">
                {area || "All Areas"}
                {subArea ? `  •  ${subArea}` : ""}
              </p>
            </div>
          </div>

          <div className="software-card px-4 py-3 flex items-center">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Current WBS Focus
              </p>
              <p className="mt-1 text-[14px] font-semibold text-slate-900">
                {wbsMain || "All WBS"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="info-grid">
        <div className="metric-card">
          <p className="metric-label">Logged Issues</p>
          <p className="metric-value">{summary.total}</p>
          <p className="metric-hint">Issue records matching the current filters</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Affected Areas</p>
          <p className="metric-value">{summary.uniqueAreas}</p>
          <p className="metric-hint">Areas with issue activity in this view</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Supervisors</p>
          <p className="metric-value">{summary.uniqueSupervisors}</p>
          <p className="metric-hint">Supervisors linked to these issue reports</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Latest Issue Date</p>
          <p className="metric-value text-[26px]">{summary.latestDate}</p>
          <p className="metric-hint">Most recent issue record in this filtered view</p>
        </div>
      </div>

      <div className="software-card-strong p-6 overflow-x-auto">
        {loading ? (
          <p className="text-[14px] text-slate-600">Loading issues...</p>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[18px] font-bold text-slate-900">
              No issues found
            </p>
            <p className="software-subtitle">
              Try changing the filters or search text
            </p>
          </div>
        ) : (
          <table className="software-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supervisor</th>
                <th>Area</th>
                <th>Sub Area</th>
                <th>WBS</th>
                <th>Issue</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const isExpanded = !!expandedIssues[d.id];
                const issueText = (d.issues || "").trim();
                const shouldClamp = issueText.length > 120;

                return (
                  <tr key={d.id}>
                    <td>{d.date || "-"}</td>
                    <td>{d.supervisorName || "-"}</td>
                    <td>{d.selectedArea || "-"}</td>
                    <td>{d.selectedSubArea || "-"}</td>
                    <td>
                      {[d.wbsMain, d.wbsSub].filter(Boolean).join(" • ") || "-"}
                    </td>
                    <td className="max-w-[360px]">
                      <button
                        type="button"
                        onClick={() => toggleIssue(d.id)}
                        className="w-full rounded-2xl bg-slate-50 px-3 py-3 text-left transition hover:bg-slate-100"
                      >
                        <p
                          className={`text-[14px] leading-6 text-slate-800 ${
                            !isExpanded && shouldClamp ? "line-clamp-2" : "whitespace-pre-wrap"
                          }`}
                        >
                          {issueText}
                        </p>

                        {shouldClamp && (
                          <p className="mt-2 text-[12px] font-bold text-blue-600">
                            {isExpanded ? "Tap to collapse" : "Tap to view full issue"}
                          </p>
                        )}
                      </button>
                    </td>
                    <td>
                      <Link
                        href={`/diaries/${d.id}`}
                        className="soft-button soft-button-primary"
                      >
                        View Diary
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}