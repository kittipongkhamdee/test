import { useState } from "react";
import { createPortal } from "react-dom";
import { useCatalog, useFormOptions, useStore } from "../data/store";
import { createNewExamRound } from "../data/api";
import { gradeLabel } from "../data/mockData";
import type { FormOption, FormOptionCategory, SubjectCatalogEntry } from "../data/types";
import "./AdminSettings.css";

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function resizeImageToBase64(file: File, maxSize = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png", 0.85));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function OptionRow({
  option,
  siblings,
  allowDelete,
  withIcon,
}: {
  option: FormOption;
  siblings: FormOption[];
  allowDelete: boolean;
  withIcon: boolean;
}) {
  const { editFormOption, removeFormOption } = useStore();
  const [label, setLabel] = useState(option.label);
  const [icon, setIcon] = useState(option.icon ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = label !== option.label || icon !== (option.icon ?? "");
  const index = siblings.findIndex((o) => o.id === option.id);

  async function saveLabel() {
    if (!dirty) return;
    setBusy(true);
    try {
      await editFormOption(option.id, { label: label.trim() || option.label, icon: icon.trim() || null });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await editFormOption(option.id, { isActive: !option.isActive });
    } finally {
      setBusy(false);
    }
  }

  async function move(direction: -1 | 1) {
    const target = siblings[index + direction];
    if (!target) return;
    setBusy(true);
    try {
      await Promise.all([
        editFormOption(option.id, { sortOrder: target.sortOrder }),
        editFormOption(target.id, { sortOrder: option.sortOrder }),
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`ลบตัวเลือก "${option.label}" ใช่หรือไม่?`)) return;
    setBusy(true);
    try {
      await removeFormOption(option.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={"admin-opt-row" + (option.isActive ? "" : " inactive")}>
      <span
        className={"admin-toggle" + (option.isActive ? " on" : "")}
        role="switch"
        aria-checked={option.isActive}
        aria-label="เปิด/ปิดการใช้งาน"
        onClick={() => !busy && toggleActive()}
      >
        <span className="admin-toggle-knob" />
      </span>
      <div className="admin-opt-fields">
        <input
          className="tform-input admin-opt-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={saveLabel}
          disabled={busy}
        />
        {withIcon && (
          <input
            className="tform-input admin-opt-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            onBlur={saveLabel}
            disabled={busy}
            placeholder="ไอคอน"
          />
        )}
      </div>
      <div className="admin-opt-actions">
        <button type="button" className="admin-opt-move" onClick={() => move(-1)} disabled={busy || index === 0} title="ย้ายขึ้น">
          ↑
        </button>
        <button
          type="button"
          className="admin-opt-move"
          onClick={() => move(1)}
          disabled={busy || index === siblings.length - 1}
          title="ย้ายลง"
        >
          ↓
        </button>
        {allowDelete && (
          <button type="button" className="admin-opt-delete" onClick={handleDelete} disabled={busy} title="ลบตัวเลือก">
            ลบ
          </button>
        )}
      </div>
    </div>
  );
}

function AddOptionForm({ category, nextSortOrder, withIcon }: { category: FormOptionCategory; nextSortOrder: number; withIcon: boolean }) {
  const { addFormOption } = useStore();
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || !label.trim()) {
      setError("กรอกค่าและป้ายชื่อให้ครบ");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addFormOption({
        category,
        value: value.trim(),
        label: label.trim(),
        icon: icon.trim() || null,
        sortOrder: nextSortOrder,
        isActive: true,
      });
      setValue("");
      setLabel("");
      setIcon("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มตัวเลือกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-opt-add" onSubmit={handleAdd}>
      <div className="admin-opt-add-fields">
        <input
          className="tform-input"
          placeholder="ค่า (value)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <input
          className="tform-input admin-opt-add-label"
          placeholder="ป้ายชื่อที่แสดง"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={busy}
        />
        {withIcon && (
          <input
            className="tform-input admin-opt-icon"
            placeholder="ไอคอน"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            disabled={busy}
          />
        )}
        <button type="submit" className="btn btn-ghost admin-opt-add-btn" disabled={busy}>
          + เพิ่มตัวเลือก
        </button>
      </div>
      {error && <div className="tform-error">{error}</div>}
    </form>
  );
}

function OptionCategorySection({
  category,
  title,
  hint,
  allowAddRemove,
  withIcon,
}: {
  category: FormOptionCategory;
  title: string;
  hint: string;
  allowAddRemove: boolean;
  withIcon: boolean;
}) {
  const options = useFormOptions(category);
  const nextSortOrder = options.length ? Math.max(...options.map((o) => o.sortOrder)) + 1 : 1;

  return (
    <div className="card admin-opt-card">
      <div className="admin-opt-header">
        <div className="admin-opt-title">{title}</div>
        <div className="admin-opt-hint">{hint}</div>
      </div>
      <div className="admin-opt-list">
        {options.map((opt) => (
          <OptionRow key={opt.id} option={opt} siblings={options} allowDelete={allowAddRemove} withIcon={withIcon} />
        ))}
      </div>
      {allowAddRemove && <AddOptionForm category={category} nextSortOrder={nextSortOrder} withIcon={withIcon} />}
    </div>
  );
}

function SubjectCatalogRow({ entry, onDelete }: { entry: SubjectCatalogEntry; onDelete: (id: string) => Promise<void> }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`ลบวิชา ${entry.code} ${entry.subjectName} (${gradeLabel(entry.grade)}) ใช่หรือไม่?`)) return;
    setDeleting(true);
    try {
      await onDelete(entry.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="admin-catalog-row">
      <span className="admin-catalog-code">{entry.code}</span>
      <span className="admin-catalog-name">{entry.subjectName}</span>
      <span className="admin-catalog-grade">{gradeLabel(entry.grade)}</span>
      <button type="button" className="admin-opt-delete" onClick={handleDelete} disabled={deleting} title="ลบรายวิชา">
        {deleting ? "…" : "ลบ"}
      </button>
    </div>
  );
}

function SubjectCatalogSection() {
  const catalog = useCatalog();
  const { addCatalogEntry, removeCatalogEntry } = useStore();
  const [code, setCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [grade, setGrade] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterGrade, setFilterGrade] = useState<number | "all">("all");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !subjectName.trim()) {
      setError("กรุณากรอกรหัสวิชาและชื่อวิชา");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addCatalogEntry({ code: code.trim(), subjectName: subjectName.trim(), grade: grade as 1 | 2 | 3 | 4 | 5 | 6 });
      setCode("");
      setSubjectName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มรายวิชาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const filtered = filterGrade === "all" ? catalog : catalog.filter((e) => e.grade === filterGrade);

  return (
    <div className="card admin-catalog-card">
      <div className="admin-opt-header">
        <div className="admin-opt-title">รายวิชาในระบบ (Catalog)</div>
        <div className="admin-opt-hint">
          ครูจะเห็นรายวิชาเหล่านี้เป็นตัวเลือก Autocomplete เมื่อกรอกฟอร์มสำรวจ — เพิ่มหรือลบได้อิสระ ครูยังพิมพ์รหัสวิชาเองได้เสมอ
        </div>
      </div>

      <form className="admin-opt-add" onSubmit={handleAdd}>
        <div className="admin-catalog-add-fields">
          <input
            className="tform-input"
            placeholder="รหัสวิชา เช่น อ23101"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={busy}
          />
          <input
            className="tform-input admin-catalog-name-input"
            placeholder="ชื่อวิชา เช่น ภาษาอังกฤษ 5"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            disabled={busy}
          />
          <select
            className="tform-input admin-catalog-grade-select"
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
            disabled={busy}
          >
            {([1, 2, 3, 4, 5, 6] as const).map((g) => (
              <option key={g} value={g}>{gradeLabel(g)}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-ghost admin-opt-add-btn" disabled={busy}>
            + เพิ่มรายวิชา
          </button>
        </div>
        {error && <div className="tform-error">{error}</div>}
      </form>

      <div className="admin-catalog-filter">
        <span className="tform-label" style={{ marginBottom: 0 }}>กรองระดับชั้น:</span>
        <div className="tform-chip-row" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            className={"tform-chip" + (filterGrade === "all" ? " selected" : "")}
            onClick={() => setFilterGrade("all")}
          >
            ทั้งหมด <span className="admin-catalog-count">({catalog.length})</span>
          </button>
          {([1, 2, 3, 4, 5, 6] as const).map((g) => {
            const count = catalog.filter((e) => e.grade === g).length;
            return (
              <button
                key={g}
                type="button"
                className={"tform-chip" + (filterGrade === g ? " selected" : "")}
                onClick={() => setFilterGrade(g)}
              >
                {gradeLabel(g)} <span className="admin-catalog-count">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-catalog-empty">ยังไม่มีรายวิชาในระบบ — เพิ่มรายวิชาด้านบนเพื่อให้ครูใช้ Autocomplete ได้</div>
      ) : (
        <div className="admin-catalog-list">
          <div className="admin-catalog-header-row">
            <span>รหัสวิชา</span>
            <span>ชื่อวิชา</span>
            <span>ระดับชั้น</span>
            <span />
          </div>
          {filtered.map((entry) => (
            <SubjectCatalogRow key={entry.id} entry={entry} onDelete={removeCatalogEntry} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSettings() {
  const { state, isAdmin, unlockAdmin, updateRoundSettings, updateSchoolSettings, updateSlotDate, updateSlotTimes, addExamDay, removeExamDay, examMenuEnabled, toggleExamMenu } = useStore();
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Round settings
  const [name, setName] = useState(state.round?.name ?? "");
  const [opensAt, setOpensAt] = useState(isoToLocalInput(state.round?.submissionOpensAt ?? null));
  const [closesAt, setClosesAt] = useState(isoToLocalInput(state.round?.submissionClosesAt ?? null));

  const uniqueDays = [...new Set(state.slots.map((s) => s.day))].sort((a, b) => a - b);
  const [examDates, setExamDates] = useState<Record<number, string>>(() =>
    Object.fromEntries(uniqueDays.map((d) => [d, state.slots.find((s) => s.day === d)?.examDate ?? ""])),
  );
  const [gapMinutes, setGapMinutes] = useState(state.round?.gapMinutes ?? 15);
  const [slotTimes, setSlotTimes] = useState<Record<number, { morningStart: string; morningEnd: string; afternoonStart: string; afternoonEnd: string }>>(() =>
    Object.fromEntries(
      uniqueDays.map((d) => {
        const m = state.slots.find((s) => s.day === d && s.session === "morning");
        const a = state.slots.find((s) => s.day === d && s.session === "afternoon");
        return [d, {
          morningStart: m?.start ?? "08:30",
          morningEnd: m?.end ?? "11:30",
          afternoonStart: a?.start ?? "13:00",
          afternoonEnd: a?.end ?? "16:00",
        }];
      }),
    ),
  );

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add day modal
  const [showAddDay, setShowAddDay] = useState(false);
  const defaultMorningSlot = state.slots.find((s) => s.session === "morning");
  const defaultAfternoonSlot = state.slots.find((s) => s.session === "afternoon");
  const [addDayMorningStart, setAddDayMorningStart] = useState(defaultMorningSlot?.start ?? "08:30");
  const [addDayMorningEnd, setAddDayMorningEnd] = useState(defaultMorningSlot?.end ?? "11:30");
  const [addDayAfternoonStart, setAddDayAfternoonStart] = useState(defaultAfternoonSlot?.start ?? "13:00");
  const [addDayAfternoonEnd, setAddDayAfternoonEnd] = useState(defaultAfternoonSlot?.end ?? "16:00");
  const [addDaySaving, setAddDaySaving] = useState(false);
  const [addDayError, setAddDayError] = useState<string | null>(null);

  // Remove day state
  const [removingDay, setRemovingDay] = useState<number | null>(null);

  // New round modal
  const [showNewRound, setShowNewRound] = useState(false);
  const [newRoundYear, setNewRoundYear] = useState(state.round?.academicYear ?? "");
  const [newRoundSemester, setNewRoundSemester] = useState<1 | 2>(1);
  const [newRoundType, setNewRoundType] = useState<"mid" | "final">("mid");
  const [newRoundNameOverride, setNewRoundNameOverride] = useState("");
  const [newRoundOpensAt, setNewRoundOpensAt] = useState("");
  const [newRoundClosesAt, setNewRoundClosesAt] = useState("");
  const [newRoundSaving, setNewRoundSaving] = useState(false);
  const [newRoundError, setNewRoundError] = useState<string | null>(null);

  const newRoundAutoName = newRoundYear.trim()
    ? `สอบ${newRoundType === "mid" ? "กลางภาค" : "ปลายภาค"}เรียนที่ ${newRoundSemester}/${newRoundYear.trim()}`
    : "";
  const newRoundFinalName = newRoundNameOverride.trim() || newRoundAutoName;

  // School settings
  const [schoolName, setSchoolName] = useState(state.school?.schoolName ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(state.school?.logoUrl ?? null);
  const [schoolSaving, setSchoolSaving] = useState(false);
  const [schoolSaveMsg, setSchoolSaveMsg] = useState<string | null>(null);
  const [schoolSaveError, setSchoolSaveError] = useState<string | null>(null);

  async function handleCreateRound(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoundYear.trim()) {
      setNewRoundError("กรุณากรอกปีการศึกษา");
      return;
    }
    if (!state.round?.id) return;
    setNewRoundSaving(true);
    setNewRoundError(null);
    try {
      await createNewExamRound(state.round.id, {
        name: newRoundFinalName,
        academicYear: newRoundYear.trim(),
        semester: newRoundSemester,
        submissionOpensAt: newRoundOpensAt ? new Date(newRoundOpensAt).toISOString() : null,
        submissionClosesAt: newRoundClosesAt ? new Date(newRoundClosesAt).toISOString() : null,
      });
      window.location.reload();
    } catch (err) {
      setNewRoundError(err instanceof Error ? err.message : "สร้างรอบสอบไม่สำเร็จ กรุณาลองใหม่");
      setNewRoundSaving(false);
    }
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlockAdmin(password)) {
      setUnlockError(null);
      setPassword("");
    } else {
      setUnlockError("รหัสผ่านไม่ถูกต้อง");
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSchoolSaveError(null);
    try {
      const resized = await resizeImageToBase64(file);
      setLogoPreview(resized);
    } catch {
      setSchoolSaveError("ไม่สามารถอ่านไฟล์รูปภาพได้");
    }
    e.target.value = "";
  }

  async function handleSaveSchool(e: React.FormEvent) {
    e.preventDefault();
    setSchoolSaving(true);
    setSchoolSaveError(null);
    setSchoolSaveMsg(null);
    try {
      await updateSchoolSettings(schoolName.trim(), logoPreview);
      setSchoolSaveMsg("บันทึกข้อมูลโรงเรียนเรียบร้อยแล้ว");
    } catch (err) {
      setSchoolSaveError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSchoolSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveMsg(null);
    try {
      const currentDays = [...new Set(state.slots.map((s) => s.day))].sort((a, b) => a - b);
      await Promise.all([
        updateRoundSettings({
          name: name.trim(),
          submissionOpensAt: localInputToIso(opensAt),
          submissionClosesAt: localInputToIso(closesAt),
          gapMinutes,
        }),
        ...currentDays.map((day) => updateSlotDate(day, examDates[day] || null)),
        ...currentDays.flatMap((day) => {
          const times = slotTimes[day];
          if (!times) return [];
          return [
            updateSlotTimes(day, "morning", times.morningStart, times.morningEnd),
            updateSlotTimes(day, "afternoon", times.afternoonStart, times.afternoonEnd),
          ];
        }),
      ]);
      setSaveMsg("บันทึกการตั้งค่าเรียบร้อยแล้ว");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDay(e: React.FormEvent) {
    e.preventDefault();
    setAddDaySaving(true);
    setAddDayError(null);
    try {
      await addExamDay(addDayMorningStart, addDayMorningEnd, addDayAfternoonStart, addDayAfternoonEnd);
      const newDay = uniqueDays.length > 0 ? uniqueDays[uniqueDays.length - 1] + 1 : 1;
      setSlotTimes((prev) => ({
        ...prev,
        [newDay]: {
          morningStart: addDayMorningStart,
          morningEnd: addDayMorningEnd,
          afternoonStart: addDayAfternoonStart,
          afternoonEnd: addDayAfternoonEnd,
        },
      }));
      setExamDates((prev) => ({ ...prev, [newDay]: "" }));
      setShowAddDay(false);
    } catch (err) {
      setAddDayError(err instanceof Error ? err.message : "เพิ่มวันสอบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setAddDaySaving(false);
    }
  }

  async function handleRemoveDay(day: number) {
    setRemovingDay(day);
    try {
      await removeExamDay(day);
      setExamDates((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
      setSlotTimes((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "ลบวันสอบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setRemovingDay(null);
    }
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="page-header">
          <h1>ตั้งค่ารอบสอบ</h1>
        </div>
        <form className="card admin-unlock-card" onSubmit={handleUnlock}>
          <div className="admin-unlock-title">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</div>
          <input
            className="tform-input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setUnlockError(null);
            }}
            placeholder="รหัสผ่านผู้ดูแลระบบ"
          />
          {unlockError && <div className="tform-error">{unlockError}</div>}
          <button type="submit" className="btn btn-primary">
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h1>ตั้งค่ารอบสอบ</h1>
          <div className="page-subtitle">แก้ไขชื่อโรงเรียน โลโก้ รอบสอบ ช่วงเวลาที่เปิดรับข้อมูล และตัวเลือกในฟอร์มสำรวจ</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setShowNewRound(true); setNewRoundError(null); }}>
          + สร้างรอบสอบใหม่
        </button>
      </div>

      {showAddDay && createPortal(
        <div className="admin-modal-overlay" onClick={() => !addDaySaving && setShowAddDay(false)}>
          <form className="admin-modal card" onClick={(e) => e.stopPropagation()} onSubmit={handleAddDay}>
            <div className="admin-modal-title">เพิ่มวันสอบ</div>
            {addDayError && <div className="tform-error">{addDayError}</div>}
            <div className="tform-row-2">
              <label className="tform-field">
                <span className="tform-label">เช้า เริ่ม</span>
                <input className="tform-input" type="time" value={addDayMorningStart} onChange={(e) => setAddDayMorningStart(e.target.value)} disabled={addDaySaving} />
              </label>
              <label className="tform-field">
                <span className="tform-label">เช้า สิ้นสุด</span>
                <input className="tform-input" type="time" value={addDayMorningEnd} onChange={(e) => setAddDayMorningEnd(e.target.value)} disabled={addDaySaving} />
              </label>
            </div>
            <div className="tform-row-2">
              <label className="tform-field">
                <span className="tform-label">บ่าย เริ่ม</span>
                <input className="tform-input" type="time" value={addDayAfternoonStart} onChange={(e) => setAddDayAfternoonStart(e.target.value)} disabled={addDaySaving} />
              </label>
              <label className="tform-field">
                <span className="tform-label">บ่าย สิ้นสุด</span>
                <input className="tform-input" type="time" value={addDayAfternoonEnd} onChange={(e) => setAddDayAfternoonEnd(e.target.value)} disabled={addDaySaving} />
              </label>
            </div>
            <div className="tform-hint">ระบบจะกำหนดเป็นวันที่ {uniqueDays.length > 0 ? uniqueDays[uniqueDays.length - 1] + 1 : 1} โดยอัตโนมัติ</div>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddDay(false)} disabled={addDaySaving}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={addDaySaving}>
                {addDaySaving ? "กำลังเพิ่ม…" : "เพิ่มวันสอบ"}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {showNewRound && createPortal(
        <div className="admin-modal-overlay" onClick={() => !newRoundSaving && setShowNewRound(false)}>
          <form className="admin-modal card" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateRound}>
            <div className="admin-modal-title">สร้างรอบสอบใหม่</div>
            <div className="admin-modal-warn">
              รอบสอบปัจจุบัน "<strong>{state.round?.name}</strong>" จะถูกปิด — ข้อมูลเดิมยังคงอยู่ในฐานข้อมูล
            </div>
            {newRoundError && <div className="tform-error">{newRoundError}</div>}

            <div className="tform-row-2">
              <label className="tform-field">
                <span className="tform-label">ปีการศึกษา</span>
                <input
                  className="tform-input"
                  value={newRoundYear}
                  onChange={(e) => setNewRoundYear(e.target.value)}
                  placeholder="2569"
                  disabled={newRoundSaving}
                  autoFocus
                />
              </label>
              <div className="tform-field">
                <span className="tform-label">ภาคเรียนที่</span>
                <div className="tform-chip-row">
                  {([1, 2] as const).map((s) => (
                    <button key={s} type="button"
                      className={"tform-chip" + (newRoundSemester === s ? " selected" : "")}
                      onClick={() => setNewRoundSemester(s)} disabled={newRoundSaving}>
                      ภาคเรียนที่ {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="tform-field">
              <span className="tform-label">ประเภทการสอบ</span>
              <div className="tform-chip-row">
                <button type="button"
                  className={"tform-chip" + (newRoundType === "mid" ? " selected" : "")}
                  onClick={() => setNewRoundType("mid")} disabled={newRoundSaving}>
                  กลางภาค
                </button>
                <button type="button"
                  className={"tform-chip" + (newRoundType === "final" ? " selected" : "")}
                  onClick={() => setNewRoundType("final")} disabled={newRoundSaving}>
                  ปลายภาค
                </button>
              </div>
            </div>

            {newRoundAutoName && (
              <div className="admin-modal-name-preview">
                ชื่อที่จะใช้: <strong>{newRoundFinalName}</strong>
              </div>
            )}

            <label className="tform-field">
              <span className="tform-label">ชื่อการจัดสอบ <span className="tform-label-note">(เว้นว่างเพื่อใช้ชื่ออัตโนมัติ)</span></span>
              <input
                className="tform-input"
                value={newRoundNameOverride}
                onChange={(e) => setNewRoundNameOverride(e.target.value)}
                placeholder={newRoundAutoName}
                disabled={newRoundSaving}
              />
            </label>

            <div className="tform-row-2">
              <label className="tform-field">
                <span className="tform-label">เปิดรับข้อมูลตั้งแต่ <span className="tform-label-note">(ถ้ามี)</span></span>
                <input className="tform-input" type="datetime-local" value={newRoundOpensAt} onChange={(e) => setNewRoundOpensAt(e.target.value)} disabled={newRoundSaving} />
              </label>
              <label className="tform-field">
                <span className="tform-label">ปิดรับข้อมูลเมื่อ <span className="tform-label-note">(ถ้ามี)</span></span>
                <input className="tform-input" type="datetime-local" value={newRoundClosesAt} onChange={(e) => setNewRoundClosesAt(e.target.value)} disabled={newRoundSaving} />
              </label>
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowNewRound(false)} disabled={newRoundSaving}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary" disabled={newRoundSaving || !newRoundYear.trim()}>
                {newRoundSaving ? "กำลังสร้าง…" : "สร้างรอบสอบใหม่"}
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      <div className="admin-settings-grid">
      {/* School info */}
      <form className="card admin-settings-card" onSubmit={handleSaveSchool}>
        <div className="admin-section-heading">ข้อมูลโรงเรียน</div>
        {schoolSaveMsg && <div className="tform-success">✓ {schoolSaveMsg}</div>}
        {schoolSaveError && <div className="tform-error">{schoolSaveError}</div>}

        <label className="tform-field">
          <span className="tform-label">ชื่อโรงเรียน</span>
          <input
            className="tform-input"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="โรงเรียนตาเบาวิทยา"
            disabled={schoolSaving}
          />
        </label>

        <div className="tform-field">
          <span className="tform-label">โลโก้โรงเรียน</span>
          <div className="admin-logo-row">
            {logoPreview && <img className="admin-logo-preview" src={logoPreview} alt="โลโก้โรงเรียน" />}
            <label className="btn btn-ghost admin-logo-upload-btn">
              {logoPreview ? "เปลี่ยนรูป…" : "เลือกรูปภาพ…"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoChange} disabled={schoolSaving} />
            </label>
            {logoPreview && (
              <button
                type="button"
                className="btn btn-ghost admin-logo-remove-btn"
                onClick={() => setLogoPreview(null)}
                disabled={schoolSaving}
              >
                ลบโลโก้
              </button>
            )}
          </div>
          <div className="tform-hint">รองรับ PNG, JPG — ระบบย่อขนาดอัตโนมัติ แนะนำ 400×400px ขึ้นไป</div>
        </div>

        <div className="tform-actions">
          <button type="submit" className="btn btn-primary" disabled={schoolSaving}>
            {schoolSaving ? "กำลังบันทึก…" : "บันทึกข้อมูลโรงเรียน"}
          </button>
        </div>
      </form>

      {/* Round settings */}
      <form className="card admin-settings-card" onSubmit={handleSave}>
        <div className="admin-section-heading">การตั้งค่ารอบสอบ</div>
        {saveMsg && <div className="tform-success">✓ {saveMsg}</div>}
        {saveError && <div className="tform-error">{saveError}</div>}

        <label className="tform-field">
          <span className="tform-label">ชื่อการจัดสอบ</span>
          <input
            className="tform-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="สอบปลายภาคเรียนที่ 1/2569"
          />
        </label>

        <div className="tform-row-2">
          <label className="tform-field">
            <span className="tform-label">เปิดรับข้อมูลตั้งแต่</span>
            <input className="tform-input" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          </label>
          <label className="tform-field">
            <span className="tform-label">ปิดรับข้อมูลเมื่อ</span>
            <input className="tform-input" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </label>
        </div>
        <div className="tform-hint">เว้นว่างช่องใดช่องหนึ่งได้ ถ้ายังไม่ต้องการจำกัดเวลาเปิด/ปิดรับข้อมูล</div>

        <div className="admin-exam-days">
          {uniqueDays.map((day) => {
            const times = slotTimes[day] ?? { morningStart: "08:30", morningEnd: "11:30", afternoonStart: "13:00", afternoonEnd: "16:00" };
            return (
              <div key={day} className="admin-exam-day-block">
                <div className="admin-exam-day-block-header">
                  <span className="tform-label" style={{ marginBottom: 0 }}>วันที่ {day}</span>
                  {uniqueDays.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost admin-exam-day-remove"
                      onClick={() => handleRemoveDay(day)}
                      disabled={saving || removingDay === day}
                    >
                      {removingDay === day ? "…" : "ลบวัน"}
                    </button>
                  )}
                </div>
                <div className="tform-row-2">
                  <label className="tform-field">
                    <span className="tform-label">ช่วงเช้า เริ่ม</span>
                    <input className="tform-input" type="time" value={times.morningStart}
                      onChange={(e) => setSlotTimes((p) => ({ ...p, [day]: { ...times, morningStart: e.target.value } }))}
                      disabled={saving} />
                  </label>
                  <label className="tform-field">
                    <span className="tform-label">ช่วงเช้า สิ้นสุด</span>
                    <input className="tform-input" type="time" value={times.morningEnd}
                      onChange={(e) => setSlotTimes((p) => ({ ...p, [day]: { ...times, morningEnd: e.target.value } }))}
                      disabled={saving} />
                  </label>
                </div>
                <div className="tform-row-2">
                  <label className="tform-field">
                    <span className="tform-label">ช่วงบ่าย เริ่ม</span>
                    <input className="tform-input" type="time" value={times.afternoonStart}
                      onChange={(e) => setSlotTimes((p) => ({ ...p, [day]: { ...times, afternoonStart: e.target.value } }))}
                      disabled={saving} />
                  </label>
                  <label className="tform-field">
                    <span className="tform-label">ช่วงบ่าย สิ้นสุด</span>
                    <input className="tform-input" type="time" value={times.afternoonEnd}
                      onChange={(e) => setSlotTimes((p) => ({ ...p, [day]: { ...times, afternoonEnd: e.target.value } }))}
                      disabled={saving} />
                  </label>
                </div>
                <label className="tform-field">
                  <span className="tform-label">วันที่ในปฏิทิน <span className="tform-label-note">(แสดงในตาราง)</span></span>
                  <input className="tform-input" type="date" value={examDates[day] ?? ""}
                    onChange={(e) => setExamDates((prev) => ({ ...prev, [day]: e.target.value }))}
                    disabled={saving} />
                </label>
              </div>
            );
          })}
        </div>
        <div className="tform-hint">วันที่สอบจะแสดงในแดชบอร์ดและตารางสอบเผยแพร่</div>

        <label className="tform-field">
          <span className="tform-label">เวลาพักระหว่างวิชา <span className="tform-label-note">(นาที)</span></span>
          <input
            className="tform-input admin-gap-input"
            type="number"
            min="0"
            max="120"
            value={gapMinutes}
            onChange={(e) => setGapMinutes(Math.max(0, Math.min(120, Number(e.target.value))))}
            disabled={saving}
          />
        </label>
        <div className="tform-hint">เวลาพักระหว่าง 2 วิชาที่สอบต่อกันในช่องเดียวกัน ค่าเริ่มต้น 15 นาที</div>
        <button
          type="button"
          className="btn btn-ghost admin-add-day-btn"
          onClick={() => { setShowAddDay(true); setAddDayError(null); }}
          disabled={saving}
        >
          + เพิ่มวันสอบ
        </button>

        <div className="tform-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
          </button>
        </div>
      </form>
      </div>

      <div className="card admin-menu-toggle-card">
        <div className="admin-opt-section-title" style={{ marginBottom: 4 }}>การตั้งค่าเมนู</div>
        <label className="admin-menu-toggle-row">
          <div className="admin-menu-toggle-info">
            <div className="admin-menu-toggle-label">เมนู "ส่งข้อสอบ"</div>
            <div className="admin-menu-toggle-sub">เปิดให้ครูอัพโหลดไฟล์ข้อสอบ PDF เพื่อสำเนาและตรวจต้นฉบับ</div>
          </div>
          <button
            type="button"
            className={"sched-toggle" + (examMenuEnabled ? " on" : "")}
            onClick={toggleExamMenu}
            aria-pressed={examMenuEnabled}
          >
            <div className="sched-toggle-knob" />
          </button>
        </label>
      </div>

      <div className="admin-opt-section">
        <div className="admin-opt-section-title">รายวิชาในระบบ</div>
        <div className="admin-opt-section-sub">จัดการรายวิชาที่ใช้เป็น Autocomplete ในฟอร์มสำรวจ</div>
      </div>

      <SubjectCatalogSection />

      <div className="admin-opt-section">
        <div className="admin-opt-section-title">ตัวเลือกในฟอร์มสำรวจ</div>
        <div className="admin-opt-section-sub">กำหนดว่าครูจะเลือกอะไรได้บ้างในแบบสำรวจการจัดสอบ</div>
      </div>

      <div className="admin-opt-grid">
        <OptionCategorySection
          category="grade"
          title="ระดับชั้น"
          hint="เปิด/ปิด แก้ไขป้ายชื่อ และจัดลำดับได้ — ไม่รองรับเพิ่ม/ลบ เพราะผูกกับโครงตารางจัดสอบทั้งระบบ"
          allowAddRemove={false}
          withIcon={false}
        />
        <OptionCategorySection
          category="room"
          title="ห้องที่จัดสอบ"
          hint="เปิด/ปิด เพิ่ม ลบ แก้ไข และจัดลำดับห้องที่ให้เลือกในฟอร์มได้อย่างอิสระ"
          allowAddRemove={true}
          withIcon={false}
        />
        <OptionCategorySection
          category="duration"
          title="เวลาที่ใช้สอบ"
          hint="เปิด/ปิด เพิ่ม ลบ แก้ไข ตัวเลือกเวลาสอบ (นาที) — ครูยังกำหนดเวลาเองนอกเหนือจากนี้ได้เสมอ"
          allowAddRemove={true}
          withIcon={false}
        />
        <OptionCategorySection
          category="preference"
          title="ช่วงเวลาที่เหมาะสมในการสอบ"
          hint="เปิด/ปิด แก้ไขป้ายชื่อ/ไอคอน และจัดลำดับได้ — ไม่รองรับเพิ่ม/ลบ เพราะระบบจัดอัตโนมัติผูกความหมายกับ 3 ตัวเลือกนี้โดยตรง"
          allowAddRemove={false}
          withIcon={true}
        />
      </div>
    </div>
  );
}
