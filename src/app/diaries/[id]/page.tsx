"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { DiaryRecord } from "@/lib/types";

type MaterialItem = {
  uom?: string;
  description?: string;
  specification?: string;
  qty?: string | number;
};

type ManpowerItem = {
  role?: string;
  number?: string | number;
  start?: string;
  finish?: string;
  lunch?: string;
  hours?: string | number;
};

type PlantEquipmentItem = {
  description?: string;
  number?: string | number;
};

type ProgressPhotoItem = {
  index?: number;
  url?: string;
  path?: string;
  width?: number;
  height?: number;
};

type CustomFieldItem = {
  id?: string;
  label?: string;
  type?: string;
  required?: boolean;
  value?: string;
};

type DiaryWithExtras = DiaryRecord & {
  pdfUrl?: string;
  pdfLink?: string;
  downloadUrl?: string;
  fileUrl?: string;
  pdfFileName?: string;
  companyName?: string;
  project?: string;
  selectedArea?: string;
  selectedSubArea?: string;
  wbsText?: string;
  wbsMain?: string;
  wbsSub?: string;
  supervisorName?: string;
  date?: string;
  issues?: string;
  tasks?: string[];
  materials?: unknown[];
  manpower?: unknown[];
  plantEquipment?: unknown[];
  customFields?: unknown[];
  progressPhotos?: unknown[];
  createdAt?: unknown;
  submittedAtISO?: string;
  totalManpowerHours?: number | string;
  taskCount?: number;
  materialCount?: number;
  plantEquipmentCount?: number;
  progressPhotoCount?: number;
};

function getPdfUrl(diary: DiaryWithExtras) {
  return diary.pdfUrl || diary.pdfLink || diary.downloadUrl || diary.fileUrl || "";
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "-";
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

function formatDateTime(value?: string) {
  if (!value) return "-";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asMaterial(item: unknown): MaterialItem | null {
  if (typeof item === "object" && item !== null) return item as MaterialItem;
  if (typeof item === "string" && item.trim()) return { description: item };
  return null;
}

function asManpower(item: unknown): ManpowerItem | null {
  if (typeof item === "object" && item !== null) return item as ManpowerItem;
  return null;
}

function asPlantEquipment(item: unknown): PlantEquipmentItem | null {
  if (typeof item === "object" && item !== null) return item as PlantEquipmentItem;
  if (typeof item === "string" && item.trim()) return { description: item };
  return null;
}

function asProgressPhoto(item: unknown): ProgressPhotoItem | null {
  if (typeof item === "object" && item !== null) return item as ProgressPhotoItem;
  return null;
}

function asCustomField(item: unknown): CustomFieldItem | null {
  if (typeof item === "object" && item !== null) return item as CustomFieldItem;
  return null;
}

function FieldCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value?: string | number;
  tone?: "default" | "gold" | "green" | "red";
}) {
  return (
    <div className={`detail-field-card ${tone}`}>
      <p>{label}</p>
      <strong>{cleanText(value)}</strong>
    </div>
  );
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return <div className="detail-empty-block">{children}</div>;
}

function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="detail-section-header">
      <div>
        <p>{kicker}</p>
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

function renderStringList(values?: string[]) {
  const items = (values || []).map((x) => String(x || "").trim()).filter(Boolean);

  if (items.length === 0) {
    return <EmptyBlock>No tasks were recorded for this diary.</EmptyBlock>;
  }

  return (
    <div className="task-list-pro">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="task-row-pro">
          <span>{index + 1}</span>
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}

function renderManpower(values?: unknown[]) {
  const items = (values || []).map(asManpower).filter(Boolean) as ManpowerItem[];

  const visibleItems = items.filter((item) => {
    return (
      cleanText(item.role) !== "-" ||
      cleanText(item.number) !== "-" ||
      cleanText(item.start) !== "-" ||
      cleanText(item.finish) !== "-" ||
      cleanText(item.hours) !== "-"
    );
  });

  if (visibleItems.length === 0) {
    return <EmptyBlock>No manpower breakdown was recorded.</EmptyBlock>;
  }

  return (
    <div className="detail-table-scroll">
      <table className="detail-table manpower-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Resource</th>
            <th>Number</th>
            <th>Start</th>
            <th>Finish</th>
            <th>Lunch</th>
            <th>Hours</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, index) => (
            <tr key={`manpower-${index}`}>
              <td>{index + 1}</td>
              <td>{cleanText(item.role)}</td>
              <td>{cleanText(item.number)}</td>
              <td>{cleanText(item.start)}</td>
              <td>{cleanText(item.finish)}</td>
              <td>{cleanText(item.lunch)}</td>
              <td>{cleanText(item.hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMaterials(values?: unknown[]) {
  const items = (values || []).map(asMaterial).filter(Boolean) as MaterialItem[];

  const visibleItems = items.filter((item) => {
    return (
      cleanText(item.description) !== "-" ||
      cleanText(item.specification) !== "-" ||
      cleanText(item.qty) !== "-" ||
      cleanText(item.uom) !== "-"
    );
  });

  if (visibleItems.length === 0) {
    return <EmptyBlock>No materials were logged for this diary.</EmptyBlock>;
  }

  return (
    <div className="detail-table-scroll">
      <table className="detail-table materials-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Specification / Size</th>
            <th>Qty</th>
            <th>UOM</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, index) => (
            <tr key={`material-${index}`}>
              <td>{index + 1}</td>
              <td>{cleanText(item.description)}</td>
              <td>{cleanText(item.specification)}</td>
              <td>{cleanText(item.qty)}</td>
              <td>{cleanText(item.uom)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderPlantEquipment(values?: unknown[]) {
  const items = (values || []).map(asPlantEquipment).filter(Boolean) as PlantEquipmentItem[];

  const visibleItems = items.filter((item) => {
    return cleanText(item.description) !== "-" || cleanText(item.number) !== "-";
  });

  if (visibleItems.length === 0) {
    return <EmptyBlock>No plant or equipment was recorded.</EmptyBlock>;
  }

  return (
    <div className="detail-table-scroll">
      <table className="detail-table plant-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Number / ID</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, index) => (
            <tr key={`plant-${index}`}>
              <td>{index + 1}</td>
              <td>{cleanText(item.description)}</td>
              <td>{cleanText(item.number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCustomFields(values?: unknown[]) {
  const items = (values || []).map(asCustomField).filter(Boolean) as CustomFieldItem[];

  const visibleItems = items.filter((item) => {
    return cleanText(item.label) !== "-" || cleanText(item.value) !== "-";
  });

  if (visibleItems.length === 0) {
    return <EmptyBlock>No additional company fields were captured.</EmptyBlock>;
  }

  return (
    <div className="custom-field-grid">
      {visibleItems.map((item, index) => (
        <div key={item.id || `custom-${index}`} className="custom-field-card">
          <p>
            {cleanText(item.label)}
            {item.required ? <span> Required</span> : null}
          </p>
          <strong>{cleanText(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function renderProgressPhotos(values?: unknown[]) {
  const items = (values || []).map(asProgressPhoto).filter(Boolean) as ProgressPhotoItem[];
  const visibleItems = items.filter((item) => item.url);

  if (visibleItems.length === 0) {
    return <EmptyBlock>No progress photos were attached.</EmptyBlock>;
  }

  return (
    <div className="photo-grid-pro">
      {visibleItems.map((photo, index) => (
        <a
          key={photo.path || photo.url || `photo-${index}`}
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          className="photo-card-pro"
        >
          <img src={photo.url} alt={`Progress photo ${index + 1}`} />
          <div>
            <strong>Progress Photo {photo.index || index + 1}</strong>
            <span>Open full image</span>
          </div>
        </a>
      ))}
    </div>
  );
}

export default function DiaryDetailPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();

  const id = typeof params?.id === "string" ? params.id : "";

  const [diary, setDiary] = useState<DiaryWithExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthChecked(true);

      if (!user) {
        setDiary(null);
        setLoading(false);
        router.push("/auth");
        return;
      }

      if (!id) {
        setDiary(null);
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setNotFound(false);

        // IMPORTANT SECURITY FIX:
        // This page must only read the diary from the logged-in company workspace.
        // Do not use doc(db, "diaries", id), because that can leak another company's diary.
        const diaryRef = doc(db, "companies", user.uid, "diaries", id);
        const snap = await getDoc(diaryRef);

        if (!snap.exists()) {
          setDiary(null);
          setNotFound(true);
          return;
        }

        const row = {
          id: snap.id,
          ...(snap.data() as Omit<DiaryRecord, "id">),
        } as DiaryWithExtras;

        setDiary(row);
      } catch (error) {
        console.error("Error loading company diary detail:", error);
        setDiary(null);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [id, router]);

  const pdfUrl = diary ? getPdfUrl(diary) : "";

  const wbsText = useMemo(() => {
    if (!diary) return "-";
    return diary.wbsText || [diary.wbsMain, diary.wbsSub].filter(Boolean).join(" - ") || "-";
  }, [diary]);

  const taskCount = useMemo(() => {
    return diary?.tasks?.filter(Boolean).length || 0;
  }, [diary]);

  const materialCount = useMemo(() => {
    return (diary?.materials || []).filter(Boolean).length;
  }, [diary]);

  const manpowerRows = useMemo(() => {
    return (diary?.manpower || []).filter(Boolean).length;
  }, [diary]);

  const hasIssues = Boolean((diary?.issues || "").trim());

  if (!authChecked || loading) {
    return (
      <div className="diary-detail-page">
        <div className="detail-loading-card">
          <div className="detail-loader-dot"></div>
          <h1>Loading diary...</h1>
          <p>Checking your company workspace and opening the diary securely.</p>
        </div>

        <style jsx global>{`
          .diary-detail-page {
            min-height: 60vh;
            display: grid;
            place-items: center;
          }

          .detail-loading-card {
            width: min(520px, 100%);
            text-align: center;
            padding: 34px;
            border-radius: 26px;
            border: 1px solid #dfe4dc;
            background: #ffffff;
            box-shadow: 0 20px 55px rgba(18, 26, 22, 0.1);
          }

          .detail-loader-dot {
            width: 16px;
            height: 16px;
            margin: 0 auto 14px;
            border-radius: 999px;
            background: #c7892a;
            box-shadow: 0 0 0 8px rgba(199, 137, 42, 0.14);
          }

          .detail-loading-card h1 {
            margin: 0;
            color: #0f1713;
            font-size: 24px;
            font-weight: 950;
            letter-spacing: -0.04em;
          }

          .detail-loading-card p {
            margin: 8px 0 0;
            color: #66726a;
            font-size: 13px;
            line-height: 1.6;
          }
        `}</style>
      </div>
    );
  }

  if (notFound || !diary) {
    return (
      <div className="diary-detail-page">
        <div className="detail-not-found-card">
          <p className="detail-kicker">Diary not available</p>
          <h1>Diary not found in your company workspace</h1>
          <p>
            This diary either does not exist, belongs to another company, or was removed.
            For security, SiteDiary only opens records inside the logged-in company account.
          </p>
          <Link href="/diaries" className="detail-main-btn">
            Back to Diaries
          </Link>
        </div>

        <style jsx global>{`
          .diary-detail-page {
            min-height: 60vh;
            display: grid;
            place-items: center;
          }

          .detail-not-found-card {
            width: min(650px, 100%);
            padding: 34px;
            border-radius: 28px;
            border: 1px solid #f4c7c3;
            background: linear-gradient(180deg, #ffffff, #fff8f7);
            box-shadow: 0 20px 55px rgba(18, 26, 22, 0.1);
          }

          .detail-kicker {
            margin: 0 0 8px;
            color: #b42318;
            font-size: 11px;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: 0.14em;
          }

          .detail-not-found-card h1 {
            margin: 0;
            color: #0f1713;
            font-size: 30px;
            line-height: 1.05;
            font-weight: 950;
            letter-spacing: -0.05em;
          }

          .detail-not-found-card p:not(.detail-kicker) {
            margin: 12px 0 0;
            color: #66726a;
            font-size: 14px;
            line-height: 1.75;
          }

          .detail-main-btn {
            margin-top: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            padding: 0 16px;
            border-radius: 12px;
            background: #1f2a24;
            color: #ffffff;
            font-size: 13px;
            font-weight: 950;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="diary-detail-page">
      <section className="detail-hero-pro">
        <div className="detail-hero-content">
          <p className="detail-kicker">Company Diary Record</p>
          <h1>Diary Detail</h1>
          <p>
            Secure company-specific record for {cleanText(diary.supervisorName)} on{" "}
            {formatDateLabel(diary.date)}.
          </p>

          <div className="detail-hero-meta">
            <span>{cleanText(diary.companyName)}</span>
            <span>{cleanText(diary.project)}</span>
            <span>{hasIssues ? "Issue logged" : "No issues"}</span>
          </div>
        </div>

        <div className="detail-hero-actions">
          <Link href="/diaries" className="detail-btn secondary">
            Back to Diaries
          </Link>

          {pdfUrl ? (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="detail-btn primary">
              Open PDF
            </a>
          ) : (
            <span className="detail-btn disabled">No PDF</span>
          )}
        </div>
      </section>

      <section className="detail-summary-grid">
        <div className="detail-summary-card">
          <p>Tasks</p>
          <strong>{taskCount}</strong>
          <span>Task lines recorded</span>
        </div>

        <div className="detail-summary-card">
          <p>Materials</p>
          <strong>{materialCount}</strong>
          <span>Material lines logged</span>
        </div>

        <div className="detail-summary-card">
          <p>Manpower</p>
          <strong>{manpowerRows}</strong>
          <span>Resource rows captured</span>
        </div>

        <div className={hasIssues ? "detail-summary-card danger" : "detail-summary-card green"}>
          <p>Issues</p>
          <strong>{hasIssues ? "Yes" : "No"}</strong>
          <span>{hasIssues ? "Delay/comment logged" : "No issue recorded"}</span>
        </div>
      </section>

      <section className="detail-card-pro">
        <SectionHeader
          kicker="Diary Information"
          title="General Details"
          subtitle="Main information captured from the supervisor submission."
        />

        <div className="detail-field-grid">
          <FieldCard label="Date" value={formatDateLabel(diary.date)} tone="gold" />
          <FieldCard label="Company" value={diary.companyName} />
          <FieldCard label="Project" value={diary.project} />
          <FieldCard label="Supervisor" value={diary.supervisorName} />
          <FieldCard label="Area" value={diary.selectedArea} />
          <FieldCard label="Sub Area" value={diary.selectedSubArea} />
          <FieldCard label="WBS" value={wbsText} />
          <FieldCard label="Submitted" value={formatDateTime(diary.submittedAtISO)} />
        </div>
      </section>

      <section className="detail-card-pro">
        <SectionHeader
          kicker="Work Done"
          title="Tasks Performed"
          subtitle="Reported work completed for the selected diary date."
        />

        {renderStringList(diary.tasks)}
      </section>

      <section className="detail-card-pro">
        <SectionHeader
          kicker="Labour"
          title="Manpower Breakdown"
          subtitle="Resource count, working time, lunch, and calculated hours."
        />

        {renderManpower(diary.manpower)}
      </section>

      <section className="detail-card-pro">
        <SectionHeader
          kicker="Materials"
          title="Materials Used"
          subtitle="Material descriptions, quantities, units, and specifications."
        />

        {renderMaterials(diary.materials)}
      </section>

      <section className="detail-card-pro">
        <SectionHeader
          kicker="Plant"
          title="Plant / Equipment Used"
          subtitle="Equipment, plant, tools, or assets recorded in the diary."
        />

        {renderPlantEquipment(diary.plantEquipment)}
      </section>

      <section className="detail-card-pro">
        <SectionHeader
          kicker="Company Fields"
          title="Additional Captured Fields"
          subtitle="Custom fields configured in Company Settings and completed on the app."
        />

        {renderCustomFields(diary.customFields)}
      </section>

      <section className="detail-card-pro">
        <SectionHeader
          kicker="Progress Evidence"
          title="Progress Photos"
          subtitle="Photos attached by the supervisor during diary submission."
        />

        {renderProgressPhotos(diary.progressPhotos)}
      </section>

      <section className={hasIssues ? "detail-card-pro issue-card" : "detail-card-pro clear-card"}>
        <SectionHeader
          kicker="Controls"
          title="Issues / Delays / Instructions"
          subtitle="Supervisor comments about blockers, delays, standing time, or instructions."
        />

        {hasIssues ? (
          <div className="issue-content-pro">
            <strong>Logged issue</strong>
            <p>{diary.issues}</p>
          </div>
        ) : (
          <div className="clear-content-pro">
            <strong>No issues logged</strong>
            <p>This diary did not include any delay, issue, standing time, or instruction note.</p>
          </div>
        )}
      </section>

      <style jsx global>{`
        .diary-detail-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .detail-hero-pro {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 22px;
          padding: 24px;
          border-radius: 24px;
          color: #ffffff;
          background:
            radial-gradient(circle at top right, rgba(199, 137, 42, 0.28), transparent 30%),
            linear-gradient(135deg, #1f2a24 0%, #2d3a32 60%, #3c3222 100%);
          box-shadow: 0 18px 45px rgba(18, 26, 22, 0.12);
          overflow: hidden;
          position: relative;
        }

        .detail-hero-pro::after {
          content: "";
          position: absolute;
          right: -80px;
          bottom: -95px;
          width: 260px;
          height: 260px;
          border-radius: 999px;
          border: 42px solid rgba(255, 255, 255, 0.055);
        }

        .detail-hero-content {
          position: relative;
          z-index: 1;
          min-width: 0;
        }

        .detail-kicker {
          margin: 0 0 8px;
          color: #f3d59d;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .detail-hero-content h1 {
          margin: 0;
          font-size: 34px;
          line-height: 1.02;
          letter-spacing: -0.055em;
          font-weight: 950;
        }

        .detail-hero-content p:not(.detail-kicker) {
          max-width: 780px;
          margin: 10px 0 0;
          color: rgba(255, 255, 255, 0.78);
          font-size: 14px;
          line-height: 1.65;
        }

        .detail-hero-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 15px;
        }

        .detail-hero-meta span {
          min-height: 30px;
          display: inline-flex;
          align-items: center;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 900;
        }

        .detail-hero-actions {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          justify-content: flex-end;
          min-width: 220px;
        }

        .detail-btn,
        .detail-main-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 0 14px;
          border-radius: 12px;
          font-size: 12.5px;
          font-weight: 950;
          white-space: nowrap;
        }

        .detail-btn.primary,
        .detail-main-btn {
          background: #c7892a;
          color: #ffffff;
          box-shadow: 0 10px 24px rgba(199, 137, 42, 0.22);
        }

        .detail-btn.secondary {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }

        .detail-btn.disabled {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.14);
          cursor: not-allowed;
        }

        .detail-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .detail-summary-card,
        .detail-field-card,
        .custom-field-card {
          position: relative;
          overflow: hidden;
          border: 1px solid #dfe4dc;
          background: linear-gradient(180deg, #ffffff, #fafbf8);
          box-shadow: 0 1px 4px rgba(18, 26, 22, 0.06);
        }

        .detail-summary-card {
          min-height: 112px;
          border-radius: 18px;
          padding: 17px;
        }

        .detail-summary-card::before,
        .detail-field-card::before {
          content: "";
          position: absolute;
          left: 0;
          top: 16px;
          bottom: 16px;
          width: 4px;
          border-radius: 999px;
          background: #c7892a;
        }

        .detail-summary-card.danger::before,
        .detail-field-card.red::before {
          background: #b42318;
        }

        .detail-summary-card.green::before,
        .detail-field-card.green::before {
          background: #256b45;
        }

        .detail-field-card.gold::before {
          background: #c7892a;
        }

        .detail-summary-card p,
        .detail-field-card p,
        .custom-field-card p {
          margin: 0;
          color: #66726a;
          font-size: 11.5px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .detail-summary-card strong {
          display: block;
          margin-top: 8px;
          color: #0f1713;
          font-size: 30px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -0.04em;
        }

        .detail-summary-card span {
          display: block;
          margin-top: 8px;
          color: #8a948d;
          font-size: 11.5px;
          line-height: 1.45;
        }

        .detail-card-pro {
          padding: 18px;
          border-radius: 22px;
          border: 1px solid #dfe4dc;
          background: #ffffff;
          box-shadow: 0 1px 4px rgba(18, 26, 22, 0.06);
        }

        .detail-section-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
        }

        .detail-section-header p {
          margin: 0 0 5px;
          color: #80520f;
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.13em;
        }

        .detail-section-header h2 {
          margin: 0;
          color: #0f1713;
          font-size: 20px;
          font-weight: 950;
          letter-spacing: -0.035em;
        }

        .detail-section-header span {
          display: block;
          margin-top: 5px;
          color: #66726a;
          font-size: 12.5px;
          line-height: 1.55;
        }

        .detail-field-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .detail-field-card {
          min-height: 92px;
          border-radius: 16px;
          padding: 15px 15px 15px 17px;
        }

        .detail-field-card strong {
          display: block;
          margin-top: 9px;
          color: #0f1713;
          font-size: 14px;
          line-height: 1.45;
          font-weight: 950;
          word-break: break-word;
        }

        .task-list-pro {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .task-row-pro {
          display: grid;
          grid-template-columns: 36px 1fr;
          gap: 10px;
          align-items: start;
          padding: 12px;
          border-radius: 15px;
          background: #fafbf8;
          border: 1px solid #edf1eb;
        }

        .task-row-pro span {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: #1f2a24;
          color: #ffffff;
          font-size: 11px;
          font-weight: 950;
        }

        .task-row-pro p {
          margin: 3px 0 0;
          color: #17201b;
          font-size: 13.5px;
          line-height: 1.55;
        }

        .detail-table-scroll {
          width: 100%;
          overflow-x: auto;
        }

        .detail-table {
          width: 100%;
          min-width: 760px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12.5px;
          overflow: hidden;
          border: 1px solid #d8ded5;
          border-radius: 16px;
        }

        .detail-table th {
          height: 38px;
          padding: 0 12px;
          background: #1f2a24;
          color: #ffffff;
          font-size: 11px;
          font-weight: 950;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
        }

        .detail-table td {
          min-height: 38px;
          padding: 11px 12px;
          border-top: 1px solid #d8ded5;
          background: #ffffff;
          color: #17201b;
          vertical-align: top;
          line-height: 1.45;
        }

        .detail-table tr:nth-child(even) td {
          background: #fcfdf9;
        }

        .detail-empty-block {
          padding: 18px;
          border-radius: 16px;
          border: 1px dashed #cbd3c9;
          background: #fafbf8;
          color: #66726a;
          font-size: 13px;
          font-weight: 800;
        }

        .custom-field-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .custom-field-card {
          min-height: 92px;
          padding: 15px;
          border-radius: 16px;
        }

        .custom-field-card p span {
          margin-left: 7px;
          padding: 3px 7px;
          border-radius: 999px;
          background: #fff4df;
          color: #80520f;
          font-size: 9.5px;
          letter-spacing: 0;
        }

        .custom-field-card strong {
          display: block;
          margin-top: 9px;
          color: #0f1713;
          font-size: 14px;
          line-height: 1.45;
          font-weight: 950;
          word-break: break-word;
        }

        .photo-grid-pro {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .photo-card-pro {
          display: block;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid #dfe4dc;
          background: #ffffff;
          box-shadow: 0 1px 4px rgba(18, 26, 22, 0.06);
        }

        .photo-card-pro img {
          width: 100%;
          height: 180px;
          object-fit: cover;
          display: block;
          background: #eef1ec;
        }

        .photo-card-pro div {
          padding: 12px;
        }

        .photo-card-pro strong {
          display: block;
          color: #0f1713;
          font-size: 13px;
          font-weight: 950;
        }

        .photo-card-pro span {
          display: block;
          margin-top: 4px;
          color: #66726a;
          font-size: 12px;
          font-weight: 800;
        }

        .issue-card {
          border-color: #f4c7c3;
          background: linear-gradient(180deg, #ffffff, #fffafa);
        }

        .clear-card {
          border-color: #c9e8d4;
          background: linear-gradient(180deg, #ffffff, #fbfffc);
        }

        .issue-content-pro,
        .clear-content-pro {
          padding: 16px;
          border-radius: 16px;
        }

        .issue-content-pro {
          border: 1px solid #f4c7c3;
          background: #fff1ef;
          color: #7f1d1d;
        }

        .clear-content-pro {
          border: 1px solid #c9e8d4;
          background: #eaf6ef;
          color: #14532d;
        }

        .issue-content-pro strong,
        .clear-content-pro strong {
          display: block;
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .issue-content-pro p,
        .clear-content-pro p {
          margin: 7px 0 0;
          font-size: 13.5px;
          line-height: 1.7;
        }

        @media (max-width: 1100px) {
          .detail-summary-grid,
          .detail-field-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .custom-field-grid,
          .photo-grid-pro {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .detail-hero-pro {
            flex-direction: column;
          }

          .detail-hero-actions {
            justify-content: flex-start;
            min-width: 0;
          }

          .detail-summary-grid,
          .detail-field-grid,
          .custom-field-grid,
          .photo-grid-pro {
            grid-template-columns: 1fr;
          }

          .detail-hero-content h1 {
            font-size: 28px;
          }

          .detail-card-pro {
            padding: 14px;
            border-radius: 18px;
          }
        }
      `}</style>
    </div>
  );
}
