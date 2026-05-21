"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  FileBarChart,
  CalendarDays,
  Loader2,
  Search,
  Printer,
  Users,
  Boxes,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  Save,
  FileText,
  FolderOpen,
} from "lucide-react";

type Diary = {
  diaryId?: string;
  id?: string;
  companyId?: string;
  companyName?: string;
  project?: string;
  date?: string;
  supervisorName?: string;
  wbsMain?: string;
  wbsSub?: string;
  wbsText?: string;
  selectedArea?: string;
  selectedSubArea?: string;
  manpower?: any[];
  tasks?: string[];
  materials?: any[];
  plantEquipment?: any[];
  issues?: string;
  hasIssues?: boolean;
  totalManpowerHours?: number;
  pdfUrl?: string;
  submittedAtISO?: string;
  customFields?: any[];
  customFieldAnswers?: Record<string, any>;
};

type CompanySettings = {
  companyName?: string;
  projectName?: string;
  logoUrl?: string;
};

type SavedReport = {
  reportId: string;
  reportType: string;
  startDate: string;
  endDate: string;
  clientName: string;
  preparedBy: string;
  diaryIds: string[];
  stats: any;
  createdAt: any;
};

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStartISO() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function getMonthStartISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function safeText(value: any) {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function cleanNone(value: any) {
  if (!value || value === "__NONE__") return "";
  return String(value);
}

function getWbsText(diary: Diary) {
  if (diary.wbsText) return diary.wbsText;
  if (diary.wbsMain && diary.wbsSub) return `${diary.wbsMain} - ${diary.wbsSub}`;
  if (diary.wbsMain) return diary.wbsMain;
  return "Unspecified WBS";
}

function numberValue(value: any) {
  const n = Number(value || 0);
  return Number.isNaN(n) ? 0 : n;
}

function normalizeDiary(docId: string, data: any): Diary {
  return {
    id: docId,
    diaryId: data.diaryId || docId,
    ...data,
  };
}

function isDiaryInsideRange(diary: Diary, startDate: string, endDate: string) {
  if (!diary.date) return false;
  return diary.date >= startDate && diary.date <= endDate;
}

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingReport, setSavingReport] = useState(false);

  const [reportType, setReportType] = useState("daily");
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
  const [clientName, setClientName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [lastFetchMessage, setLastFetchMessage] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setPreparedBy(currentUser.email || "");

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        const activeCompanyId =
          userSnap.exists() && userSnap.data().companyId
            ? userSnap.data().companyId
            : currentUser.uid;

        setCompanyId(activeCompanyId);

        const settingsRef = doc(
          db,
          "companies",
          activeCompanyId,
          "settings",
          "appConfig"
        );

        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
          setSettings(settingsSnap.data() as CompanySettings);
        }
      } catch (error) {
        console.error("Reports load error:", error);
        alert("Could not load report settings.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const applyReportType = (value: string) => {
    setReportType(value);

    if (value === "daily") {
      const today = getTodayISO();
      setStartDate(today);
      setEndDate(today);
    }

    if (value === "weekly") {
      setStartDate(getWeekStartISO());
      setEndDate(getTodayISO());
    }

    if (value === "monthly") {
      setStartDate(getMonthStartISO());
      setEndDate(getTodayISO());
    }
  };

  const fetchCompanyDiaries = async (activeCompanyId: string) => {
    const diariesRef = collection(db, "companies", activeCompanyId, "diaries");

    try {
      const q = query(diariesRef, orderBy("date", "asc"));
      const snap = await getDocs(q);

      return snap.docs.map((docSnap) =>
        normalizeDiary(docSnap.id, docSnap.data())
      );
    } catch (error) {
      console.warn("Ordered company diary fetch failed, retrying plain fetch:", error);

      const snap = await getDocs(diariesRef);

      return snap.docs.map((docSnap) =>
        normalizeDiary(docSnap.id, docSnap.data())
      );
    }
  };

  const fetchLegacyRootDiaries = async (activeCompanyId: string) => {
    try {
      const rootRef = collection(db, "diaries");
      const snap = await getDocs(rootRef);

      return snap.docs
        .map((docSnap) => normalizeDiary(docSnap.id, docSnap.data()))
        .filter((diary) => {
          if (!diary.companyId) return false;
          return diary.companyId === activeCompanyId;
        });
    } catch (error) {
      console.warn("Legacy diary fetch skipped:", error);
      return [];
    }
  };

  const fetchReportDiaries = async () => {
    if (!companyId) {
      alert("Company ID not found yet. Please refresh and try again.");
      return;
    }

    if (!startDate || !endDate) {
      alert("Please select a start date and end date.");
      return;
    }

    if (startDate > endDate) {
      alert("Start date cannot be after end date.");
      return;
    }

    setLoadingReport(true);
    setLastFetchMessage("");

    try {
      const companyDiaries = await fetchCompanyDiaries(companyId);
      const legacyDiaries = await fetchLegacyRootDiaries(companyId);

      const allMap = new Map<string, Diary>();

      [...companyDiaries, ...legacyDiaries].forEach((diary) => {
        const id = diary.diaryId || diary.id || `${diary.date}_${Math.random()}`;
        allMap.set(id, diary);
      });

      const allDiaries = Array.from(allMap.values());

      const filtered = allDiaries
        .filter((diary) => isDiaryInsideRange(diary, startDate, endDate))
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

      setDiaries(filtered);

      setLastFetchMessage(
        `Found ${filtered.length} diary/diaries from ${allDiaries.length} total record(s) checked.`
      );
    } catch (error) {
      console.error("Fetch report diaries error:", error);
      alert("Could not fetch diaries. Check Firebase rules and diary path.");
    } finally {
      setLoadingReport(false);
    }
  };

  const reportStats = useMemo(() => {
    const supervisors = new Set<string>();
    let totalHours = 0;
    let totalTasks = 0;
    let totalMaterials = 0;
    let totalPlant = 0;
    let totalIssues = 0;

    diaries.forEach((diary) => {
      if (diary.supervisorName) supervisors.add(diary.supervisorName);

      if (diary.totalManpowerHours !== undefined) {
        totalHours += numberValue(diary.totalManpowerHours);
      } else {
        totalHours += (diary.manpower || []).reduce((sum, row) => {
          return sum + numberValue(row.hours);
        }, 0);
      }

      totalTasks += Array.isArray(diary.tasks) ? diary.tasks.length : 0;
      totalMaterials += Array.isArray(diary.materials)
        ? diary.materials.length
        : 0;
      totalPlant += Array.isArray(diary.plantEquipment)
        ? diary.plantEquipment.length
        : 0;

      if ((diary.issues || "").trim()) totalIssues++;
    });

    return {
      diaryCount: diaries.length,
      supervisorCount: supervisors.size,
      totalHours,
      totalTasks,
      totalMaterials,
      totalPlant,
      totalIssues,
    };
  }, [diaries]);

  const groupedByArea = useMemo(() => {
    const map = new Map<string, Diary[]>();

    diaries.forEach((diary) => {
      const area = cleanNone(diary.selectedArea) || "Unspecified Area";
      if (!map.has(area)) map.set(area, []);
      map.get(area)?.push(diary);
    });

    return Array.from(map.entries()).map(([area, areaDiaries]) => ({
      area,
      diaries: areaDiaries,
    }));
  }, [diaries]);

  const manpowerSummary = useMemo(() => {
    const map = new Map<string, { role: string; number: number; hours: number }>();

    diaries.forEach((diary) => {
      (diary.manpower || []).forEach((row) => {
        const role =
          row.role && row.role !== "__NONE__" ? row.role : "Unspecified Role";

        const existing = map.get(role) || {
          role,
          number: 0,
          hours: 0,
        };

        existing.number += numberValue(row.number);
        existing.hours += numberValue(row.hours);

        map.set(role, existing);
      });
    });

    return Array.from(map.values());
  }, [diaries]);

  const materialSummary = useMemo(() => {
    const map = new Map<string, { description: string; qty: number; uom: string }>();

    diaries.forEach((diary) => {
      (diary.materials || []).forEach((mat) => {
        const description = mat.description || "Unspecified Material";
        const uom = mat.uom && mat.uom !== "__NONE__" ? mat.uom : "";

        const key = `${description}_${uom}`;

        const existing = map.get(key) || {
          description,
          qty: 0,
          uom,
        };

        existing.qty += numberValue(mat.qty);

        map.set(key, existing);
      });
    });

    return Array.from(map.values());
  }, [diaries]);

  const plantRows = useMemo(() => {
    return diaries.flatMap((diary) =>
      (diary.plantEquipment || []).map((plant, index) => ({
        id: `${diary.diaryId || diary.id}_plant_${index}`,
        date: diary.date,
        area: diary.selectedArea,
        description: plant.description,
        number: plant.number,
      }))
    );
  }, [diaries]);

  const issueRows = useMemo(() => {
    return diaries.filter((diary) => (diary.issues || "").trim());
  }, [diaries]);

  const allCustomFieldRows = useMemo(() => {
    return diaries.flatMap((diary) => {
      if (Array.isArray(diary.customFields) && diary.customFields.length > 0) {
        return diary.customFields
          .filter((field) => field.value !== undefined && field.value !== "")
          .map((field) => ({
            diaryId: diary.diaryId || diary.id,
            date: diary.date,
            supervisor: diary.supervisorName,
            label: field.label,
            value: field.value,
          }));
      }

      if (diary.customFieldAnswers) {
        return Object.entries(diary.customFieldAnswers).map(([key, value]) => ({
          diaryId: diary.diaryId || diary.id,
          date: diary.date,
          supervisor: diary.supervisorName,
          label: key,
          value,
        }));
      }

      return [];
    });
  }, [diaries]);

  const saveCompiledReport = async () => {
    if (!companyId) {
      alert("Company ID not found.");
      return;
    }

    if (diaries.length === 0) {
      alert("Generate a report with diaries before saving.");
      return;
    }

    setSavingReport(true);

    try {
      const reportId = `${Date.now()}_${reportType}_${startDate}_${endDate}`;

      const payload: SavedReport = {
        reportId,
        reportType,
        startDate,
        endDate,
        clientName,
        preparedBy,
        diaryIds: diaries.map((d) => d.diaryId || d.id || "").filter(Boolean),
        stats: reportStats,
        createdAt: serverTimestamp(),
      };

      await setDoc(
        doc(db, "companies", companyId, "compiledReports", reportId),
        payload
      );

      alert("Compiled report saved successfully.");
    } catch (error) {
      console.error("Save compiled report error:", error);
      alert("Could not save compiled report.");
    } finally {
      setSavingReport(false);
    }
  };

  const printReport = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="software-card-strong settings-card">
        <p style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 className="animate-spin" size={18} />
          Loading report compiler...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="software-card-strong settings-card">
        <h2 className="software-title">Access denied</h2>
        <p className="software-subtitle">
          Please login before generating reports.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }

          #compiled-report, #compiled-report * {
            visibility: visible;
          }

          #compiled-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            background: white;
          }

          .no-print {
            display: none !important;
          }

          .report-page-break {
            page-break-before: always;
          }
        }

        .report-cover {
          border: 1px solid #d7dde8;
          border-radius: 20px;
          padding: 28px;
          background: linear-gradient(180deg, #ffffff, #f8fafc);
        }

        .report-logo {
          width: 140px;
          max-height: 80px;
          object-fit: contain;
        }

        .report-title-big {
          font-size: 30px;
          font-weight: 950;
          margin: 0;
          color: #0f172a;
        }

        .report-muted {
          color: #64748b;
          font-size: 13px;
        }

        .report-section {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
        }

        .report-section h2 {
          font-size: 18px;
          margin: 0 0 10px;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          overflow: hidden;
          border-radius: 12px;
        }

        .report-table th {
          text-align: left;
          background: #f1f5f9;
          color: #0f172a;
          font-weight: 800;
          padding: 10px;
          border: 1px solid #e2e8f0;
        }

        .report-table td {
          padding: 10px;
          border: 1px solid #e2e8f0;
          vertical-align: top;
        }

        .report-area-card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 14px;
          background: #ffffff;
        }

        .report-area-title {
          font-size: 16px;
          font-weight: 900;
          margin-bottom: 8px;
          color: #111827;
        }

        .report-list {
          margin: 0;
          padding-left: 20px;
        }

        .report-list li {
          margin-bottom: 5px;
        }

        .report-debug {
          margin-top: 12px;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          padding: 12px;
          background: #f8fafc;
          font-size: 13px;
          color: #475569;
        }
      `}</style>

      <section className="software-card-strong settings-hero no-print">
        <div className="settings-hero-left">
          <div className="settings-icon-box">
            <FileBarChart size={28} />
          </div>

          <div>
            <h1 className="software-title">Report Compiler</h1>
            <p className="software-subtitle">
              Select a period, pull submitted diaries, save the compiled report,
              and print a client-ready document.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={saveCompiledReport}
            disabled={savingReport || diaries.length === 0}
            className="soft-button soft-button-secondary"
          >
            {savingReport ? (
              <>
                <Loader2 className="animate-spin" size={17} />
                Saving...
              </>
            ) : (
              <>
                <Save size={17} />
                Save Report
              </>
            )}
          </button>

          <button
            onClick={printReport}
            disabled={diaries.length === 0}
            className="soft-button soft-button-primary"
          >
            <Printer size={17} />
            Print / Save PDF
          </button>
        </div>
      </section>

      <section className="software-card settings-card no-print">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">
              <CalendarDays size={20} /> Report Period
            </h2>
            <p className="software-subtitle">
              Choose daily, weekly, monthly, or custom date range.
            </p>
          </div>
        </div>

        <div className="settings-grid">
          <div className="settings-form-group">
            <label className="settings-label">Report Type</label>
            <select
              className="soft-input"
              value={reportType}
              onChange={(e) => applyReportType(e.target.value)}
            >
              <option value="daily">Daily Report</option>
              <option value="weekly">Weekly Report</option>
              <option value="monthly">Monthly Report</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Start Date</label>
            <input
              type="date"
              className="soft-input"
              value={startDate}
              onChange={(e) => {
                setReportType("custom");
                setStartDate(e.target.value);
              }}
            />
          </div>

          <div className="settings-form-group">
            <label className="settings-label">End Date</label>
            <input
              type="date"
              className="soft-input"
              value={endDate}
              onChange={(e) => {
                setReportType("custom");
                setEndDate(e.target.value);
              }}
            />
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Client Name</label>
            <input
              className="soft-input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Kumba Iron Ore"
            />
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Prepared By</label>
            <input
              className="soft-input"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="Prepared by"
            />
          </div>
        </div>

        <button
          onClick={fetchReportDiaries}
          disabled={loadingReport}
          className="soft-button soft-button-primary"
          style={{ marginTop: 16 }}
        >
          {loadingReport ? (
            <>
              <Loader2 className="animate-spin" size={17} />
              Compiling...
            </>
          ) : (
            <>
              <Search size={17} />
              Generate Report Preview
            </>
          )}
        </button>

        <div className="report-debug">
          <strong>Company ID being searched:</strong> {companyId || "Not found"}
          <br />
          <strong>Date range:</strong> {startDate || "—"} to {endDate || "—"}
          <br />
          <strong>Status:</strong>{" "}
          {lastFetchMessage || "No report generated yet."}
        </div>
      </section>

      <section id="compiled-report" className="software-card settings-card">
        <div className="report-cover">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 24,
              alignItems: "flex-start",
            }}
          >
            <div>
              <p className="report-muted" style={{ margin: 0 }}>
                SiteDiary Compiled Report
              </p>

              <h1 className="report-title-big">
                {reportType === "daily"
                  ? "Daily Report"
                  : reportType === "weekly"
                  ? "Weekly Report"
                  : reportType === "monthly"
                  ? "Monthly Report"
                  : "Custom Period Report"}
              </h1>

              <p className="report-muted">
                Reporting Period: <strong>{startDate}</strong> to{" "}
                <strong>{endDate}</strong>
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              {settings.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt="Company logo"
                  className="report-logo"
                />
              ) : (
                <h2 style={{ margin: 0 }}>SiteDiary</h2>
              )}

              <p className="report-muted" style={{ marginTop: 8 }}>
                {settings.companyName || "Company"}
              </p>
            </div>
          </div>

          <div className="report-section">
            <table className="report-table">
              <tbody>
                <tr>
                  <th>Company</th>
                  <td>{settings.companyName || "—"}</td>
                  <th>Project</th>
                  <td>{settings.projectName || "—"}</td>
                </tr>

                <tr>
                  <th>Client</th>
                  <td>{clientName || "—"}</td>
                  <th>Prepared By</th>
                  <td>{preparedBy || "—"}</td>
                </tr>

                <tr>
                  <th>Generated Date</th>
                  <td>{getTodayISO()}</td>
                  <th>Diaries Included</th>
                  <td>{reportStats.diaryCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="report-section">
          <h2>
            <FileText size={18} /> 1. Report Summary
          </h2>

          <div className="settings-grid">
            <div className="software-card">
              <h3>
                <FileBarChart size={18} /> Diaries
              </h3>
              <p className="software-title">{reportStats.diaryCount}</p>
            </div>

            <div className="software-card">
              <h3>
                <Users size={18} /> Supervisors
              </h3>
              <p className="software-title">{reportStats.supervisorCount}</p>
            </div>

            <div className="software-card">
              <h3>
                <CheckCircle2 size={18} /> Tasks
              </h3>
              <p className="software-title">{reportStats.totalTasks}</p>
            </div>

            <div className="software-card">
              <h3>
                <AlertTriangle size={18} /> Issues
              </h3>
              <p className="software-title">{reportStats.totalIssues}</p>
            </div>
          </div>

          <table className="report-table" style={{ marginTop: 16 }}>
            <tbody>
              <tr>
                <th>Total Manpower Hours</th>
                <td>{reportStats.totalHours.toFixed(2)}</td>
                <th>Total Material Entries</th>
                <td>{reportStats.totalMaterials}</td>
              </tr>

              <tr>
                <th>Total Plant / Equipment Entries</th>
                <td>{reportStats.totalPlant}</td>
                <th>Report Period</th>
                <td>
                  {startDate} to {endDate}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>
            <FolderOpen size={18} /> 2. Areas Covered
          </h2>

          {groupedByArea.length === 0 ? (
            <p className="software-subtitle">
              No diaries found for this period yet.
            </p>
          ) : (
            groupedByArea.map((group) => (
              <div key={group.area} className="report-area-card">
                <div className="report-area-title">{group.area}</div>

                {group.diaries.map((diary) => (
                  <div
                    key={diary.diaryId || diary.id}
                    style={{
                      borderTop: "1px solid #e2e8f0",
                      paddingTop: 10,
                      marginTop: 10,
                    }}
                  >
                    <strong>
                      {safeText(diary.date)} — {getWbsText(diary)}
                    </strong>

                    <p className="report-muted" style={{ margin: "4px 0" }}>
                      Supervisor: {safeText(diary.supervisorName)}
                      {cleanNone(diary.selectedSubArea)
                        ? ` | Sub-area: ${diary.selectedSubArea}`
                        : ""}
                    </p>

                    <ul className="report-list">
                      {(diary.tasks || []).length > 0 ? (
                        diary.tasks?.map((task, index) => (
                          <li key={index}>{task}</li>
                        ))
                      ) : (
                        <li>No tasks recorded.</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="report-section report-page-break">
          <h2>
            <Users size={18} /> 3. Manpower Summary
          </h2>

          <table className="report-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Total Number</th>
                <th>Total Hours</th>
              </tr>
            </thead>

            <tbody>
              {manpowerSummary.length > 0 ? (
                manpowerSummary.map((row) => (
                  <tr key={row.role}>
                    <td>{row.role}</td>
                    <td>{row.number}</td>
                    <td>{row.hours.toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>No manpower captured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>
            <Boxes size={18} /> 4. Materials Used
          </h2>

          <table className="report-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Total Quantity</th>
                <th>Unit</th>
              </tr>
            </thead>

            <tbody>
              {materialSummary.length > 0 ? (
                materialSummary.map((row) => (
                  <tr key={`${row.description}_${row.uom}`}>
                    <td>{row.description}</td>
                    <td>{row.qty}</td>
                    <td>{row.uom || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>No materials captured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>
            <Wrench size={18} /> 5. Plant / Equipment Used
          </h2>

          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Area</th>
                <th>Description</th>
                <th>Number / ID</th>
              </tr>
            </thead>

            <tbody>
              {plantRows.length > 0 ? (
                plantRows.map((plant) => (
                  <tr key={plant.id}>
                    <td>{safeText(plant.date)}</td>
                    <td>{safeText(plant.area)}</td>
                    <td>{safeText(plant.description)}</td>
                    <td>{safeText(plant.number)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No plant/equipment captured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>
            <AlertTriangle size={18} /> 6. Issues / Delays
          </h2>

          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Area</th>
                <th>WBS</th>
                <th>Supervisor</th>
                <th>Issue / Delay</th>
              </tr>
            </thead>

            <tbody>
              {issueRows.length > 0 ? (
                issueRows.map((diary) => (
                  <tr key={`${diary.diaryId || diary.id}_issue`}>
                    <td>{safeText(diary.date)}</td>
                    <td>{safeText(diary.selectedArea)}</td>
                    <td>{getWbsText(diary)}</td>
                    <td>{safeText(diary.supervisorName)}</td>
                    <td>{safeText(diary.issues)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No issues or delays captured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>7. Custom Fields</h2>

          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supervisor</th>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>

            <tbody>
              {allCustomFieldRows.length > 0 ? (
                allCustomFieldRows.map((row, index) => (
                  <tr key={`${row.diaryId}_${row.label}_${index}`}>
                    <td>{safeText(row.date)}</td>
                    <td>{safeText(row.supervisor)}</td>
                    <td>{safeText(row.label)}</td>
                    <td>{safeText(row.value)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No custom fields captured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>8. Included Diaries</h2>

          <table className="report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supervisor</th>
                <th>Area</th>
                <th>WBS</th>
                <th>PDF</th>
              </tr>
            </thead>

            <tbody>
              {diaries.length > 0 ? (
                diaries.map((diary) => (
                  <tr key={diary.diaryId || diary.id}>
                    <td>{safeText(diary.date)}</td>
                    <td>{safeText(diary.supervisorName)}</td>
                    <td>{safeText(diary.selectedArea)}</td>
                    <td>{getWbsText(diary)}</td>
                    <td>
                      {diary.pdfUrl ? (
                        <a
                          href={diary.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open PDF
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No diaries included.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="report-section">
          <h2>9. Sign-off</h2>

          <table className="report-table">
            <tbody>
              <tr>
                <th>Prepared By</th>
                <td>{preparedBy || "—"}</td>
                <th>Date</th>
                <td>{getTodayISO()}</td>
              </tr>

              <tr>
                <th>Reviewed By</th>
                <td style={{ height: 50 }}></td>
                <th>Client Representative</th>
                <td style={{ height: 50 }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}