import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { notFound } from "next/navigation";
import { db } from "@/lib/firebase";
import { DiaryRecord } from "@/lib/types";

type DiaryPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type MaterialItem = {
  uom?: string;
  description?: string;
  specification?: string;
  qty?: string | number;
};

type DiaryWithExtras = DiaryRecord & {
  pdfUrl?: string;
  pdfLink?: string;
  downloadUrl?: string;
  fileUrl?: string;
  materials?: unknown[];
};

function getPdfUrl(diary: DiaryWithExtras) {
  return diary.pdfUrl || diary.pdfLink || diary.downloadUrl || diary.fileUrl || "";
}

function Field({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="software-card p-4">
      <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-[15px] font-semibold text-slate-900">
        {value?.trim() || "-"}
      </p>
    </div>
  );
}

function renderStringList(values?: string[]) {
  const items = (values || []).filter(Boolean);

  if (items.length === 0) {
    return <p className="text-slate-500">-</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="rounded-2xl bg-slate-50 px-4 py-3 text-[14px] text-slate-800"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function renderMaterials(values?: unknown[]) {
  const items = (values || []).filter(Boolean);

  if (items.length === 0) {
    return <p className="text-slate-500">-</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] rounded-3xl bg-slate-50 p-3">
        <div className="grid grid-cols-[120px_1.5fr_1.5fr_110px_90px] gap-4 rounded-2xl bg-white/80 px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Material
          </p>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Description
          </p>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Specification
          </p>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
            Qty
          </p>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
            UOM
          </p>
        </div>

        <div className="mt-3 space-y-2">
          {items.map((item, index) => {
            if (typeof item === "string") {
              return (
                <div
                  key={`material-string-${index}`}
                  className="grid grid-cols-[120px_1.5fr_1.5fr_110px_90px] gap-4 rounded-2xl bg-white px-4 py-3"
                >
                  <p className="text-[14px] font-bold text-slate-900">
                    Material {index + 1}
                  </p>
                  <p className="text-[14px] text-slate-800 break-words">{item}</p>
                  <p className="text-[14px] text-slate-500">-</p>
                  <p className="text-[14px] text-slate-500">-</p>
                  <p className="text-[14px] text-slate-500">-</p>
                </div>
              );
            }

            if (typeof item === "object" && item !== null) {
              const material = item as MaterialItem;

              return (
                <div
                  key={`material-object-${index}`}
                  className="grid grid-cols-[120px_1.5fr_1.5fr_110px_90px] gap-4 rounded-2xl bg-white px-4 py-3"
                >
                  <p className="text-[14px] font-bold text-slate-900">
                    Material {index + 1}
                  </p>
                  <p className="text-[14px] text-slate-800 break-words">
                    {material.description || "-"}
                  </p>
                  <p className="text-[14px] text-slate-800 break-words">
                    {material.specification || "-"}
                  </p>
                  <p className="text-[14px] text-slate-800">
                    {material.qty ?? "-"}
                  </p>
                  <p className="text-[14px] text-slate-800">
                    {material.uom || "-"}
                  </p>
                </div>
              );
            }

            return (
              <div
                key={`material-fallback-${index}`}
                className="grid grid-cols-[120px_1.5fr_1.5fr_110px_90px] gap-4 rounded-2xl bg-white px-4 py-3"
              >
                <p className="text-[14px] font-bold text-slate-900">
                  Material {index + 1}
                </p>
                <p className="text-[14px] text-slate-800 break-words">
                  {String(item)}
                </p>
                <p className="text-[14px] text-slate-500">-</p>
                <p className="text-[14px] text-slate-500">-</p>
                <p className="text-[14px] text-slate-500">-</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default async function DiaryDetailPage({ params }: DiaryPageProps) {
  const { id } = await params;

  const ref = doc(db, "diaries", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    notFound();
  }

  const diary = {
    id: snap.id,
    ...(snap.data() as Omit<DiaryRecord, "id">),
  } as DiaryWithExtras;

  const pdfUrl = getPdfUrl(diary);

  return (
    <div className="space-y-6">
      <div className="section-header">
        <div>
          <h1 className="software-title">Diary Detail</h1>
          <p className="software-subtitle">
            View the full submitted supervisor diary record
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/diaries" className="soft-button soft-button-secondary">
            Back to Diaries
          </Link>

          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="soft-button soft-button-primary"
            >
              Open PDF
            </a>
          ) : (
            <span className="soft-button soft-button-secondary cursor-not-allowed opacity-60">
              No PDF
            </span>
          )}
        </div>
      </div>

      <div className="info-grid">
        <Field label="Date" value={diary.date} />
        <Field label="Supervisor" value={diary.supervisorName} />
        <Field label="Area" value={diary.selectedArea} />
        <Field label="Sub Area" value={diary.selectedSubArea} />
        <Field label="WBS Main" value={diary.wbsMain} />
        <Field label="WBS Sub" value={diary.wbsSub} />
      </div>

      <div className="software-card-strong p-6">
        <div className="section-header">
          <div>
            <h2 className="text-[20px] font-extrabold text-slate-900">Tasks</h2>
            <p className="software-subtitle !mt-1">
              Reported work completed on this diary
            </p>
          </div>
        </div>

        {renderStringList(diary.tasks)}
      </div>

      <div className="software-card-strong p-6">
        <div className="section-header">
          <div>
            <h2 className="text-[20px] font-extrabold text-slate-900">
              Materials
            </h2>
            <p className="software-subtitle !mt-1">
              Materials logged on this diary
            </p>
          </div>
        </div>

        {renderMaterials(diary.materials)}
      </div>

      <div className="software-card-strong p-6">
        <div className="section-header">
          <div>
            <h2 className="text-[20px] font-extrabold text-slate-900">
              Issues / Delays
            </h2>
            <p className="software-subtitle !mt-1">
              Supervisor comments on issues, delays, or constraints
            </p>
          </div>
        </div>

        {(diary.issues || "").trim() ? (
          <div className="rounded-2xl bg-red-50 px-4 py-4">
            <p className="text-[14px] leading-7 text-slate-800">
              {diary.issues}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50 px-4 py-4">
            <p className="text-[14px] font-semibold text-emerald-700">
              No issues were logged for this diary.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}