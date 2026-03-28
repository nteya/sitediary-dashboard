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

function toDateOnlyString(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getStartOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
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
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>(
    {}
  );

  const initialWeek = useMemo(() => {
    return toDateOnlyString(getStartOfWeek(new Date()));
  }, []);

  const [weekStart, setWeekStart] = useState(initialWeek);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
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
    const scoped = weeklyDiaries.filter(
      (d) => !area || d.selectedArea === area
    );
    return uniqueSorted(scoped.map((d) => d.supervisorName || ""));
  }, [weeklyDiaries, area]);

  const filteredWeeklyDiaries = useMemo(() => {
    const text = normalize(search);

    return weeklyDiaries.filter((d) => {
      const matchArea = !area || d.selectedArea === area;
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

      return matchArea && matchSupervisor && matchSearch;
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
      .sort((a, b) => a.supervisorName.localeCompare(b.supervisorName));
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

    return {
      totalDiaries,
      totalSupervisors,
      totalTasks,
      totalIssues,
    };
  }, [filteredWeeklyDiaries, supervisorProgress]);

  const resetFilters = () => {
    setSearch("");
    setArea("");
    setSupervisor("");
  };

  const toggleCard = (name: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="software-title">Weekly Progress</h1>
        <p className="software-subtitle">
          Track weekly supervisor activity, areas covered, WBS activity, task
          counts, and reported delays
        </p>
      </div>

      <div className="software-card p-5 space-y-4">
        <div className="section-header !mb-0">
          <div>
            <h2 className="text-[18px] font-extrabold text-slate-900">
              Weekly Progress Filters
            </h2>
            <p className="software-subtitle !mt-1">
              Select a week and narrow progress by area, supervisor, or search
              terms
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Week Starting
            </label>
            <input
              type="date"
              className="soft-input"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Area
            </label>
            <select
              className="soft-select"
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
            <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Supervisor
            </label>
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
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Search
            </label>
            <input
              className="soft-input"
              placeholder="Search WBS, area, tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="software-card px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Selected Week
          </p>
          <p className="mt-1 text-[14px] font-semibold text-slate-900">
            {formatDateLabel(toDateOnlyString(weekRange.start))} to{" "}
            {formatDateLabel(toDateOnlyString(weekRange.end))}
          </p>
        </div>
      </div>

      <div className="info-grid">
        <div className="metric-card">
          <p className="metric-label">Weekly Diaries</p>
          <p className="metric-value">{summary.totalDiaries}</p>
          <p className="metric-hint">Submitted diary records in this week</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Supervisors Active</p>
          <p className="metric-value">{summary.totalSupervisors}</p>
          <p className="metric-hint">Supervisors with diary activity this week</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Tasks Logged</p>
          <p className="metric-value">{summary.totalTasks}</p>
          <p className="metric-hint">Total task count across selected week</p>
        </div>

        <div className="metric-card">
          <p className="metric-label">Delays Reported</p>
          <p className="metric-value">{summary.totalIssues}</p>
          <p className="metric-hint">Diaries with logged issues or delays</p>
        </div>
      </div>

      {loading ? (
        <div className="software-card-strong p-6">
          <p className="text-[14px] text-slate-600">Loading weekly progress...</p>
        </div>
      ) : supervisorProgress.length === 0 ? (
        <div className="software-card-strong p-10 text-center">
          <p className="text-[18px] font-bold text-slate-900">
            No weekly progress found
          </p>
          <p className="software-subtitle">
            Try another week or change the filters
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {supervisorProgress.map((item) => {
            const expanded = !!expandedCards[item.supervisorName];

            const visibleAreas = expanded ? item.areas : item.areas.slice(0, 3);
            const visibleSubAreas = expanded
              ? item.subAreas
              : item.subAreas.slice(0, 3);
            const visibleWbs = expanded
              ? item.wbsItems
              : item.wbsItems.slice(0, 3);

            const hasHiddenAreas = item.areas.length > visibleAreas.length;
            const hasHiddenSubAreas =
              item.subAreas.length > visibleSubAreas.length;
            const hasHiddenWbs = item.wbsItems.length > visibleWbs.length;

            return (
              <div key={item.supervisorName} className="software-card-strong p-6">
                <div className="section-header">
                  <div>
                    <h2 className="text-[22px] font-extrabold text-slate-900">
                      {item.supervisorName}
                    </h2>
                    <p className="software-subtitle !mt-1">
                      Weekly supervisor activity overview
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCard(item.supervisorName)}
                      className="soft-button soft-button-secondary"
                    >
                      {expanded ? "Show Less" : "Show More"}
                    </button>

                    {item.diaryIds[0] && (
                      <Link
                        href={`/diaries?supervisor=${encodeURIComponent(
                          item.supervisorName
                        )}`}
                        className="soft-button soft-button-primary"
                      >
                        View Diaries
                      </Link>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                  <div className="software-card p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Diary Submissions
                    </p>
                    <p className="mt-2 text-[24px] font-extrabold text-slate-900">
                      {item.diaryCount}
                    </p>
                  </div>

                  <div className="software-card p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Tasks Count
                    </p>
                    <p className="mt-2 text-[24px] font-extrabold text-slate-900">
                      {item.taskCount}
                    </p>
                  </div>

                  <div className="software-card p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Delays Reported
                    </p>
                    <p className="mt-2 text-[24px] font-extrabold text-slate-900">
                      {item.issueCount}
                    </p>
                  </div>

                  <div className="software-card p-4">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Latest Update
                    </p>
                    <p className="mt-2 text-[18px] font-extrabold text-slate-900">
                      {formatDateLabel(item.latestDate)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="software-card p-5">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Areas Covered
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visibleAreas.length > 0 ? (
                        visibleAreas.map((areaItem) => (
                          <span
                            key={areaItem}
                            className="badge badge-neutral"
                          >
                            {areaItem}
                          </span>
                        ))
                      ) : (
                        <span className="text-[14px] text-slate-500">-</span>
                      )}

                      {hasHiddenAreas && (
                        <span className="badge badge-neutral">
                          +{item.areas.length - visibleAreas.length} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="software-card p-5">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Sub Areas Covered
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visibleSubAreas.length > 0 ? (
                        visibleSubAreas.map((subAreaItem) => (
                          <span
                            key={subAreaItem}
                            className="badge badge-neutral"
                          >
                            {subAreaItem}
                          </span>
                        ))
                      ) : (
                        <span className="text-[14px] text-slate-500">-</span>
                      )}

                      {hasHiddenSubAreas && (
                        <span className="badge badge-neutral">
                          +{item.subAreas.length - visibleSubAreas.length} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="software-card p-5">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      WBS Activities
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visibleWbs.length > 0 ? (
                        visibleWbs.map((wbsItem) => (
                          <span
                            key={wbsItem}
                            className="badge badge-neutral"
                          >
                            {wbsItem}
                          </span>
                        ))
                      ) : (
                        <span className="text-[14px] text-slate-500">-</span>
                      )}

                      {hasHiddenWbs && (
                        <span className="badge badge-neutral">
                          +{item.wbsItems.length - visibleWbs.length} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}