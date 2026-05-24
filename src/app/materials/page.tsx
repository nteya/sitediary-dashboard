"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { DiaryRecord, MaterialRow } from "@/lib/types";

type MaterialView = {
  id: string;
  date?: string;
  supervisorName?: string;
  area?: string;
  subArea?: string;
  description?: string;
  qty?: string;
  uom?: string;
  specification?: string;
};

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

function sumQuantity(rows: MaterialView[]) {
  return rows.reduce((total, row) => {
    const value = Number(String(row.qty || "").replace(",", "."));
    return Number.isFinite(value) ? total + value : total;
  }, 0);
}

export default function MaterialsPage() {
  const [rows, setRows] = useState<MaterialView[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [subArea, setSubArea] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [uom, setUom] = useState("");

  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthChecked(true);

      if (!user) {
        setRows([]);
        setLoading(false);
        router.push("/auth");
        return;
      }

      try {
        setLoading(true);

        // SECURITY FIX:
        // Never read from collection(db, "diaries").
        // The mobile app saves diaries under companies/{companyId}/diaries.
        // For the current owner-only dashboard setup, companyId === user.uid.
        const q = query(
          collection(db, "companies", user.uid, "diaries"),
          orderBy("date", "desc")
        );

        const snap = await getDocs(q);
        const flat: MaterialView[] = [];

        snap.docs.forEach((docSnap) => {
          const diary: DiaryRecord = {
            id: docSnap.id,
            ...(docSnap.data() as Omit<DiaryRecord, "id">),
          };

          (diary.materials || []).forEach((m: MaterialRow, index: number) => {
            if (
              (m.description || "").trim() ||
              (m.qty || "").trim() ||
              (m.uom || "").trim() ||
              (m.specification || "").trim()
            ) {
              flat.push({
                id: `${docSnap.id}-${index}`,
                date: diary.date,
                supervisorName: diary.supervisorName,
                area: diary.selectedArea,
                subArea: diary.selectedSubArea,
                description: m.description,
                qty: m.qty,
                uom: m.uom,
                specification: m.specification,
              });
            }
          });
        });

        setRows(flat);
      } catch (error) {
        console.error("Error loading company materials:", error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  const areas = useMemo(() => {
    return uniqueSorted(rows.map((r) => r.area || ""));
  }, [rows]);

  const subAreas = useMemo(() => {
    const scoped = rows.filter((r) => !area || r.area === area);
    return uniqueSorted(scoped.map((r) => r.subArea || ""));
  }, [rows, area]);

  const supervisors = useMemo(() => {
    const scoped = rows.filter((r) => {
      return (!area || r.area === area) && (!subArea || r.subArea === subArea);
    });

    return uniqueSorted(scoped.map((r) => r.supervisorName || ""));
  }, [rows, area, subArea]);

  const uoms = useMemo(() => {
    const scoped = rows.filter((r) => {
      return (
        (!area || r.area === area) &&
        (!subArea || r.subArea === subArea) &&
        (!supervisor || r.supervisorName === supervisor)
      );
    });

    return uniqueSorted(scoped.map((r) => r.uom || ""));
  }, [rows, area, subArea, supervisor]);

  const filteredRows = useMemo(() => {
    const text = normalize(search);

    return rows.filter((r) => {
      const searchable = [
        r.date,
        r.supervisorName,
        r.area,
        r.subArea,
        r.description,
        r.qty,
        r.uom,
        r.specification,
      ]
        .filter(Boolean)
        .join(" ");

      return (
        (!area || r.area === area) &&
        (!subArea || r.subArea === subArea) &&
        (!supervisor || r.supervisorName === supervisor) &&
        (!uom || r.uom === uom) &&
        (!text || normalize(searchable).includes(text))
      );
    });
  }, [rows, search, area, subArea, supervisor, uom]);

  const summary = useMemo(() => {
    const totalEntries = filteredRows.length;
    const uniqueMaterials = new Set(
      filteredRows.map((r) => normalize(r.description)).filter(Boolean)
    ).size;
    const uniqueAreas = new Set(filteredRows.map((r) => r.area).filter(Boolean))
      .size;
    const uniqueSupervisors = new Set(
      filteredRows.map((r) => r.supervisorName).filter(Boolean)
    ).size;
    const totalQty = sumQuantity(filteredRows);

    return {
      totalEntries,
      uniqueMaterials,
      uniqueAreas,
      uniqueSupervisors,
      totalQty,
    };
  }, [filteredRows]);

  const resetFilters = () => {
    setSearch("");
    setArea("");
    setSubArea("");
    setSupervisor("");
    setUom("");
  };

  if (!authChecked || loading) {
    return (
      <div className="materials-dashboard-page">
        <div className="materials-loading-card">
          <div className="materials-loader-dot"></div>
          <h1>Loading company materials...</h1>
          <p>Opening the materials register inside your company workspace only.</p>
        </div>

        <style jsx global>{`
          .materials-dashboard-page {
            min-height: 60vh;
            display: grid;
            place-items: center;
          }

          .materials-loading-card {
            width: min(560px, 100%);
            text-align: center;
            padding: 34px;
            border-radius: 26px;
            border: 1px solid #dfe4dc;
            background: #ffffff;
            box-shadow: 0 20px 55px rgba(18, 26, 22, 0.1);
          }

          .materials-loader-dot {
            width: 16px;
            height: 16px;
            margin: 0 auto 14px;
            border-radius: 999px;
            background: #c7892a;
            box-shadow: 0 0 0 8px rgba(199, 137, 42, 0.14);
          }

          .materials-loading-card h1 {
            margin: 0;
            color: #0f1713;
            font-size: 24px;
            font-weight: 950;
            letter-spacing: -0.04em;
          }

          .materials-loading-card p {
            margin: 8px 0 0;
            color: #66726a;
            font-size: 13px;
            line-height: 1.6;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="materials-dashboard-page">
      <section className="materials-hero">
        <div>
          <p className="materials-kicker">SiteDiary Materials Register</p>
          <h1>Materials Usage Dashboard</h1>
          <p>
            Track materials captured from your company supervisor diaries in a clean
            spreadsheet-style register built for site analysis, quantity review,
            and material control.
          </p>
        </div>

        <div className="materials-hero-badge">
          {filteredRows.length} visible rows
        </div>
      </section>

      <section className="materials-filter-panel">
        <div className="materials-filter-top">
          <div>
            <h2>Material Filters</h2>
            <p>
              Filter material usage by area, supervisor, unit of measure, or
              search description/specification. These rows come only from your company workspace.
            </p>
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="materials-reset-btn"
          >
            Reset Filters
          </button>
        </div>

        <div className="materials-filter-grid">
          <input
            className="materials-control materials-search"
            placeholder="Search material, specification, supervisor, area, qty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="materials-control"
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setSubArea("");
              setSupervisor("");
              setUom("");
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
            className="materials-control"
            value={subArea}
            onChange={(e) => {
              setSubArea(e.target.value);
              setSupervisor("");
              setUom("");
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
            className="materials-control"
            value={supervisor}
            onChange={(e) => {
              setSupervisor(e.target.value);
              setUom("");
            }}
          >
            <option value="">All supervisors</option>
            {supervisors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            className="materials-control"
            value={uom}
            onChange={(e) => setUom(e.target.value)}
          >
            <option value="">All UOM</option>
            {uoms.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="materials-metrics-grid">
        <div className="materials-metric-card">
          <p>Material Entries</p>
          <strong>{summary.totalEntries}</strong>
          <span>Rows matching current filters</span>
        </div>

        <div className="materials-metric-card">
          <p>Unique Materials</p>
          <strong>{summary.uniqueMaterials}</strong>
          <span>Different descriptions captured</span>
        </div>

        <div className="materials-metric-card">
          <p>Total Qty</p>
          <strong>{summary.totalQty}</strong>
          <span>Numeric quantity total where possible</span>
        </div>

        <div className="materials-metric-card">
          <p>Affected Areas</p>
          <strong>{summary.uniqueAreas}</strong>
          <span>Areas with material activity</span>
        </div>

        <div className="materials-metric-card">
          <p>Supervisors</p>
          <strong>{summary.uniqueSupervisors}</strong>
          <span>Supervisors who captured materials</span>
        </div>
      </section>

      <section className="materials-sheet-shell">
        <div className="materials-sheet-toolbar">
          <div>
            <h2>Material Usage Register</h2>
            <p>
              Spreadsheet-style material sheet for reviewing long material lists
              from submitted company diaries.
            </p>
          </div>

          <div className="materials-sheet-count">
            {filteredRows.length} / {rows.length} rows
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="materials-empty-state">
            <h3>No materials found</h3>
            <p>Try changing the filters or search text.</p>
          </div>
        ) : (
          <div className="materials-sheet-scroll">
            <table className="materials-grid-table">
              <colgroup>
                <col className="mat-row" />
                <col className="mat-date" />
                <col className="mat-supervisor" />
                <col className="mat-area" />
                <col className="mat-area" />
                <col className="mat-description" />
                <col className="mat-qty" />
                <col className="mat-uom" />
                <col className="mat-specification" />
              </colgroup>

              <thead>
                <tr className="materials-letters-row">
                  <th></th>
                  <th>A</th>
                  <th>B</th>
                  <th>C</th>
                  <th>D</th>
                  <th>E</th>
                  <th>F</th>
                  <th>G</th>
                  <th>H</th>
                </tr>

                <tr className="materials-header-row">
                  <th>#</th>
                  <th>Date</th>
                  <th>Supervisor</th>
                  <th>Area</th>
                  <th>Sub Area</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>UOM</th>
                  <th>Specification</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((m, index) => (
                  <tr key={m.id} className="materials-data-row">
                    <td className="materials-row-number">{index + 1}</td>
                    <td className="materials-date-cell">
                      {formatDateLabel(m.date)}
                    </td>
                    <td title={m.supervisorName || "-"}>
                      {m.supervisorName || "-"}
                    </td>
                    <td title={m.area || "-"}>{m.area || "-"}</td>
                    <td title={m.subArea || "-"}>{m.subArea || "-"}</td>
                    <td
                      className="materials-description-cell"
                      title={m.description || "-"}
                    >
                      {m.description || "-"}
                    </td>
                    <td className="materials-qty-cell">{m.qty || "-"}</td>
                    <td>
                      <span className="materials-uom-pill">
                        {m.uom || "-"}
                      </span>
                    </td>
                    <td
                      className="materials-spec-cell"
                      title={m.specification || "-"}
                    >
                      {m.specification || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx global>{`
        .materials-dashboard-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .materials-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding: 22px;
          border-radius: 20px;
          background:
            radial-gradient(circle at top right, rgba(199, 137, 42, 0.24), transparent 30%),
            linear-gradient(135deg, #1f2a24 0%, #2d3a32 60%, #3a321f 100%);
          color: #ffffff;
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
        }

        .materials-kicker {
          margin: 0 0 6px;
          color: #f3d59d;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .materials-hero h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 950;
        }

        .materials-hero p {
          margin: 9px 0 0;
          max-width: 920px;
          color: rgba(255, 255, 255, 0.78);
          font-size: 13.5px;
          line-height: 1.6;
        }

        .materials-hero-badge {
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

        .materials-filter-panel {
          padding: 16px;
          border-radius: 18px;
          border: 1px solid var(--border, #dfe4dc);
          background: #ffffff;
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
        }

        .materials-filter-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 13px;
        }

        .materials-filter-top h2 {
          margin: 0;
          color: var(--text-strong, #0f1713);
          font-size: 17px;
          font-weight: 950;
          letter-spacing: -0.025em;
        }

        .materials-filter-top p {
          margin: 4px 0 0;
          color: var(--muted, #66726a);
          font-size: 12.5px;
        }

        .materials-reset-btn {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 10px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          color: var(--text-strong, #0f1713);
          font-size: 12px;
          font-weight: 900;
        }

        .materials-filter-grid {
          display: grid;
          grid-template-columns: 2fr repeat(4, minmax(120px, 1fr));
          gap: 10px;
        }

        .materials-control {
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

        .materials-control:focus {
          border-color: rgba(199, 137, 42, 0.8);
          box-shadow: 0 0 0 3px rgba(199, 137, 42, 0.14);
        }

        .materials-metrics-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }

        .materials-metric-card {
          min-height: 118px;
          padding: 17px;
          border-radius: 17px;
          border: 1px solid var(--border, #dfe4dc);
          background: linear-gradient(180deg, #ffffff, #fafbf8);
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
          position: relative;
          overflow: hidden;
        }

        .materials-metric-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 17px;
          bottom: 17px;
          width: 4px;
          border-radius: 999px;
          background: var(--accent, #c7892a);
        }

        .materials-metric-card p {
          margin: 0;
          color: var(--muted, #66726a);
          font-size: 12px;
          font-weight: 900;
        }

        .materials-metric-card strong {
          display: block;
          margin-top: 9px;
          color: var(--text-strong, #0f1713);
          font-size: 32px;
          line-height: 1;
          letter-spacing: -0.045em;
          font-weight: 950;
        }

        .materials-metric-card span {
          display: block;
          margin-top: 7px;
          color: var(--muted-2, #8a948d);
          font-size: 11.5px;
          line-height: 1.45;
        }

        .materials-sheet-shell {
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid #c7d0c5;
          background: #ffffff;
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
        }

        .materials-sheet-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 16px;
          border-bottom: 1px solid #cbd3c9;
          background: linear-gradient(180deg, #ffffff, #f3f5f1);
        }

        .materials-sheet-toolbar h2 {
          margin: 0;
          color: var(--text-strong, #0f1713);
          font-size: 18px;
          font-weight: 950;
          letter-spacing: -0.03em;
        }

        .materials-sheet-toolbar p {
          margin: 4px 0 0;
          color: var(--muted, #66726a);
          font-size: 12.5px;
        }

        .materials-sheet-count {
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

        .materials-sheet-scroll {
          width: 100%;
          overflow: auto;
          max-height: calc(100vh - 315px);
          background: #ffffff;
        }

        .materials-grid-table {
          width: 1360px;
          min-width: 1360px;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 12px;
        }

        .mat-row {
          width: 48px;
        }

        .mat-date {
          width: 130px;
        }

        .mat-supervisor {
          width: 165px;
        }

        .mat-area {
          width: 145px;
        }

        .mat-description {
          width: 310px;
        }

        .mat-qty {
          width: 90px;
        }

        .mat-uom {
          width: 90px;
        }

        .mat-specification {
          width: 300px;
        }

        .materials-grid-table th,
        .materials-grid-table td {
          height: 35px;
          padding: 0 9px;
          border: 1px solid #d8ded5;
          background: #ffffff;
          color: #17201b;
          vertical-align: middle;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .materials-letters-row th {
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

        .materials-header-row th {
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

        .materials-letters-row th:first-child,
        .materials-header-row th:first-child {
          position: sticky;
          left: 0;
          z-index: 25;
          text-align: center;
        }

        .materials-letters-row th:first-child {
          background: #dce4d9;
          color: #536059;
        }

        .materials-header-row th:first-child {
          top: 25px;
          background: #1f2a24;
          color: #ffffff;
        }

        .materials-row-number {
          position: sticky;
          left: 0;
          z-index: 10;
          text-align: center;
          background: #eff3ec !important;
          color: #66726a;
          font-weight: 950;
        }

        .materials-data-row:nth-child(even) td {
          background: #fcfdf9;
        }

        .materials-data-row:hover td {
          background: #fff7e6;
        }

        .materials-date-cell,
        .materials-description-cell,
        .materials-qty-cell {
          font-weight: 900;
          color: var(--text-strong, #0f1713);
        }

        .materials-uom-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 42px;
          height: 23px;
          padding: 0 8px;
          border-radius: 999px;
          background: #fff4df;
          color: #80520f;
          border: 1px solid #ead5aa;
          font-size: 11px;
          font-weight: 950;
        }

        .materials-empty-state {
          padding: 32px;
          color: var(--muted, #66726a);
          text-align: center;
        }

        .materials-empty-state h3 {
          margin: 0;
          font-size: 18px;
          color: var(--text-strong, #0f1713);
          font-weight: 950;
        }

        .materials-empty-state p {
          margin: 6px 0 0;
          font-size: 13px;
        }

        @media (max-width: 1200px) {
          .materials-filter-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .materials-search {
            grid-column: span 3;
          }

          .materials-metrics-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .materials-hero,
          .materials-filter-top,
          .materials-sheet-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .materials-filter-grid,
          .materials-metrics-grid {
            grid-template-columns: 1fr;
          }

          .materials-search {
            grid-column: span 1;
          }

          .materials-sheet-scroll {
            max-height: none;
          }
        }
      `}</style>
    </div>
  );
}
