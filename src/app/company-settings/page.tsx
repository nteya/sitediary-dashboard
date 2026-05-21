"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  Save,
  Plus,
  Trash2,
  Loader2,
  Settings,
  Building2,
  MapPin,
  Boxes,
  Clock,
  Layers,
  KeyRound,
  RefreshCcw,
  ShieldCheck,
  ListChecks,
} from "lucide-react";

type WbsItem = {
  name: string;
  subOptions: string[];
};

type AreaItem = {
  name: string;
  subAreas: string[];
};

type MaterialItem = {
  name: string;
  unit: string;
  lowStockAlert: number;
};

type CustomFieldType = "text" | "number" | "dropdown" | "yesno" | "longtext";

type CustomField = {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  options: string[];
};

type CompanySettings = {
  companyName: string;
  projectName: string;
  logoUrl: string;
  areas: AreaItem[];
  wbs: WbsItem[];
  materials: MaterialItem[];
  customFields: CustomField[];
  shiftStart: string;
  shiftEnd: string;
  appAccessCode?: string;
  appAccessCodeActive?: boolean;
};

const defaultSettings: CompanySettings = {
  companyName: "SiteDiary",
  projectName: "Koketso Project",
  logoUrl: "",
  areas: [
    { name: "Plant", subAreas: ["Area 1", "Area 2"] },
    { name: "Workshop", subAreas: ["Bay 1", "Bay 2"] },
    { name: "Site", subAreas: [] },
  ],
  wbs: [
    {
      name: "Electrical",
      subOptions: ["Equipment", "Racking", "Cabling", "Termination"],
    },
    {
      name: "Instrumentation",
      subOptions: [
        "Equipment",
        "Racking",
        "Cabling",
        "Instrumentation",
        "Termination",
      ],
    },
    {
      name: "Scaffolding",
      subOptions: ["Erection", "Dismantling"],
    },
  ],
  materials: [
    { name: "Cable", unit: "m", lowStockAlert: 50 },
    { name: "Unistrut", unit: "lengths", lowStockAlert: 10 },
  ],
  customFields: [
    {
      id: "weather",
      label: "Weather Condition",
      type: "dropdown",
      required: false,
      options: ["Sunny", "Rainy", "Windy", "Cloudy"],
    },
    {
      id: "permitNumber",
      label: "Permit Number",
      type: "text",
      required: false,
      options: [],
    },
  ],
  shiftStart: "07:00",
  shiftEnd: "17:00",
  appAccessCode: "",
  appAccessCodeActive: false,
};

function makeId(label: string) {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `${base || "field"}_${Date.now()}`;
}

function normalizeSettings(data: any): CompanySettings {
  const merged: any = {
    ...defaultSettings,
    ...(data || {}),
  };

  let normalizedAreas: AreaItem[] = [];

  if (
    Array.isArray(merged.areas) &&
    merged.areas.length > 0 &&
    typeof merged.areas[0] === "object"
  ) {
    normalizedAreas = merged.areas.map((area: any) => ({
      name: String(area?.name || "").trim(),
      subAreas: Array.isArray(area?.subAreas)
        ? area.subAreas.map((s: any) => String(s || "").trim()).filter(Boolean)
        : [],
    }));
  } else if (Array.isArray(merged.areas)) {
    normalizedAreas = merged.areas
      .map((area: any) => ({
        name: String(area || "").trim(),
        subAreas: [],
      }))
      .filter((area: AreaItem) => area.name);
  }

  if (
    normalizedAreas.length > 0 &&
    Array.isArray(data?.subAreas) &&
    data.subAreas.length > 0
  ) {
    normalizedAreas[0].subAreas = data.subAreas
      .map((s: any) => String(s || "").trim())
      .filter(Boolean);
  }

  return {
    ...merged,
    areas: normalizedAreas.length ? normalizedAreas : defaultSettings.areas,
    wbs: Array.isArray(merged.wbs) ? merged.wbs : defaultSettings.wbs,
    materials: Array.isArray(merged.materials)
      ? merged.materials
      : defaultSettings.materials,
    customFields: Array.isArray(merged.customFields)
      ? merged.customFields
      : defaultSettings.customFields,
  };
}

export default function CompanySettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newArea, setNewArea] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      setUser(currentUser);

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
          setSettings(normalizeSettings(settingsSnap.data()));
        } else {
          await setDoc(settingsRef, {
            ...defaultSettings,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid,
          });
        }
      } catch (error) {
        console.error("Error loading company settings:", error);
        alert("Failed to load company settings.");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const updateField = <K extends keyof CompanySettings>(
    field: K,
    value: CompanySettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const saveSettings = async () => {
    if (!companyId || !user) return;

    setSaving(true);

    try {
      const cleanedSettings = normalizeSettings(settings);

      await setDoc(
        doc(db, "companies", companyId, "settings", "appConfig"),
        {
          ...cleanedSettings,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      if (cleanedSettings.appAccessCode) {
        await setDoc(
          doc(db, "companyAccessCodes", cleanedSettings.appAccessCode),
          {
            code: cleanedSettings.appAccessCode,
            companyId,
            companyName: cleanedSettings.companyName.trim(),
            active: cleanedSettings.appAccessCodeActive === true,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          },
          { merge: true }
        );
      }

      setSettings(cleanedSettings);
      alert("Company settings saved successfully.");
    } catch (error) {
      console.error("Error saving company settings:", error);
      alert("Failed to save company settings.");
    } finally {
      setSaving(false);
    }
  };

  const generateSixDigitCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const generateUniqueAccessCode = async () => {
    let code = generateSixDigitCode();
    let tries = 0;

    while (tries < 10) {
      const codeSnap = await getDoc(doc(db, "companyAccessCodes", code));

      if (!codeSnap.exists()) return code;

      code = generateSixDigitCode();
      tries++;
    }

    throw new Error("Could not generate a unique access code.");
  };

  const generateAppAccessCode = async () => {
    if (!companyId || !user) return;

    if (!settings.companyName.trim()) {
      alert("Please enter the correct company name first.");
      return;
    }

    const confirmGenerate = confirm(
      settings.appAccessCode
        ? "This will replace the old app access code. Continue?"
        : "Generate a new app access code for this company?"
    );

    if (!confirmGenerate) return;

    setSaving(true);

    try {
      const oldCode = settings.appAccessCode;
      const newCode = await generateUniqueAccessCode();

      if (oldCode) {
        await setDoc(
          doc(db, "companyAccessCodes", oldCode),
          {
            active: false,
            revokedAt: serverTimestamp(),
            revokedBy: user.uid,
          },
          { merge: true }
        );
      }

      await setDoc(doc(db, "companyAccessCodes", newCode), {
        code: newCode,
        companyId,
        companyName: settings.companyName.trim(),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });

      const updatedSettings = {
        ...settings,
        appAccessCode: newCode,
        appAccessCodeActive: true,
      };

      await setDoc(
        doc(db, "companies", companyId, "settings", "appConfig"),
        {
          ...updatedSettings,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      setSettings(updatedSettings);
      alert(`New app access code generated: ${newCode}`);
    } catch (error) {
      console.error("Error generating app code:", error);
      alert("Failed to generate app access code.");
    } finally {
      setSaving(false);
    }
  };

  const toggleAccessCodeStatus = async () => {
    if (!companyId || !user || !settings.appAccessCode) return;

    const newStatus = !settings.appAccessCodeActive;

    setSaving(true);

    try {
      await setDoc(
        doc(db, "companyAccessCodes", settings.appAccessCode),
        {
          active: newStatus,
          companyId,
          companyName: settings.companyName.trim(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      const updatedSettings = {
        ...settings,
        appAccessCodeActive: newStatus,
      };

      await setDoc(
        doc(db, "companies", companyId, "settings", "appConfig"),
        {
          appAccessCodeActive: newStatus,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      setSettings(updatedSettings);
    } catch (error) {
      console.error("Error updating code status:", error);
      alert("Failed to update code status.");
    } finally {
      setSaving(false);
    }
  };

  const addArea = () => {
    if (!newArea.trim()) return;

    updateField("areas", [
      ...settings.areas,
      { name: newArea.trim(), subAreas: [] },
    ]);

    setNewArea("");
  };

  const updateAreaName = (index: number, value: string) => {
    const updated = [...settings.areas];
    updated[index] = { ...updated[index], name: value };
    updateField("areas", updated);
  };

  const removeArea = (index: number) => {
    updateField(
      "areas",
      settings.areas.filter((_, i) => i !== index)
    );
  };

  const addSubAreaToArea = (areaIndex: number) => {
    const value = prompt("Enter sub-area name");
    if (!value?.trim()) return;

    const updated = [...settings.areas];
    updated[areaIndex].subAreas = [
      ...(updated[areaIndex].subAreas || []),
      value.trim(),
    ];

    updateField("areas", updated);
  };

  const removeSubAreaFromArea = (areaIndex: number, subIndex: number) => {
    const updated = [...settings.areas];
    updated[areaIndex].subAreas = updated[areaIndex].subAreas.filter(
      (_, i) => i !== subIndex
    );

    updateField("areas", updated);
  };

  const addWbs = () => {
    updateField("wbs", [...settings.wbs, { name: "New WBS", subOptions: [] }]);
  };

  const updateWbsName = (index: number, value: string) => {
    const updated = [...settings.wbs];
    updated[index].name = value;
    updateField("wbs", updated);
  };

  const removeWbs = (index: number) => {
    updateField(
      "wbs",
      settings.wbs.filter((_, i) => i !== index)
    );
  };

  const addSubWbs = (wbsIndex: number) => {
    const value = prompt("Enter sub-WBS name");
    if (!value?.trim()) return;

    const updated = [...settings.wbs];
    updated[wbsIndex].subOptions.push(value.trim());
    updateField("wbs", updated);
  };

  const removeSubWbs = (wbsIndex: number, subIndex: number) => {
    const updated = [...settings.wbs];
    updated[wbsIndex].subOptions = updated[wbsIndex].subOptions.filter(
      (_, i) => i !== subIndex
    );
    updateField("wbs", updated);
  };

  const addMaterial = () => {
    updateField("materials", [
      ...settings.materials,
      { name: "New Material", unit: "each", lowStockAlert: 0 },
    ]);
  };

  const updateMaterial = (
    index: number,
    field: keyof MaterialItem,
    value: string | number
  ) => {
    const updated = [...settings.materials];
    updated[index] = { ...updated[index], [field]: value };
    updateField("materials", updated);
  };

  const removeMaterial = (index: number) => {
    updateField(
      "materials",
      settings.materials.filter((_, i) => i !== index)
    );
  };

  const addCustomField = () => {
    const label = prompt("Enter field name, for example Weather Condition");
    if (!label?.trim()) return;

    const newField: CustomField = {
      id: makeId(label),
      label: label.trim(),
      type: "text",
      required: false,
      options: [],
    };

    updateField("customFields", [...settings.customFields, newField]);
  };

  const updateCustomField = (
    index: number,
    field: keyof CustomField,
    value: string | boolean | string[]
  ) => {
    const updated = [...settings.customFields];

    updated[index] = {
      ...updated[index],
      [field]: value,
    };

    if (field === "type" && value !== "dropdown") {
      updated[index].options = [];
    }

    updateField("customFields", updated);
  };

  const removeCustomField = (index: number) => {
    updateField(
      "customFields",
      settings.customFields.filter((_, i) => i !== index)
    );
  };

  const addCustomFieldOption = (fieldIndex: number) => {
    const value = prompt("Enter dropdown option");
    if (!value?.trim()) return;

    const updated = [...settings.customFields];
    updated[fieldIndex].options = [
      ...(updated[fieldIndex].options || []),
      value.trim(),
    ];

    updateField("customFields", updated);
  };

  const removeCustomFieldOption = (fieldIndex: number, optionIndex: number) => {
    const updated = [...settings.customFields];
    updated[fieldIndex].options = updated[fieldIndex].options.filter(
      (_, i) => i !== optionIndex
    );

    updateField("customFields", updated);
  };

  if (loading) {
    return (
      <div className="software-card-strong settings-card">
        <p style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Loader2 className="animate-spin" size={18} />
          Loading company settings...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="software-card-strong settings-card">
        <h2 className="software-title">Access denied</h2>
        <p className="software-subtitle">
          Please login before changing company settings.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <section className="software-card-strong settings-hero">
        <div className="settings-hero-left">
          <div className="settings-icon-box">
            <Settings size={28} />
          </div>

          <div>
            <h1 className="software-title">Company Settings</h1>
            <p className="software-subtitle">
              Control what appears inside the SiteDiary mobile app.
            </p>
          </div>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="soft-button soft-button-primary"
        >
          {saving ? (
            <>
              <Loader2 className="animate-spin" size={17} /> Saving...
            </>
          ) : (
            <>
              <Save size={17} /> Save Changes
            </>
          )}
        </button>
      </section>

      <section className="software-card settings-card">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">
              <KeyRound size={21} /> App Access Code
            </h2>
            <p className="software-subtitle">
              Supervisors will use the company name and this 6-digit code to
              connect the mobile app to this company.
            </p>
          </div>

          <button
            onClick={generateAppAccessCode}
            disabled={saving}
            className="soft-button soft-button-primary"
          >
            <RefreshCcw size={17} />
            {settings.appAccessCode ? "Regenerate Code" : "Generate Code"}
          </button>
        </div>

        <div className="settings-grid">
          <div className="settings-wbs-card">
            <p className="settings-label">Correct Company Name</p>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>
              {settings.companyName || "No company name set"}
            </h2>
            <p className="software-subtitle">
              The app must use this company name together with the code.
            </p>
          </div>

          <div className="settings-wbs-card">
            <p className="settings-label">Current App Code</p>

            {settings.appAccessCode ? (
              <>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 34,
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                  }}
                >
                  {settings.appAccessCode}
                </h2>

                <p className="software-subtitle">
                  Status:{" "}
                  <strong>
                    {settings.appAccessCodeActive ? "Active" : "Inactive"}
                  </strong>
                </p>

                <button
                  onClick={toggleAccessCodeStatus}
                  disabled={saving}
                  className="soft-button soft-button-secondary"
                  style={{ marginTop: 12 }}
                >
                  <ShieldCheck size={17} />
                  {settings.appAccessCodeActive
                    ? "Deactivate Code"
                    : "Activate Code"}
                </button>
              </>
            ) : (
              <p className="software-subtitle">
                No code generated yet. Click Generate Code.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="settings-grid">
        <div className="software-card settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">
              <Building2 size={20} /> Company Identity
            </h2>
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Company Name</label>
            <input
              className="soft-input"
              value={settings.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
            />
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Default Project Name</label>
            <input
              className="soft-input"
              value={settings.projectName}
              onChange={(e) => updateField("projectName", e.target.value)}
            />
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Logo URL</label>
            <input
              className="soft-input"
              value={settings.logoUrl}
              onChange={(e) => updateField("logoUrl", e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>

          {settings.logoUrl && (
            <div className="settings-logo-preview">
              <img src={settings.logoUrl} alt="Company logo" />
            </div>
          )}
        </div>

        <div className="software-card settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">
              <Clock size={20} /> Shift Settings
            </h2>
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Shift Start</label>
            <input
              type="time"
              className="soft-input"
              value={settings.shiftStart}
              onChange={(e) => updateField("shiftStart", e.target.value)}
            />
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Shift End</label>
            <input
              type="time"
              className="soft-input"
              value={settings.shiftEnd}
              onChange={(e) => updateField("shiftEnd", e.target.value)}
            />
          </div>

          <p className="software-subtitle">
            These times can control diary periods, reports, and daily summaries.
          </p>
        </div>
      </section>

      <section className="software-card settings-card">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">
              <MapPin size={20} /> Areas and Sub-Areas
            </h2>
            <p className="software-subtitle">
              Each area can now have its own sub-areas. The app will only show
              sub-areas connected to the selected area.
            </p>
          </div>
        </div>

        <div className="settings-inline-add">
          <input
            className="soft-input"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            placeholder="Add main area, e.g. Plant"
          />
          <button onClick={addArea} className="soft-button soft-button-primary">
            <Plus size={17} /> Add Area
          </button>
        </div>

        <div className="settings-wbs-grid">
          {settings.areas.map((area, areaIndex) => (
            <div key={areaIndex} className="settings-wbs-card">
              <div className="settings-inline-add">
                <input
                  className="soft-input"
                  value={area.name}
                  onChange={(e) => updateAreaName(areaIndex, e.target.value)}
                  placeholder="Area name"
                />

                <button
                  onClick={() => removeArea(areaIndex)}
                  className="settings-danger-button"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <p className="software-subtitle" style={{ marginTop: 8 }}>
                Sub-areas for this area:
              </p>

              <div className="settings-list">
                {(area.subAreas || []).map((subArea, subIndex) => (
                  <div key={subIndex} className="settings-list-item">
                    <span>{subArea}</span>
                    <button
                      onClick={() =>
                        removeSubAreaFromArea(areaIndex, subIndex)
                      }
                      className="settings-danger-button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addSubAreaToArea(areaIndex)}
                className="settings-mini-button"
                style={{ marginTop: 12 }}
              >
                <Plus size={15} /> Add Sub-Area
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="software-card settings-card">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">
              <Layers size={20} /> WBS and Sub-WBS
            </h2>
            <p className="software-subtitle">
              These become dropdown options inside the mobile app.
            </p>
          </div>

          <button onClick={addWbs} className="soft-button soft-button-primary">
            <Plus size={17} /> Add WBS
          </button>
        </div>

        <div className="settings-wbs-grid">
          {settings.wbs.map((item, wbsIndex) => (
            <div key={wbsIndex} className="settings-wbs-card">
              <div className="settings-inline-add">
                <input
                  className="soft-input"
                  value={item.name}
                  onChange={(e) => updateWbsName(wbsIndex, e.target.value)}
                />
                <button
                  onClick={() => removeWbs(wbsIndex)}
                  className="settings-danger-button"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="settings-list">
                {item.subOptions.map((sub, subIndex) => (
                  <div key={subIndex} className="settings-list-item">
                    <span>{sub}</span>
                    <button
                      onClick={() => removeSubWbs(wbsIndex, subIndex)}
                      className="settings-danger-button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addSubWbs(wbsIndex)}
                className="settings-mini-button"
                style={{ marginTop: 12 }}
              >
                <Plus size={15} /> Add Sub-WBS
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="software-card settings-card">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">
              <Boxes size={20} /> Materials
            </h2>
            <p className="software-subtitle">
              These materials can be used by the app and dashboard reports.
            </p>
          </div>

          <button
            onClick={addMaterial}
            className="soft-button soft-button-primary"
          >
            <Plus size={17} /> Add Material
          </button>
        </div>

        <div className="settings-list">
          {settings.materials.map((material, index) => (
            <div key={index} className="settings-table-row">
              <input
                className="soft-input"
                value={material.name}
                onChange={(e) =>
                  updateMaterial(index, "name", e.target.value)
                }
                placeholder="Material name"
              />

              <input
                className="soft-input"
                value={material.unit}
                onChange={(e) =>
                  updateMaterial(index, "unit", e.target.value)
                }
                placeholder="Unit"
              />

              <input
                type="number"
                className="soft-input"
                value={material.lowStockAlert}
                onChange={(e) =>
                  updateMaterial(
                    index,
                    "lowStockAlert",
                    Number(e.target.value)
                  )
                }
                placeholder="Low stock"
              />

              <button
                onClick={() => removeMaterial(index)}
                className="settings-danger-button"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="software-card settings-card">
        <div className="settings-card-header">
          <div>
            <h2 className="settings-card-title">
              <ListChecks size={20} /> Custom Fields
            </h2>
            <p className="software-subtitle">
              Create extra fields that will appear in the mobile app and later
              print on the PDF.
            </p>
          </div>

          <button
            onClick={addCustomField}
            className="soft-button soft-button-primary"
          >
            <Plus size={17} /> Add Field
          </button>
        </div>

        <div className="settings-wbs-grid">
          {settings.customFields.map((field, fieldIndex) => (
            <div key={field.id || fieldIndex} className="settings-wbs-card">
              <div className="settings-form-group">
                <label className="settings-label">Field Name</label>
                <input
                  className="soft-input"
                  value={field.label}
                  onChange={(e) =>
                    updateCustomField(fieldIndex, "label", e.target.value)
                  }
                  placeholder="e.g. Weather Condition"
                />
              </div>

              <div className="settings-form-group">
                <label className="settings-label">Field Type</label>
                <select
                  className="soft-input"
                  value={field.type}
                  onChange={(e) =>
                    updateCustomField(
                      fieldIndex,
                      "type",
                      e.target.value as CustomFieldType
                    )
                  }
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="yesno">Yes / No</option>
                  <option value="longtext">Long Text</option>
                </select>
              </div>

              <label
                className="settings-label"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) =>
                    updateCustomField(
                      fieldIndex,
                      "required",
                      e.target.checked
                    )
                  }
                />
                Required field
              </label>

              {field.type === "dropdown" && (
                <>
                  <p className="software-subtitle" style={{ marginTop: 12 }}>
                    Dropdown options:
                  </p>

                  <div className="settings-list">
                    {(field.options || []).map((option, optionIndex) => (
                      <div key={optionIndex} className="settings-list-item">
                        <span>{option}</span>
                        <button
                          onClick={() =>
                            removeCustomFieldOption(fieldIndex, optionIndex)
                          }
                          className="settings-danger-button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => addCustomFieldOption(fieldIndex)}
                    className="settings-mini-button"
                    style={{ marginTop: 12 }}
                  >
                    <Plus size={15} /> Add Option
                  </button>
                </>
              )}

              <button
                onClick={() => removeCustomField(fieldIndex)}
                className="settings-danger-button"
                style={{ marginTop: 14 }}
              >
                <Trash2 size={15} /> Remove Field
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}