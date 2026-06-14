"use client";
import { PDFDocument } from "pdf-lib";
import html2canvas from "html2canvas";
import jsPDF from "jspdf"; 
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
  ClipboardList,
  Settings2,
  Eye,
  EyeOff,
  PenLine,
  ShieldCheck,
  FileSignature,
  BookOpen,
} from "lucide-react";

type DiaryTask = {
  cwp?: string;
  cwpNumber?: string;
  description?: string;
  task?: string;
  progress?: string;
};

type Diary = {
  diaryId?: string;
  id?: string;
  companyId?: string;
  companyName?: string;
  project?: string;
  date?: string;
  documentNumber?: string;
  supervisorName?: string;
  wbsMain?: string;
  wbsSub?: string;
  wbsText?: string;
  selectedArea?: string;
  selectedSubArea?: string;
  manpower?: any[];
  tasks?: Array<string | DiaryTask>;
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
  cwps?: string[];
};

type SavedReport = {
  reportId: string;
  reportType: string;
  startDate: string;
  endDate: string;
  clientName: string;
  preparedBy: string;
  selectedCwp: string;
  diaryIds: string[];
  stats: any;
  reportMeta: ReportMeta;
  sections: ReportSections;
  createdAt: any;
};

type ReportMeta = {
  reportTitle: string;
  reportNumber: string;
  revision: string;
  contractNumber: string;
  clientReference: string;
  preparedBy: string;
  reviewedBy: string;
  clientRepresentative: string;
  executiveSummary: string;
  scopeOfWork: string;
  progressNarrative: string;
  issuesNarrative: string;
  conclusion: string;
};

type ReportSections = {
  summary: boolean;
  cwpSummary: boolean;
  taskProgress: boolean;
  areasCovered: boolean;
  manpower: boolean;
  materials: boolean;
  plant: boolean;
  issues: boolean;
  customFields: boolean;
  rawDiaryAppendix: boolean;
  pdfRegister: boolean;
  signOff: boolean;
};

const ALL_CWPS = "__ALL_CWPS__";

const DEFAULT_SECTIONS: ReportSections = {
  summary: true,
  cwpSummary: true,
  taskProgress: true,
  areasCovered: true,
  manpower: true,
  materials: true,
  plant: true,
  issues: true,
  customFields: true,
  rawDiaryAppendix: true,
  pdfRegister: true,
  signOff: true,
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
  if (value === "__NONE__") return "—";
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

function getTaskCwp(task: string | DiaryTask) {
  if (typeof task === "string") return "";
  return cleanNone(task.cwp || task.cwpNumber || "");
}

function getTaskDescription(task: string | DiaryTask) {
  if (typeof task === "string") return task;
  return String(task.description || task.task || "").trim();
}

function getTaskProgress(task: string | DiaryTask) {
  if (typeof task === "string") return "";
  return String(task.progress || "").trim();
}

function diaryHasCwp(diary: Diary, selectedCwp: string) {
  if (!selectedCwp || selectedCwp === ALL_CWPS) return true;

  return (diary.tasks || []).some((task) => {
    return getTaskCwp(task).toLowerCase() === selectedCwp.toLowerCase();
  });
}

function getTasksForSelectedCwp(diary: Diary, selectedCwp: string) {
  const tasks = diary.tasks || [];

  if (!selectedCwp || selectedCwp === ALL_CWPS) return tasks;

  return tasks.filter(
    (task) => getTaskCwp(task).toLowerCase() === selectedCwp.toLowerCase()
  );
}

function normalizeCwps(raw: any): string[] {
  if (!Array.isArray(raw)) return [];

  const map = new Map<string, string>();

  raw.forEach((item) => {
    const value =
      typeof item === "string"
        ? item
        : item?.number || item?.cwp || item?.cwpNumber || item?.name || "";

    const clean = String(value || "").trim();
    if (!clean || clean === "__NONE__") return;

    map.set(clean.toLowerCase(), clean);
  });

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

function getDiaryCwps(diary: Diary) {
  return normalizeCwps((diary.tasks || []).map((task) => getTaskCwp(task)));
}

function formatReportType(type: string) {
  if (type === "daily") return "Daily Report";
  if (type === "weekly") return "Weekly Report";
  if (type === "monthly") return "Monthly Report";
  return "Custom Period Report";
}

function makeDefaultReportTitle(reportType: string, selectedCwp: string) {
  if (selectedCwp !== ALL_CWPS) return `CWP Progress Report - ${selectedCwp}`;
  return formatReportType(reportType);
}

function makeDefaultReportNumber(companyName?: string) {
  const prefix = String(companyName || "SD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();

  return `${prefix || "SD"}-RPT-${getTodayISO().replaceAll("-", "")}`;
}

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfMergeMessage, setPdfMergeMessage] = useState("");

  const [reportType, setReportType] = useState("daily");
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
  const [selectedCwp, setSelectedCwp] = useState(ALL_CWPS);
  const [clientName, setClientName] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [lastFetchMessage, setLastFetchMessage] = useState("");

  const [sections, setSections] = useState<ReportSections>(DEFAULT_SECTIONS);

  const [reportMeta, setReportMeta] = useState<ReportMeta>({
    reportTitle: "Daily Report",
    reportNumber: `SD-RPT-${getTodayISO().replaceAll("-", "")}`,
    revision: "Rev 0",
    contractNumber: "",
    clientReference: "",
    preparedBy: "",
    reviewedBy: "",
    clientRepresentative: "",
    executiveSummary:
      "This report summarises daily site diary records captured for the selected reporting period and CWP filter.",
    scopeOfWork:
      "The report covers recorded site activities, manpower, materials, plant/equipment, issues/delays, and supporting diary references for the selected period.",
    progressNarrative:
      "Progress has been summarised from the submitted diary tasks linked to the selected CWP and reporting period.",
    issuesNarrative:
      "Issues and delays are listed where they were captured in the submitted site diaries.",
    conclusion:
      "This report is submitted for client review and record purposes. Original diary PDFs are listed in the appendix and will be merged in the final PDF generation step.",
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setPreparedBy(currentUser.email || "");
      setReportMeta((prev) => ({
        ...prev,
        preparedBy: currentUser.email || "",
      }));

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
          const data = settingsSnap.data() as CompanySettings;
          setSettings(data);

          setReportMeta((prev) => ({
            ...prev,
            reportNumber: makeDefaultReportNumber(data.companyName),
          }));
        }

        const cwpRef = doc(
          db,
          "companies",
          activeCompanyId,
          "settings",
          "cwps"
        );

        const cwpSnap = await getDoc(cwpRef);

        if (cwpSnap.exists()) {
          const data = cwpSnap.data();

          setSettings((prev) => ({
            ...prev,
            cwps: normalizeCwps(data.list || data.cwps || []),
          }));
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

  useEffect(() => {
    setReportMeta((prev) => ({
      ...prev,
      reportTitle: makeDefaultReportTitle(reportType, selectedCwp),
    }));
  }, [reportType, selectedCwp]);

  const updateReportMeta = (key: keyof ReportMeta, value: string) => {
    setReportMeta((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (key === "preparedBy") {
      setPreparedBy(value);
    }
  };

  const toggleSection = (key: keyof ReportSections) => {
    setSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

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
        .filter((diary) => diaryHasCwp(diary, selectedCwp))
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

  const cwpOptions = useMemo(() => {
    const map = new Map<string, string>();

    normalizeCwps(settings.cwps || []).forEach((cwp) => {
      map.set(cwp.toLowerCase(), cwp);
    });

    diaries.forEach((diary) => {
      getDiaryCwps(diary).forEach((cwp) => {
        map.set(cwp.toLowerCase(), cwp);
      });
    });

    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [settings.cwps, diaries]);

  const reportStats = useMemo(() => {
    const supervisors = new Set<string>();
    const cwpSet = new Set<string>();
    const dates = new Set<string>();
    const areas = new Set<string>();
    const pdfs = new Set<string>();

    let totalHours = 0;
    let totalTasks = 0;
    let totalMaterials = 0;
    let totalPlant = 0;
    let totalIssues = 0;

    diaries.forEach((diary) => {
      if (diary.supervisorName) supervisors.add(diary.supervisorName);
      if (diary.date) dates.add(diary.date);
      if (cleanNone(diary.selectedArea)) areas.add(cleanNone(diary.selectedArea));
      if (diary.pdfUrl) pdfs.add(diary.pdfUrl);

      getDiaryCwps(diary).forEach((cwp) => cwpSet.add(cwp));

      if (diary.totalManpowerHours !== undefined) {
        totalHours += numberValue(diary.totalManpowerHours);
      } else {
        totalHours += (diary.manpower || []).reduce((sum, row) => {
          return sum + numberValue(row.hours);
        }, 0);
      }

      totalTasks += getTasksForSelectedCwp(diary, selectedCwp).length;

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
      cwpCount: cwpSet.size,
      activeDateCount: dates.size,
      areaCount: areas.size,
      pdfCount: pdfs.size,
      totalHours,
      totalTasks,
      totalMaterials,
      totalPlant,
      totalIssues,
    };
  }, [diaries, selectedCwp]);

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

  const cwpSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        cwp: string;
        diaryCount: number;
        taskCount: number;
        dates: Set<string>;
        supervisors: Set<string>;
      }
    >();

    diaries.forEach((diary) => {
      getTasksForSelectedCwp(diary, selectedCwp).forEach((task) => {
        const cwp = getTaskCwp(task) || "No CWP";
        const existing =
          map.get(cwp) ||
          {
            cwp,
            diaryCount: 0,
            taskCount: 0,
            dates: new Set<string>(),
            supervisors: new Set<string>(),
          };

        existing.taskCount += 1;
        if (diary.date) existing.dates.add(diary.date);
        if (diary.supervisorName) existing.supervisors.add(diary.supervisorName);

        map.set(cwp, existing);
      });
    });

    diaries.forEach((diary) => {
      const seen = new Set<string>();

      getTasksForSelectedCwp(diary, selectedCwp).forEach((task) => {
        const cwp = getTaskCwp(task) || "No CWP";
        if (seen.has(cwp)) return;

        seen.add(cwp);

        const existing = map.get(cwp);
        if (existing) existing.diaryCount += 1;
      });
    });

    return Array.from(map.values()).map((row) => ({
      cwp: row.cwp,
      diaryCount: row.diaryCount,
      taskCount: row.taskCount,
      dateCount: row.dates.size,
      supervisorCount: row.supervisors.size,
    }));
  }, [diaries, selectedCwp]);

  const taskRows = useMemo(() => {
    return diaries.flatMap((diary) =>
      getTasksForSelectedCwp(diary, selectedCwp).map((task, index) => ({
        id: `${diary.diaryId || diary.id}_task_${index}`,
        date: diary.date,
        documentNumber: diary.documentNumber,
        supervisor: diary.supervisorName,
        area: diary.selectedArea,
        subArea: diary.selectedSubArea,
        wbs: getWbsText(diary),
        cwp: getTaskCwp(task),
        description: getTaskDescription(task),
        progress: getTaskProgress(task),
      }))
    );
  }, [diaries, selectedCwp]);

  const manpowerSummary = useMemo(() => {
    const map = new Map<string, { role: string; number: number; hours: number }>();

    diaries.forEach((diary) => {
      (diary.manpower || []).forEach((row) => {
        const role =
          row.trade && row.trade !== "__NONE__"
            ? row.trade
            : row.role && row.role !== "__NONE__"
            ? row.role
            : "Unspecified Role";

        const existing = map.get(role) || {
          role,
          number: 0,
          hours: 0,
        };

        existing.number += 1;
        existing.hours += numberValue(row.hours);

        map.set(role, existing);
      });
    });

    return Array.from(map.values()).sort((a, b) => a.role.localeCompare(b.role));
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

    return Array.from(map.values()).sort((a, b) =>
      a.description.localeCompare(b.description)
    );
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

  const rawDiaryRows = useMemo(() => {
    return diaries.map((diary) => ({
      ...diary,
      matchingTasks: getTasksForSelectedCwp(diary, selectedCwp),
    }));
  }, [diaries, selectedCwp]);

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
        preparedBy: reportMeta.preparedBy || preparedBy,
        selectedCwp,
        diaryIds: diaries.map((d) => d.diaryId || d.id || "").filter(Boolean),
        stats: reportStats,
        reportMeta,
        sections,
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    link.remove();
    URL.revokeObjectURL(url);
  };

  const makeSafeFileName = (value: string) => {
    return value
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 90);
  };

  const generateMergedClientPdf = async () => {
    if (diaries.length === 0) {
      alert("Generate a report with diaries before creating the PDF.");
      return;
    }

    const reportElement = document.getElementById("compiled-report");

    if (!reportElement) {
      alert("Report preview not found.");
      return;
    }

    setGeneratingPdf(true);
    setPdfMergeMessage("Preparing report pages...");

    try {
      const reportPages = Array.from(
        reportElement.querySelectorAll(".report-page")
      ) as HTMLElement[];

      if (reportPages.length === 0) {
        alert("No report pages found.");
        return;
      }

      const reportPdf = new jsPDF("p", "mm", "a4");
      const pageWidth = reportPdf.internal.pageSize.getWidth();
      const pageHeight = reportPdf.internal.pageSize.getHeight();

      for (let i = 0; i < reportPages.length; i++) {
        setPdfMergeMessage(
          `Rendering report page ${i + 1} of ${reportPages.length}...`
        );

        const canvas = await html2canvas(reportPages[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (i > 0) reportPdf.addPage();

        if (imgHeight <= pageHeight) {
          reportPdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
        } else {
          let remainingHeight = imgHeight;
          let position = 0;

          reportPdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
          remainingHeight -= pageHeight;

          while (remainingHeight > 0) {
            position -= pageHeight;
            reportPdf.addPage();
            reportPdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
            remainingHeight -= pageHeight;
          }
        }
      }

      setPdfMergeMessage("Creating final client report...");
      const reportBytes = reportPdf.output("arraybuffer");

      const finalPdf = await PDFDocument.create();
      const compiledReportPdf = await PDFDocument.load(reportBytes);

      const compiledPages = await finalPdf.copyPages(
        compiledReportPdf,
        compiledReportPdf.getPageIndices()
      );

      compiledPages.forEach((page) => finalPdf.addPage(page));

      const diaryPdfs = diaries.filter((diary) => diary.pdfUrl);

      for (let i = 0; i < diaryPdfs.length; i++) {
        const diary = diaryPdfs[i];

        try {
          setPdfMergeMessage(
            `Adding diary PDF ${i + 1} of ${diaryPdfs.length}: ${
              diary.documentNumber || diary.date || "Diary"
            }`
          );

          const response = await fetch(diary.pdfUrl as string);

          if (!response.ok) {
            console.warn("Could not fetch diary PDF:", diary.pdfUrl);
            continue;
          }

          const diaryBytes = await response.arrayBuffer();
          const diaryPdf = await PDFDocument.load(diaryBytes);

          const diaryPages = await finalPdf.copyPages(
            diaryPdf,
            diaryPdf.getPageIndices()
          );

          diaryPages.forEach((page) => finalPdf.addPage(page));
        } catch (error) {
          console.warn("Skipping diary PDF because it could not be merged:", error);
        }
      }

      setPdfMergeMessage("Saving final PDF...");

      const finalBytes = await finalPdf.save();

      const filename =
        makeSafeFileName(
          `${reportMeta.reportNumber || "SiteDiary_Report"}_${
            selectedCwp === ALL_CWPS ? "All_CWPs" : selectedCwp
          }_${startDate}_to_${endDate}.pdf`
        ) || "SiteDiary_Client_Report.pdf";

      const finalArrayBuffer = finalBytes.buffer.slice(
        finalBytes.byteOffset,
        finalBytes.byteOffset + finalBytes.byteLength
      ) as ArrayBuffer;

      downloadBlob(
        new Blob([finalArrayBuffer], { type: "application/pdf" }),
        filename
      );

      setPdfMergeMessage("Final PDF generated successfully.");
    } catch (error) {
      console.error("Generate merged client PDF error:", error);
      alert(
        "Could not generate the merged PDF. Check that diary PDF URLs allow browser access."
      );
    } finally {
      setGeneratingPdf(false);
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
            padding: 0;
            margin: 0;
            background: white;
            box-shadow: none;
            border: none;
          }

          .no-print {
            display: none !important;
          }

          .report-page {
            page-break-after: always;
            min-height: 100vh;
            padding: 22mm 18mm;
            border: none !important;
            box-shadow: none !important;
          }

          .report-page:last-child {
            page-break-after: auto;
          }

          .report-section {
            break-inside: avoid;
          }

          .report-page-break {
            page-break-before: always;
          }

          .report-table tr {
            break-inside: avoid;
          }

          a {
            color: #111827;
            text-decoration: none;
          }
        }

        .report-builder-card {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          padding: 18px;
          background: #ffffff;
          margin-top: 16px;
        }

        .report-builder-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 900;
          color: #0f172a;
          margin: 0 0 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }        }

        .report-builder-note {
          color: #64748b;
          font-size: 13px;
          margin: 0 0 14px;
        }

        .report-textarea {
          min-height: 92px;
          resize: vertical;
          line-height: 1.5;
        }

        .section-toggle-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
          gap: 10px;
        }

        .section-toggle-button {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 11px 12px;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 850;
          color: #0f172a;
        }

        .section-toggle-button.off {
          background: #f8fafc;
          color: #94a3b8;
        }

        .report-document {
          background: #f1f5f9;
          padding: 16px;
        }

        .report-page {
          background: #ffffff;
          border: 1px solid #dbe3ef;
          border-radius: 18px;
          padding: 28px;
          margin-bottom: 18px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
        }

        .report-cover {
          min-height: 720px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background:
            linear-gradient(135deg, rgba(15, 23, 42, 0.04), rgba(37, 99, 235, 0.04)),
            #ffffff;
        }

        .report-cover-top {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
        }

        .report-logo {
          width: 150px;
          max-height: 86px;
          object-fit: contain;
        }

        .report-company-name {
          font-size: 15px;
          font-weight: 900;
          color: #0f172a;
          margin-top: 8px;
        }

        .report-title-big {
          font-size: 36px;
          line-height: 1.1;
          font-weight: 950;
          margin: 10px 0 12px;
          color: #0f172a;
          max-width: 760px;
        }

        .report-kicker {
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 11px;
          font-weight: 900;
          color: #2563eb;
          margin: 0;
        }

        .report-muted {
          color: #64748b;
          font-size: 13px;
        }

        .report-strong {
          color: #0f172a;
          font-weight: 850;
        }

        .report-cover-band {
          border-radius: 18px;
          background: #0f172a;
          color: #ffffff;
          padding: 18px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 14px;
          margin-top: 28px;
        }

        .report-cover-band span {
          display: block;
          color: #cbd5e1;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 800;
        }

        .report-cover-band strong {
          display: block;
          margin-top: 4px;
          font-size: 15px;
          color: #ffffff;
        }

        .report-section {
          margin-top: 22px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
        }

        .report-section:first-child {
          margin-top: 0;
          padding-top: 0;
          border-top: none;
        }

        .report-section h2 {
          font-size: 18px;
          margin: 0 0 10px;
          color: #0f172a;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .report-section h3 {
          font-size: 14px;
          margin: 16px 0 8px;
          color: #0f172a;
        }

        .report-paragraph {
          color: #334155;
          font-size: 13px;
          line-height: 1.65;
          margin: 8px 0;
          white-space: pre-wrap;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
          overflow: hidden;
          border-radius: 12px;
        }

        .report-table th {
          text-align: left;
          background: #f1f5f9;
          color: #0f172a;
          font-weight: 850;
          padding: 9px;
          border: 1px solid #e2e8f0;
        }

        .report-table td {
          padding: 9px;
          border: 1px solid #e2e8f0;
          vertical-align: top;
          color: #334155;
        }

        .report-stat-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .report-stat-card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 14px;
          background: #ffffff;
        }

        .report-stat-card span {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #64748b;
          font-size: 12px;
          font-weight: 850;
        }

        .report-stat-card strong {
          display: block;
          margin-top: 8px;
          font-size: 26px;
          color: #0f172a;
          font-weight: 950;
        }

        .report-area-card,
        .report-raw-diary-card {
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
          color: #334155;
          font-size: 13px;
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

        .report-filter-note {
          margin-top: 10px;
          border-radius: 14px;
          padding: 12px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          color: #9a3412;
          font-size: 13px;
          font-weight: 750;
        }

        .report-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 4px 9px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 12px;
          font-weight: 850;
        }

        .report-footer-note {
          margin-top: 18px;
          color: #64748b;
          font-size: 11px;
          border-top: 1px solid #e2e8f0;
          padding-top: 10px;
        }

        .signature-box {
          height: 62px;
          background: #ffffff;
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
              Build a professional client-ready report from filtered site diaries,
              CWP progress, manpower, materials, issues, and original diary PDF references.
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
            onClick={generateMergedClientPdf}
            disabled={generatingPdf || diaries.length === 0}
            className="soft-button soft-button-primary"
          >
            {generatingPdf ? (
              <>
                <Loader2 className="animate-spin" size={17} />
                Generating PDF...
              </>
            ) : (
              <>
                <Printer size={17} />
                Generate Client PDF
              </>
            )}
          </button>
        </div>
      </section>

      <section className="software-card settings-card no-print">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">
              <CalendarDays size={20} /> Report Filters
            </h2>
            <p className="software-subtitle">
              Choose a reporting period and optionally filter by one CWP.
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
            <label className="settings-label">CWP Filter</label>
            <select
              className="soft-input"
              value={selectedCwp}
              onChange={(e) => setSelectedCwp(e.target.value)}
            >
              <option value={ALL_CWPS}>All CWPs</option>

              {cwpOptions.map((cwp) => (
                <option key={cwp} value={cwp}>
                  {cwp}
                </option>
              ))}
            </select>
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
              value={reportMeta.preparedBy}
              onChange={(e) => updateReportMeta("preparedBy", e.target.value)}
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
          <strong>CWP filter:</strong>{" "}
          {selectedCwp === ALL_CWPS ? "All CWPs" : selectedCwp}
          <br />
          <strong>Status:</strong>{" "}
          {lastFetchMessage || "No report generated yet."}
        </div>

        {pdfMergeMessage && (
          <div className="report-debug">
            <strong>PDF Generator:</strong> {pdfMergeMessage}
          </div>
        )}

        <div className="report-builder-card">
          <h2 className="report-builder-title">
            <PenLine size={18} /> Editable Client Report Details
          </h2>
          <p className="report-builder-note">
            These fields appear on the final report. Edit them before generating or saving.
          </p>

          <div className="settings-grid">
            <div className="settings-form-group">
              <label className="settings-label">Report Title</label>
              <input
                className="soft-input"
                value={reportMeta.reportTitle}
                onChange={(e) => updateReportMeta("reportTitle", e.target.value)}
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Report Number</label>
              <input
                className="soft-input"
                value={reportMeta.reportNumber}
                onChange={(e) => updateReportMeta("reportNumber", e.target.value)}
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Revision</label>
              <input
                className="soft-input"
                value={reportMeta.revision}
                onChange={(e) => updateReportMeta("revision", e.target.value)}
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Contract Number</label>
              <input
                className="soft-input"
                value={reportMeta.contractNumber}
                onChange={(e) => updateReportMeta("contractNumber", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Client Reference</label>
              <input
                className="soft-input"
                value={reportMeta.clientReference}
                onChange={(e) => updateReportMeta("clientReference", e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Reviewed By</label>
              <input
                className="soft-input"
                value={reportMeta.reviewedBy}
                onChange={(e) => updateReportMeta("reviewedBy", e.target.value)}
                placeholder="Reviewer name"
              />
            </div>

            <div className="settings-form-group">
              <label className="settings-label">Client Representative</label>
              <input
                className="soft-input"
                value={reportMeta.clientRepresentative}
                onChange={(e) =>
                  updateReportMeta("clientRepresentative", e.target.value)
                }
                placeholder="Client representative"
              />
            </div>
          </div>

          <div className="settings-form-group" style={{ marginTop: 14 }}>
            <label className="settings-label">Executive Summary</label>
            <textarea
              className="soft-input report-textarea"
              value={reportMeta.executiveSummary}
              onChange={(e) =>
                updateReportMeta("executiveSummary", e.target.value)
              }
            />
          </div>

          <div className="settings-form-group" style={{ marginTop: 14 }}>
            <label className="settings-label">Scope of Work / Report Scope</label>
            <textarea
              className="soft-input report-textarea"
              value={reportMeta.scopeOfWork}
              onChange={(e) => updateReportMeta("scopeOfWork", e.target.value)}
            />
          </div>

          <div className="settings-form-group" style={{ marginTop: 14 }}>
            <label className="settings-label">Progress Narrative</label>
            <textarea
              className="soft-input report-textarea"
              value={reportMeta.progressNarrative}
              onChange={(e) =>
                updateReportMeta("progressNarrative", e.target.value)
              }
            />
          </div>

          <div className="settings-form-group" style={{ marginTop: 14 }}>
            <label className="settings-label">Issues / Delays Narrative</label>
            <textarea
              className="soft-input report-textarea"
              value={reportMeta.issuesNarrative}
              onChange={(e) =>
                updateReportMeta("issuesNarrative", e.target.value)
              }
            />
          </div>

          <div className="settings-form-group" style={{ marginTop: 14 }}>
            <label className="settings-label">Conclusion / Submission Note</label>
            <textarea
              className="soft-input report-textarea"
              value={reportMeta.conclusion}
              onChange={(e) => updateReportMeta("conclusion", e.target.value)}
            />
          </div>
        </div>

        <div className="report-builder-card">
          <h2 className="report-builder-title">
            <Settings2 size={18} /> Report Sections
          </h2>
          <p className="report-builder-note">
            Turn sections on or off before generating the client PDF.
          </p>

          <div className="section-toggle-grid">
            {(Object.keys(sections) as Array<keyof ReportSections>).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSection(key)}
                className={`section-toggle-button ${sections[key] ? "" : "off"}`}
              >
                <span>
                  {key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (s) => s.toUpperCase())}
                </span>
                {sections[key] ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="compiled-report" className="report-document">
        <div className="report-page report-cover">
          <div>
            <div className="report-cover-top">
              <div>
                <p className="report-kicker">SiteDiary Client Report</p>

                <h1 className="report-title-big">
                  {reportMeta.reportTitle ||
                    makeDefaultReportTitle(reportType, selectedCwp)}
                </h1>

                <p className="report-muted">
                  Reporting Period:{" "}
                  <span className="report-strong">{startDate}</span> to{" "}
                  <span className="report-strong">{endDate}</span>
                </p>

                <p className="report-muted">
                  CWP Filter:{" "}
                  <span className="report-strong">
                    {selectedCwp === ALL_CWPS ? "All CWPs" : selectedCwp}
                  </span>
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

                <div className="report-company-name">
                  {settings.companyName || "Company"}
                </div>

                <p className="report-muted" style={{ marginTop: 6 }}>
                  {settings.projectName || "Project"}
                </p>
              </div>
            </div>

            <div className="report-cover-band">
              <div>
                <span>Report No.</span>
                <strong>{safeText(reportMeta.reportNumber)}</strong>
              </div>

              <div>
                <span>Revision</span>
                <strong>{safeText(reportMeta.revision)}</strong>
              </div>

              <div>
                <span>Client</span>
                <strong>{safeText(clientName)}</strong>
              </div>

              <div>
                <span>Generated</span>
                <strong>{getTodayISO()}</strong>
              </div>
            </div>

            <div className="report-section" style={{ marginTop: 30 }}>
              <h2>
                <FileText size={18} /> Document Control
              </h2>

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
                    <td>{reportMeta.preparedBy || "—"}</td>
                  </tr>

                  <tr>
                    <th>Contract Number</th>
                    <td>{safeText(reportMeta.contractNumber)}</td>
                    <th>Client Reference</th>
                    <td>{safeText(reportMeta.clientReference)}</td>
                  </tr>

                  <tr>
                    <th>Report Type</th>
                    <td>{formatReportType(reportType)}</td>
                    <th>CWP</th>
                    <td>{selectedCwp === ALL_CWPS ? "All CWPs" : selectedCwp}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-footer-note">
            This report was compiled from approved SiteDiary records for the selected
            company, date range, and CWP filter.
          </div>
        </div>

        <div className="report-page">
          <div className="report-section">
            <h2>
              <BookOpen size={18} /> Executive Summary
            </h2>
            <p className="report-paragraph">{reportMeta.executiveSummary}</p>
          </div>

          <div className="report-section">
            <h2>
              <ShieldCheck size={18} /> Scope of Report
            </h2>
            <p className="report-paragraph">{reportMeta.scopeOfWork}</p>
          </div>

          <div className="report-section">
            <h2>
              <CheckCircle2 size={18} /> Progress Narrative
            </h2>
            <p className="report-paragraph">{reportMeta.progressNarrative}</p>
          </div>

          <div className="report-section">
            <h2>
              <AlertTriangle size={18} /> Issues / Delays Narrative
            </h2>
            <p className="report-paragraph">{reportMeta.issuesNarrative}</p>
          </div>

          <div className="report-section">
            <h2>
              <FileSignature size={18} /> Submission Note
            </h2>
            <p className="report-paragraph">{reportMeta.conclusion}</p>
          </div>
        </div>

        {sections.summary && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <FileText size={18} /> 1. Report Summary
              </h2>

              <div className="report-stat-grid">
                <div className="report-stat-card">
                  <span>
                    <FileBarChart size={16} /> Diaries
                  </span>
                  <strong>{reportStats.diaryCount}</strong>
                </div>

                <div className="report-stat-card">
                  <span>
                    <ClipboardList size={16} /> CWPs
                  </span>
                  <strong>{reportStats.cwpCount}</strong>
                </div>

                <div className="report-stat-card">
                  <span>
                    <CheckCircle2 size={16} /> Matching Tasks
                  </span>
                  <strong>{reportStats.totalTasks}</strong>
                </div>

                <div className="report-stat-card">
                  <span>
                    <Users size={16} /> Manhours
                  </span>
                  <strong>{reportStats.totalHours.toFixed(1)}</strong>
                </div>

                <div className="report-stat-card">
                  <span>
                    <AlertTriangle size={16} /> Issues
                  </span>
                  <strong>{reportStats.totalIssues}</strong>
                </div>

                <div className="report-stat-card">
                  <span>
                    <FileText size={16} /> Diary PDFs
                  </span>
                  <strong>{reportStats.pdfCount}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {sections.cwpSummary && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <ClipboardList size={18} /> 2. CWP Summary
              </h2>

              <table className="report-table">
                <thead>
                  <tr>
                    <th>CWP</th>
                    <th>Diaries</th>
                    <th>Tasks</th>
                    <th>Active Dates</th>
                    <th>Supervisors</th>
                  </tr>
                </thead>

                <tbody>
                  {cwpSummary.length > 0 ? (
                    cwpSummary.map((row) => (
                      <tr key={row.cwp}>
                        <td>{row.cwp}</td>
                        <td>{row.diaryCount}</td>
                        <td>{row.taskCount}</td>
                        <td>{row.dateCount}</td>
                        <td>{row.supervisorCount}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>No CWP tasks found for this report.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sections.taskProgress && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <CheckCircle2 size={18} /> 3. Task Progress by CWP
              </h2>

              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>CWP</th>
                    <th>Task</th>
                    <th>Progress</th>
                    <th>Area</th>
                    <th>WBS</th>
                    <th>Supervisor</th>
                  </tr>
                </thead>

                <tbody>
                  {taskRows.length > 0 ? (
                    taskRows.map((task) => (
                      <tr key={task.id}>
                        <td>{safeText(task.date)}</td>
                        <td>{safeText(task.cwp)}</td>
                        <td>{safeText(task.description)}</td>
                        <td>{safeText(task.progress)}</td>
                        <td>
                          {safeText(task.area)}
                          {cleanNone(task.subArea) ? ` / ${task.subArea}` : ""}
                        </td>
                        <td>{safeText(task.wbs)}</td>
                        <td>{safeText(task.supervisor)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>No matching tasks found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sections.areasCovered && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <FolderOpen size={18} /> 4. Areas Covered
              </h2>

              {groupedByArea.length === 0 ? (
                <p className="report-paragraph">
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
                          {getTasksForSelectedCwp(diary, selectedCwp).length > 0 ? (
                            getTasksForSelectedCwp(diary, selectedCwp).map(
                              (task, index) => (
                                <li key={index}>
                                  <span className="report-pill">
                                    {safeText(getTaskCwp(task))}
                                  </span>{" "}
                                  {safeText(getTaskDescription(task))}
                                  {getTaskProgress(task)
                                    ? ` — ${getTaskProgress(task)}`
                                    : ""}
                                </li>
                              )
                            )
                          ) : (
                            <li>No matching tasks recorded.</li>
                          )}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {sections.manpower && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <Users size={18} /> 5. Manpower Summary
              </h2>

              <table className="report-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Total People Entries</th>
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
          </div>
        )}

        {sections.materials && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <Boxes size={18} /> 6. Materials Used
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
          </div>
        )}

        {sections.plant && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <Wrench size={18} /> 7. Plant / Equipment Used
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
          </div>
        )}

        {sections.issues && (
          <div className="report-page">
            <div className="report-section">
              <h2>
                <AlertTriangle size={18} /> 8. Issues / Delays
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
          </div>
        )}

        {sections.customFields && (
          <div className="report-page">
            <div className="report-section">
              <h2>9. Custom Fields</h2>

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
          </div>
        )}

        {sections.rawDiaryAppendix && (
          <div className="report-page">
            <div className="report-section">
              <h2>10. Raw Diary Appendix</h2>

              {rawDiaryRows.length > 0 ? (
                rawDiaryRows.map((diary) => (
                  <div
                    key={diary.diaryId || diary.id}
                    className="report-raw-diary-card"
                  >
                    <div className="report-area-title">
                      {safeText(diary.date)} —{" "}
                      {safeText(diary.documentNumber || diary.diaryId || diary.id)}
                    </div>

                    <table className="report-table">
                      <tbody>
                        <tr>
                          <th>Supervisor</th>
                          <td>{safeText(diary.supervisorName)}</td>
                          <th>Area</th>
                          <td>
                            {safeText(diary.selectedArea)}
                            {cleanNone(diary.selectedSubArea)
                              ? ` / ${diary.selectedSubArea}`
                              : ""}
                          </td>
                        </tr>

                        <tr>
                          <th>WBS</th>
                          <td>{getWbsText(diary)}</td>
                          <th>PDF</th>
                          <td>
                            {diary.pdfUrl ? (
                              <a
                                href={diary.pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open original diary PDF
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>

                        <tr>
                          <th>Issues / Delays</th>
                          <td colSpan={3}>{safeText(diary.issues)}</td>
                        </tr>
                      </tbody>
                    </table>

                    <h3>Matching Tasks</h3>

                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>CWP</th>
                          <th>Task</th>
                          <th>Progress</th>
                        </tr>
                      </thead>

                      <tbody>
                        {diary.matchingTasks.length > 0 ? (
                          diary.matchingTasks.map((task, index) => (
                            <tr key={index}>
                              <td>{safeText(getTaskCwp(task))}</td>
                              <td>{safeText(getTaskDescription(task))}</td>
                              <td>{safeText(getTaskProgress(task))}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3}>No matching tasks recorded.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ))
              ) : (
                <p className="report-paragraph">
                  No raw diaries available for this report.
                </p>
              )}
            </div>
          </div>
        )}

        {sections.pdfRegister && (
          <div className="report-page">
            <div className="report-section">
              <h2>11. Included Diary PDFs Register</h2>

              <p className="report-paragraph">
                The final PDF merge step will attach the original diary PDFs after
                this compiled report. This register shows which diary PDFs are included.
              </p>

              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Document No.</th>
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
                        <td>{safeText(diary.documentNumber)}</td>
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
                      <td colSpan={6}>No diaries included.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {sections.signOff && (
          <div className="report-page">
            <div className="report-section">
              <h2>12. Sign-off</h2>

              <table className="report-table">
                <tbody>
                  <tr>
                    <th>Prepared By</th>
                    <td>{reportMeta.preparedBy || "—"}</td>
                    <th>Date</th>
                    <td>{getTodayISO()}</td>
                  </tr>

                  <tr>
                    <th>Reviewed By</th>
                    <td>{reportMeta.reviewedBy || "—"}</td>
                    <th>Client Representative</th>
                    <td>{reportMeta.clientRepresentative || "—"}</td>
                  </tr>

                  <tr>
                    <th>Prepared By Signature</th>
                    <td className="signature-box"></td>
                    <th>Reviewed By Signature</th>
                    <td className="signature-box"></td>
                  </tr>

                  <tr>
                    <th>Client Signature</th>
                    <td className="signature-box"></td>
                    <th>Client Date</th>
                    <td className="signature-box"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}