import { useState } from "react";
import { useStore } from "../data/store";
import { EXAM_TITLE, ROOMS_PER_GRADE, SCHOOL_NAME, SUBMISSION_DEADLINE, TEACHERS, gradeLabel } from "../data/mockData";
import type { Grade, MorningPreference, Submission } from "../data/types";
import "./TeacherForm.css";

const GRADE_OPTIONS: Grade[] = [1, 2, 3, 4, 5, 6];
const DURATION_OPTIONS = [30, 45, 60, 90, 120];
const ROOM_OPTIONS = Array.from({ length: ROOMS_PER_GRADE }, (_, i) => i + 1);

const PREFERENCE_OPTIONS: { value: MorningPreference; label: string; icon: string }[] = [
  { value: "morning", label: "ควรสอบเช้า", icon: "☀" },
  { value: "afternoon-ok", label: "บ่ายก็ได้", icon: "🌤" },
  { value: "none", label: "ไม่ระบุ", icon: "" },
];

export default function TeacherForm() {
  const { dispatch } = useStore();
  const [teacherName, setTeacherName] = useState("");
  const [code, setCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [rooms, setRooms] = useState<number[]>([]);
  const [duration, setDuration] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState("");
  const [preference, setPreference] = useState<MorningPreference>("none");
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleRoom(room: number) {
    setRooms((prev) => (prev.includes(room) ? prev.filter((r) => r !== room) : [...prev, room].sort((a, b) => a - b)));
  }

  function resetForm() {
    setTeacherName("");
    setCode("");
    setSubjectName("");
    setGrade(null);
    setRooms([]);
    setDuration(null);
    setCustomDuration("");
    setPreference("none");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalDuration = duration ?? Number(customDuration);
    if (!teacherName.trim() || !code.trim() || !subjectName.trim() || !grade || !finalDuration) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่องที่จำเป็น");
      setSubmittedMsg(null);
      return;
    }
    setError(null);

    const teacher = TEACHERS.find((t) => t.name === teacherName.trim());
    const submission: Submission = {
      id: `sub-${Date.now()}`,
      code: code.trim(),
      subjectName: subjectName.trim(),
      teacherId: teacher?.id ?? `custom-${teacherName.trim()}`,
      teacherName: teacherName.trim(),
      grade,
      rooms,
      durationMinutes: finalDuration,
      morningPreference: preference,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };
    dispatch({ type: "SUBMIT", submission });
    setSubmittedMsg(`ส่งข้อมูลวิชา ${code.trim()} ${subjectName.trim()} เรียบร้อยแล้ว`);
    resetForm();
  }

  return (
    <div className="tform-page">
      <div className="tform-topbar">
        <div className="shell-logo">ตบ</div>
        <div className="tform-topbar-title">แบบสำรวจการจัดสอบ · {SCHOOL_NAME}</div>
        <div className="tform-topbar-period">{EXAM_TITLE}</div>
      </div>

      <div className="tform-wrap">
        <form className="tform-card card" onSubmit={handleSubmit}>
          <div>
            <div className="tform-title">กรอกข้อมูลรายวิชาที่จัดสอบ</div>
            <div className="tform-subtitle">กรอก 1 ฟอร์มต่อ 1 รายวิชา · ส่งได้ถึงวันที่ {SUBMISSION_DEADLINE}</div>
          </div>

          {submittedMsg && <div className="tform-success">✓ {submittedMsg}</div>}
          {error && <div className="tform-error">{error}</div>}

          <label className="tform-field">
            <span className="tform-label">ชื่อครูผู้สอน</span>
            <input
              className="tform-input"
              list="teacher-names"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="เช่น นางสาวจันทร์เพ็ญ สุขใจ"
            />
            <datalist id="teacher-names">
              {TEACHERS.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </label>

          <div className="tform-row-2">
            <label className="tform-field">
              <span className="tform-label">รหัสวิชา</span>
              <input className="tform-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="อ23101" />
            </label>
            <label className="tform-field">
              <span className="tform-label">ชื่อวิชา</span>
              <input
                className="tform-input"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="ภาษาอังกฤษ 5"
              />
            </label>
          </div>

          <div className="tform-field">
            <span className="tform-label">ระดับชั้น</span>
            <div className="tform-chip-row">
              {GRADE_OPTIONS.map((g) => (
                <button
                  type="button"
                  key={g}
                  className={"tform-chip" + (grade === g ? " selected" : "")}
                  onClick={() => setGrade(g)}
                >
                  {gradeLabel(g)}
                </button>
              ))}
            </div>
          </div>

          <div className="tform-field">
            <span className="tform-label">
              ห้องที่จัดสอบ <span className="tform-label-note">(เลือกได้หลายห้อง ไม่เลือก = ทุกห้อง)</span>
            </span>
            <div className="tform-chip-row">
              {ROOM_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  className={"tform-chip" + (rooms.includes(r) ? " selected" : "")}
                  onClick={() => toggleRoom(r)}
                >
                  ห้อง {r}
                </button>
              ))}
            </div>
          </div>

          <div className="tform-field">
            <span className="tform-label">เวลาที่ใช้สอบ</span>
            <div className="tform-chip-row">
              {DURATION_OPTIONS.map((d) => (
                <button
                  type="button"
                  key={d}
                  className={"tform-chip" + (duration === d ? " selected" : "")}
                  onClick={() => {
                    setDuration(d);
                    setCustomDuration("");
                  }}
                >
                  {d} นาที
                </button>
              ))}
              <input
                className="tform-custom-duration"
                type="number"
                min={5}
                step={5}
                placeholder="กำหนดเอง…"
                value={customDuration}
                onChange={(e) => {
                  setCustomDuration(e.target.value);
                  setDuration(null);
                }}
              />
            </div>
          </div>

          <div className="tform-field">
            <span className="tform-label">
              ช่วงเวลาที่เหมาะสมในการสอบ <span className="tform-label-note">(ใช้จัดตารางอัตโนมัติ)</span>
            </span>
            <div className="tform-chip-row">
              {PREFERENCE_OPTIONS.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  className={"tform-chip" + (preference === p.value ? " selected" : "")}
                  onClick={() => setPreference(p.value)}
                >
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            <div className="tform-hint">เลือก "ควรสอบเช้า" สำหรับวิชาที่ต้องใช้สมาธิสูง เช่น คณิตศาสตร์ วิทยาศาสตร์</div>
          </div>

          <div className="tform-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSubmittedMsg("บันทึกร่างไว้แล้ว (ยังไม่ส่งข้อมูล)");
                setError(null);
              }}
            >
              บันทึกร่าง
            </button>
            <button type="submit" className="btn btn-primary">
              ส่งข้อมูล
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
