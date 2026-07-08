import { useState } from "react";
import { useStore } from "../data/store";
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
          <div className="page-subtitle">แก้ไขชื่อรอบสอบและช่วงเวลาที่เปิดรับข้อมูลจากครู</div>
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
    </div>
  );
}
