"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, Fragment } from "react";
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

function formatDateLabel(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
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

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [subArea, setSubArea] = useState("");
  const [wbsMain, setWbsMain] = useState("");
  const [wbsSub, setWbsSub] = useState("");
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

  const areas = useMemo(() => {
    return uniqueSorted(diaries.map((d) => d.selectedArea || ""));
  }, [diaries]);

  const subAreas = useMemo(() => {
    const scoped = diaries.filter((d) => !area || d.selectedArea === area);
    return uniqueSorted(scoped.map((d) => d.selectedSubArea || ""));
  }, [diaries, area]);

  const wbsMainOptions = useMemo(() => {
    const scoped = diaries.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
      const matchSubArea = !subArea || d.selectedSubArea === subArea;
      return matchArea && matchSubArea;
    });

    return uniqueSorted(scoped.map((d) => d.wbsMain || ""));
  }, [diaries, area, subArea]);

  const wbsSubOptions = useMemo(() => {
    const scoped = diaries.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
      const matchSubArea = !subArea || d.selectedSubArea === subArea;
      const matchWbsMain = !wbsMain || d.wbsMain === wbsMain;
      return matchArea && matchSubArea && matchWbsMain;
    });

    return uniqueSorted(scoped.map((d) => d.wbsSub || ""));
  }, [diaries, area, subArea, wbsMain]);

  const supervisorOptions = useMemo(() => {
    const scoped = diaries.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
      const matchSubArea = !subArea || d.selectedSubArea === subArea;
      const matchWbsMain = !wbsMain || d.wbsMain === wbsMain;
      const matchWbsSub = !wbsSub || d.wbsSub === wbsSub;

      return matchArea && matchSubArea && matchWbsMain && matchWbsSub;
    });

    return uniqueSorted(scoped.map((d) => d.supervisorName || ""));
  }, [diaries, area, subArea, wbsMain, wbsSub]);

  useEffect(() => {
    if (area && !areas.includes(area)) setArea("");
  }, [area, areas]);

  useEffect(() => {
    if (subArea && !subAreas.includes(subArea)) setSubArea("");
  }, [subArea, subAreas]);

  useEffect(() => {
    if (wbsMain && !wbsMainOptions.includes(wbsMain)) setWbsMain("");
  }, [wbsMain, wbsMainOptions]);

  useEffect(() => {
    if (wbsSub && !wbsSubOptions.includes(wbsSub)) setWbsSub("");
  }, [wbsSub, wbsSubOptions]);

  useEffect(() => {
    if (supervisor && !supervisorOptions.includes(supervisor)) setSupervisor("");
  }, [supervisor, supervisorOptions]);

  const filtered = useMemo(() => {
    const text = normalize(search);

    return diaries.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
      const matchSubArea = !subArea || d.selectedSubArea === subArea;
      const matchWbsMain = !wbsMain || d.wbsMain === wbsMain;
      const matchWbsSub = !wbsSub || d.wbsSub === wbsSub;
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
        matchWbsSub &&
        matchSupervisor &&
        matchSearch
      );
    });
  }, [diaries, search, area, subArea, wbsMain, wbsSub, supervisor]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const issueCount = filtered.filter((d) => (d.issues || "").trim()).length;
    const supervisorCount = new Set(
      filtered.map((d) => d.supervisorName).filter(Boolean)
    ).size;
    const latestDate = filtered[0]?.date || "";

    return {
      total,
      issueCount,
      supervisorCount,
      latestDate,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="software-title">Diaries</h1>
        <p className="software-subtitle">
          Track diary submissions by area, sub area, WBS, supervisor, and date
        </p>
      </div>

      <div className="software-card p-5 space-y-4">
        <div className="section-header !mb-0">
          <div>
            <h2 className="text-[18px] font-extrabold text-slate-900">
              Progress Filters
            </h2>
            <p className="software-subtitle !mt-1">
              Narrow down records exactly the way management wants to track site
              progress
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

        <div className="grid grid-cols-1 xl:grid-cols-6 md:grid-cols-2 gap-4">
          <input
            className="soft-input xl:col-span-2"
            placeholder="Search by date, area, sub area, WBS, supervisor, tasks..."
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
            className="soft-select"
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
            className="soft-select"
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
            className="soft-select"
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
                {wbsSub ? `  •  ${wbsSub}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="info-grid">
        <div className="metric-card">
          <p className="metric-label">Matching Diaries</p>
          <p className="metric-value">{summary.total}</p>
          <p className="metric-hint">Records matching the selected filters</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Supervisors</p>
          <p className="metric-value">{summary.supervisorCount}</p>
          <p className="metric-hint">Unique supervisors in the filtered result</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Issues Logged</p>
          <p className="metric-value">{summary.issueCount}</p>
          <p className="metric-hint">Diaries where issues or delays were recorded</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Latest Diary Date</p>
          <p className="metric-value text-[26px]">
            {formatDateLabel(summary.latestDate)}
          </p>
          <p className="metric-hint">Most recent submission in this filtered view</p>
        </div>
      </div>

      <div className="software-card-strong p-6 overflow-x-auto">
        {loading ? (
          <p className="text-[14px] text-slate-600">Loading diaries...</p>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[18px] font-bold text-slate-900">
              No diaries found
            </p>
            <p className="software-subtitle">
              Try changing the area, sub area, WBS, supervisor, or search text
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
                <th>Tasks</th>
                <th>Issues</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const taskCount = d.tasks?.filter(Boolean).length || 0;
                const firstTask = d.tasks?.find((t) => normalize(t)) || "";
                const hasIssues = !!(d.issues || "").trim();
                const pdfUrl = getPdfUrl(d as DiaryRecord & {
                  pdfUrl?: string;
                  pdfLink?: string;
                  downloadUrl?: string;
                  fileUrl?: string;
                });

                return (
                  <Fragment key={d.id}>
                    <tr>
                      <td>{d.date || "-"}</td>
                      <td>{d.supervisorName || "-"}</td>
                      <td>{d.selectedArea || "-"}</td>
                      <td>{d.selectedSubArea || "-"}</td>
                      <td>
                        {[d.wbsMain, d.wbsSub].filter(Boolean).join(" • ") || "-"}
                      </td>
                      <td>
                        {taskCount > 0 ? (
                          <div className="space-y-1">
                            <p className="text-[13px] font-semibold text-slate-900">
                              {taskCount} task{taskCount > 1 ? "s" : ""}
                            </p>
                            <p className="text-[12px] text-slate-500">
                              {firstTask || "Task recorded"}
                            </p>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        {hasIssues ? (
                          <button
                            type="button"
                            onClick={() => toggleIssue(d.id)}
                            className="badge badge-danger cursor-pointer"
                          >
                            {openIssues[d.id] ? "Hide Issue" : "Issue Logged"}
                          </button>
                        ) : (
                          <span className="badge badge-success">Clear</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/diaries/${d.id}`}
                            className="soft-button soft-button-primary"
                          >
                            View Diary
                          </Link>

                          {pdfUrl ? (
                            <a
                              href={pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="soft-button soft-button-secondary"
                            >
                              Open PDF
                            </a>
                          ) : (
                            <span className="soft-button soft-button-secondary opacity-60 cursor-not-allowed">
                              No PDF
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {hasIssues && openIssues[d.id] && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50">
                          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 my-3">
                            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-red-700">
                              Logged Issue / Delay
                            </p>
                            <p className="mt-2 text-[14px] leading-7 text-slate-800">
                              {d.issues}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}