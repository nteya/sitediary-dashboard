export type ManpowerRow = {
  role?: string;
  number?: string;
  start?: string;
  finish?: string;
  lunch?: string;
  hours?: string;
};

export type MaterialRow = {
  description?: string;
  qty?: string;
  uom?: string;
  specification?: string;
};

export type PlantRow = {
  description?: string;
  number?: string;
};

export type DiaryRecord = {
  id: string;
  date?: string;
  project?: string;
  supervisorName?: string;
  wbsMain?: string;
  wbsSub?: string;
  selectedArea?: string;
  selectedSubArea?: string;
  issues?: string;
  pdfUrl?: string;
  createdAt?: unknown;
  manpower?: ManpowerRow[];
  tasks?: string[];
  materials?: MaterialRow[];
  plantEquipment?: PlantRow[];
};