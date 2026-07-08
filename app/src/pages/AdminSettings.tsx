import { useState } from "react";
import { useFormOptions, useStore } from "../data/store";
import type { FormOption, FormOptionCategory } from "../data/types";
import "./AdminSettings.css";

// datetime-local inputs work in the browser's local time and expect/return
// "YYYY-MM-DDTHH:mm" with no timezone suffix.
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

export default function AdminSettings() {
  const { state, isAdmin, unlockAdmin, updateRoundSettings } = useStore();
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [name, setName] = useState(state.round?.name ?? "");
  const [opensAt, setOpensAt] = useState(isoToLocalInput(state.round?.submissionOpensAt ?? null));
  const [closesAt, setClosesAt] = useState(isoToLocalInput(state.round?.submissionClosesAt ?? null));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlockAdmin(password)) {
      setUnlockError(null);
      setPassword("");
    } else {
      setUnlockError("รหัสผ่านไม่ถูกต้อง");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveMsg(null);
    try {
      await updateRoundSettings({
        name: name.trim(),
        submissionOpensAt: localInputToIso(opensAt),
        submissionClosesAt: localInputToIso(closesAt),
      });
      setSaveMsg("บันทึกการตั้งค่าเรียบร้อยแล้ว");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
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
          <div className="page-subtitle">แก้ไขชื่อรอบสอบ ช่วงเวลาที่เปิดรับข้อมูล และตัวเลือกในฟอร์มสำรวจ</div>
        </div>
      </div>

      <form className="card admin-settings-card" onSubmit={handleSave}>
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
            <input
              className="tform-input"
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
            />
          </label>
          <label className="tform-field">
            <span className="tform-label">ปิดรับข้อมูลเมื่อ</span>
            <input
              className="tform-input"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </label>
        </div>
        <div className="tform-hint">เว้นว่างช่องใดช่องหนึ่งได้ ถ้ายังไม่ต้องการจำกัดเวลาเปิด/ปิดรับข้อมูล</div>

        <div className="tform-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
          </button>
        </div>
      </form>

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
