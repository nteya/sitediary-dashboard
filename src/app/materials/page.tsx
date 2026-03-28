"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
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

export default function MaterialsPage() {
  const [rows, setRows] = useState<MaterialView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "diaries"), orderBy("date", "desc"));
        const snap = await getDocs(q);

        const flat: MaterialView[] = [];

        snap.docs.forEach((doc) => {
          const diary: DiaryRecord = {
            id: doc.id,
            ...(doc.data() as Omit<DiaryRecord, "id">),
          };

          (diary.materials || []).forEach((m: MaterialRow, index: number) => {
            if (
              (m.description || "").trim() ||
              (m.qty || "").trim() ||
              (m.uom || "").trim() ||
              (m.specification || "").trim()
            ) {
              flat.push({
                id: `${doc.id}-${index}`,
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
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const totalEntries = useMemo(() => rows.length, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="software-title">Materials</h1>
        <p className="software-subtitle">
          {totalEntries} material entries captured from submitted diaries
        </p>
      </div>

      <div className="software-card-strong p-6 overflow-x-auto">
        {loading ? (
          <p>Loading materials...</p>
        ) : (
          <table className="software-table">
            <thead>
              <tr>
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
              {rows.map((m: MaterialView) => (
                <tr key={m.id}>
                  <td>{m.date || "-"}</td>
                  <td>{m.supervisorName || "-"}</td>
                  <td>{m.area || "-"}</td>
                  <td>{m.subArea || "-"}</td>
                  <td>{m.description || "-"}</td>
                  <td>{m.qty || "-"}</td>
                  <td>{m.uom || "-"}</td>
                  <td>{m.specification || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}