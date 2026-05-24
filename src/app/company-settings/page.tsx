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
    logoUrl: "",
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
    logoUrl: "",
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
            logoUrl: "",
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
      const cleanedSettings = normalizeSettings({
        ...settings,
        logoUrl: "",
      });

      await setDoc(
        doc(db, "companies", companyId, "settings", "appConfig"),
        {
          ...cleanedSettings,
          logoUrl: "",
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
        logoUrl: "",
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

      await setDoc(
        doc(db, "companies", companyId, "settings", "appConfig"),
        {
          appAccessCodeActive: newStatus,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );

      setSettings((prev) => ({
        ...prev,
        appAccessCodeActive: newStatus,
      }));
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
      <div className="settings-pro-loading">
        <Loader2 className="animate-spin" size={20} />
        Loading company settings...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="settings-pro-denied">
        <h2>Access denied</h2>
        <p>Please login before changing company settings.</p>
      </div>
    );
  }

  return (
    <div className="settings-pro-page">
      <section className="settings-pro-hero">
        <div>
          <p className="settings-pro-kicker">SiteDiary Configuration</p>
          <h1>Company App Settings</h1>
          <p>
            Configure how the mobile app works for this company: company name,
            project name, access code, work areas, WBS, materials, shifts, and
            custom diary fields.
          </p>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="settings-save-main"
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

      <section className="settings-access-card">
        <div className="settings-card-top">
          <div>
            <h2>
              <KeyRound size={20} /> App Access Code
            </h2>
            <p>
              Supervisors connect the mobile app using the company name and this
              6-digit code.
            </p>
          </div>

          <button
            onClick={generateAppAccessCode}
            disabled={saving}
            className="settings-primary-btn"
          >
            <RefreshCcw size={16} />
            {settings.appAccessCode ? "Regenerate Code" : "Generate Code"}
          </button>
        </div>

        <div className="settings-access-grid">
          <div className="settings-access-box">
            <span>Company Name</span>
            <strong>{settings.companyName || "No company name set"}</strong>
            <p>The mobile app must use this exact company name.</p>
          </div>

          <div className="settings-access-box code">
            <span>Current Code</span>

            {settings.appAccessCode ? (
              <>
                <strong>{settings.appAccessCode}</strong>
                <p>
                  Status:{" "}
                  <b>
                    {settings.appAccessCodeActive ? "Active" : "Inactive"}
                  </b>
                </p>

                <button
                  onClick={toggleAccessCodeStatus}
                  disabled={saving}
                  className="settings-secondary-btn"
                >
                  <ShieldCheck size={16} />
                  {settings.appAccessCodeActive
                    ? "Deactivate Code"
                    : "Activate Code"}
                </button>
              </>
            ) : (
              <p>No code generated yet. Click Generate Code.</p>
            )}
          </div>
        </div>
      </section>

      <section className="settings-two-grid">
        <div className="settings-pro-card">
          <div className="settings-card-top">
            <h2>
              <Building2 size={20} /> Company Identity
            </h2>
          </div>

          <div className="settings-form-group">
            <label>Company Name</label>
            <input
              className="settings-input"
              value={settings.companyName}
              onChange={(e) => updateField("companyName", e.target.value)}
            />
          </div>

          <div className="settings-form-group">
            <label>Default Project Name</label>
            <input
              className="settings-input"
              value={settings.projectName}
              onChange={(e) => updateField("projectName", e.target.value)}
            />
          </div>

          <div className="settings-note">
            Logo upload has been removed. The app will use the configured
            company name and project name only.
          </div>
        </div>

        <div className="settings-pro-card">
          <div className="settings-card-top">
            <h2>
              <Clock size={20} /> Shift Settings
            </h2>
          </div>

          <div className="settings-form-group">
            <label>Shift Start</label>
            <input
              type="time"
              className="settings-input"
              value={settings.shiftStart}
              onChange={(e) => updateField("shiftStart", e.target.value)}
            />
          </div>

          <div className="settings-form-group">
            <label>Shift End</label>
            <input
              type="time"
              className="settings-input"
              value={settings.shiftEnd}
              onChange={(e) => updateField("shiftEnd", e.target.value)}
            />
          </div>

          <div className="settings-note">
            These times can support diary periods, daily summaries, and report
            windows.
          </div>
        </div>
      </section>

      <section className="settings-pro-card">
        <div className="settings-card-top">
          <div>
            <h2>
              <MapPin size={20} /> Areas and Sub-Areas
            </h2>
            <p>
              Configure the exact site areas and sub-areas supervisors can
              select inside the mobile app.
            </p>
          </div>
        </div>

        <div className="settings-add-row">
          <input
            className="settings-input"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            placeholder="Add main area, e.g. Plant"
          />
          <button onClick={addArea} className="settings-primary-btn">
            <Plus size={16} /> Add Area
          </button>
        </div>

        <div className="settings-card-grid">
          {settings.areas.map((area, areaIndex) => (
            <div key={areaIndex} className="settings-mini-card">
              <div className="settings-row-control">
                <input
                  className="settings-input"
                  value={area.name}
                  onChange={(e) => updateAreaName(areaIndex, e.target.value)}
                  placeholder="Area name"
                />

                <button
                  onClick={() => removeArea(areaIndex)}
                  className="settings-danger-btn"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <p className="settings-small-title">Sub-areas</p>

              <div className="settings-chip-list">
                {(area.subAreas || []).map((subArea, subIndex) => (
                  <div key={subIndex} className="settings-chip-item">
                    <span>{subArea}</span>
                    <button
                      onClick={() =>
                        removeSubAreaFromArea(areaIndex, subIndex)
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addSubAreaToArea(areaIndex)}
                className="settings-mini-btn"
              >
                <Plus size={14} /> Add Sub-Area
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-pro-card">
        <div className="settings-card-top">
          <div>
            <h2>
              <Layers size={20} /> WBS and Sub-WBS
            </h2>
            <p>Configure work breakdown dropdowns for the mobile app.</p>
          </div>

          <button onClick={addWbs} className="settings-primary-btn">
            <Plus size={16} /> Add WBS
          </button>
        </div>

        <div className="settings-card-grid">
          {settings.wbs.map((item, wbsIndex) => (
            <div key={wbsIndex} className="settings-mini-card">
              <div className="settings-row-control">
                <input
                  className="settings-input"
                  value={item.name}
                  onChange={(e) => updateWbsName(wbsIndex, e.target.value)}
                />

                <button
                  onClick={() => removeWbs(wbsIndex)}
                  className="settings-danger-btn"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <p className="settings-small-title">Sub-WBS options</p>

              <div className="settings-chip-list">
                {item.subOptions.map((sub, subIndex) => (
                  <div key={subIndex} className="settings-chip-item">
                    <span>{sub}</span>
                    <button
                      onClick={() => removeSubWbs(wbsIndex, subIndex)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addSubWbs(wbsIndex)}
                className="settings-mini-btn"
              >
                <Plus size={14} /> Add Sub-WBS
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-pro-card">
        <div className="settings-card-top">
          <div>
            <h2>
              <Boxes size={20} /> Materials
            </h2>
            <p>Control the default material list used by the app and reports.</p>
          </div>

          <button onClick={addMaterial} className="settings-primary-btn">
            <Plus size={16} /> Add Material
          </button>
        </div>

        <div className="settings-material-list">
          {settings.materials.map((material, index) => (
            <div key={index} className="settings-material-row">
              <input
                className="settings-input"
                value={material.name}
                onChange={(e) =>
                  updateMaterial(index, "name", e.target.value)
                }
                placeholder="Material name"
              />

              <input
                className="settings-input"
                value={material.unit}
                onChange={(e) =>
                  updateMaterial(index, "unit", e.target.value)
                }
                placeholder="Unit"
              />

              <input
                type="number"
                className="settings-input"
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
                className="settings-danger-btn"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-pro-card">
        <div className="settings-card-top">
          <div>
            <h2>
              <ListChecks size={20} /> Custom Fields
            </h2>
            <p>
              Add extra app fields such as weather, permit number, inspections,
              or any client-specific requirement.
            </p>
          </div>

          <button onClick={addCustomField} className="settings-primary-btn">
            <Plus size={16} /> Add Field
          </button>
        </div>

        <div className="settings-card-grid">
          {settings.customFields.map((field, fieldIndex) => (
            <div key={field.id || fieldIndex} className="settings-mini-card">
              <div className="settings-form-group">
                <label>Field Name</label>
                <input
                  className="settings-input"
                  value={field.label}
                  onChange={(e) =>
                    updateCustomField(fieldIndex, "label", e.target.value)
                  }
                  placeholder="e.g. Weather Condition"
                />
              </div>

              <div className="settings-form-group">
                <label>Field Type</label>
                <select
                  className="settings-input"
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

              <label className="settings-checkbox">
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
                  <p className="settings-small-title">Dropdown options</p>

                  <div className="settings-chip-list">
                    {(field.options || []).map((option, optionIndex) => (
                      <div key={optionIndex} className="settings-chip-item">
                        <span>{option}</span>
                        <button
                          onClick={() =>
                            removeCustomFieldOption(fieldIndex, optionIndex)
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => addCustomFieldOption(fieldIndex)}
                    className="settings-mini-btn"
                  >
                    <Plus size={14} /> Add Option
                  </button>
                </>
              )}

              <button
                onClick={() => removeCustomField(fieldIndex)}
                className="settings-remove-field-btn"
              >
                <Trash2 size={15} /> Remove Field
              </button>
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{`
        .settings-pro-page {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .settings-pro-loading,
        .settings-pro-denied {
          padding: 28px;
          border-radius: 18px;
          background: #ffffff;
          border: 1px solid var(--border, #dfe4dc);
          color: var(--text-strong, #0f1713);
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
        }

        .settings-pro-loading {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .settings-pro-denied h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 950;
        }

        .settings-pro-denied p {
          margin: 8px 0 0;
          color: var(--muted, #66726a);
        }

        .settings-pro-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding: 22px;
          border-radius: 20px;
          background:
            radial-gradient(circle at top right, rgba(199, 137, 42, 0.24), transparent 30%),
            linear-gradient(135deg, #1f2a24 0%, #2d3a32 58%, #3a321f 100%);
          color: #ffffff;
          box-shadow: var(--shadow-md, 0 8px 24px rgba(18, 26, 22, 0.08));
        }

        .settings-pro-kicker {
          margin: 0 0 6px;
          color: #f3d59d;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .settings-pro-hero h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 950;
        }

        .settings-pro-hero p {
          margin: 9px 0 0;
          max-width: 940px;
          color: rgba(255, 255, 255, 0.78);
          font-size: 13.5px;
          line-height: 1.6;
        }

        .settings-save-main,
        .settings-primary-btn,
        .settings-secondary-btn,
        .settings-mini-btn,
        .settings-danger-btn,
        .settings-remove-field-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          cursor: pointer;
          font-weight: 950;
          transition: 0.18s ease;
          white-space: nowrap;
        }

        .settings-save-main {
          min-height: 40px;
          padding: 0 15px;
          border-radius: 12px;
          background: #ffffff;
          color: #1f2a24;
        }

        .settings-save-main:hover,
        .settings-primary-btn:hover,
        .settings-secondary-btn:hover,
        .settings-mini-btn:hover,
        .settings-danger-btn:hover,
        .settings-remove-field-btn:hover {
          transform: translateY(-1px);
        }

        .settings-save-main:disabled,
        .settings-primary-btn:disabled,
        .settings-secondary-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .settings-access-card,
        .settings-pro-card {
          padding: 18px;
          border-radius: 18px;
          border: 1px solid var(--border, #dfe4dc);
          background: #ffffff;
          box-shadow: var(--shadow-sm, 0 1px 4px rgba(18, 26, 22, 0.06));
        }

        .settings-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 16px;
        }

        .settings-card-top h2 {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0;
          color: var(--text-strong, #0f1713);
          font-size: 18px;
          font-weight: 950;
          letter-spacing: -0.025em;
        }

        .settings-card-top p {
          margin: 5px 0 0;
          color: var(--muted, #66726a);
          font-size: 12.5px;
          line-height: 1.55;
        }

        .settings-primary-btn {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 10px;
          background: #1f2a24;
          color: #ffffff;
        }

        .settings-secondary-btn {
          min-height: 34px;
          padding: 0 12px;
          border-radius: 10px;
          background: #fff4df;
          color: #80520f;
          border: 1px solid #ead5aa;
        }

        .settings-access-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .settings-access-box {
          padding: 18px;
          border-radius: 16px;
          border: 1px solid var(--border, #dfe4dc);
          background: #fafbf8;
        }

        .settings-access-box span {
          display: block;
          color: var(--muted, #66726a);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .settings-access-box strong {
          display: block;
          margin-top: 8px;
          color: var(--text-strong, #0f1713);
          font-size: 25px;
          font-weight: 950;
          letter-spacing: -0.035em;
        }

        .settings-access-box.code strong {
          font-size: 36px;
          letter-spacing: 0.18em;
        }

        .settings-access-box p {
          margin: 8px 0 0;
          color: var(--muted, #66726a);
          font-size: 12.5px;
        }

        .settings-two-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .settings-form-group {
          margin-bottom: 14px;
        }

        .settings-form-group label {
          display: block;
          margin-bottom: 6px;
          color: var(--muted, #66726a);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .settings-input {
          width: 100%;
          height: 40px;
          border-radius: 10px;
          border: 1px solid var(--border-strong, #cbd3c9);
          background: #ffffff;
          padding: 0 12px;
          color: var(--text-strong, #0f1713);
          font-size: 13px;
          outline: none;
        }

        .settings-input:focus {
          border-color: rgba(199, 137, 42, 0.8);
          box-shadow: 0 0 0 3px rgba(199, 137, 42, 0.14);
        }

        .settings-note {
          border-radius: 12px;
          border: 1px solid #ead5aa;
          background: #fff4df;
          color: #80520f;
          padding: 12px;
          font-size: 12.5px;
          font-weight: 850;
          line-height: 1.5;
        }

        .settings-add-row,
        .settings-row-control {
          display: flex;
          gap: 9px;
          align-items: stretch;
        }

        .settings-add-row {
          margin-bottom: 14px;
        }

        .settings-card-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .settings-mini-card {
          padding: 14px;
          border-radius: 16px;
          border: 1px solid var(--border, #dfe4dc);
          background: #fafbf8;
          min-width: 0;
        }

        .settings-small-title {
          margin: 12px 0 8px;
          color: var(--muted, #66726a);
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .settings-chip-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .settings-chip-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 35px;
          padding: 7px 9px;
          border-radius: 10px;
          border: 1px solid var(--border, #dfe4dc);
          background: #ffffff;
          color: var(--text-strong, #0f1713);
          font-size: 12.5px;
          font-weight: 850;
        }

        .settings-chip-item span {
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .settings-chip-item button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          border: 1px solid #f4c7c3;
          background: #fff1ef;
          color: #b42318;
          cursor: pointer;
        }

        .settings-mini-btn {
          min-height: 32px;
          margin-top: 10px;
          padding: 0 10px;
          border-radius: 9px;
          background: #fff4df;
          color: #80520f;
          border: 1px solid #ead5aa;
          font-size: 12px;
        }

        .settings-danger-btn {
          width: 40px;
          min-width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #fff1ef;
          color: #b42318;
          border: 1px solid #f4c7c3;
        }

        .settings-material-list {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .settings-material-row {
          display: grid;
          grid-template-columns: minmax(180px, 1fr) 140px 140px 44px;
          gap: 9px;
          align-items: center;
          padding: 10px;
          border-radius: 14px;
          border: 1px solid var(--border, #dfe4dc);
          background: #fafbf8;
        }

        .settings-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 10px 0 0;
          color: var(--text-strong, #0f1713);
          font-size: 12.5px;
          font-weight: 850;
        }

        .settings-remove-field-btn {
          min-height: 34px;
          margin-top: 12px;
          padding: 0 11px;
          border-radius: 10px;
          background: #fff1ef;
          color: #b42318;
          border: 1px solid #f4c7c3;
          font-size: 12px;
        }

        @media (max-width: 1180px) {
          .settings-card-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .settings-access-grid,
          .settings-two-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .settings-pro-hero,
          .settings-card-top {
            flex-direction: column;
            align-items: stretch;
          }

          .settings-card-grid {
            grid-template-columns: 1fr;
          }

          .settings-add-row,
          .settings-row-control {
            flex-direction: column;
          }

          .settings-material-row {
            grid-template-columns: 1fr;
          }

          .settings-danger-btn {
            width: 100%;
          }

          .settings-save-main,
          .settings-primary-btn,
          .settings-secondary-btn,
          .settings-mini-btn,
          .settings-remove-field-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}