import { useMemo, useState } from "react";
import { useCatalog, useStore, useSubmissions } from "../data/store";
import { ROOMS_PER_GRADE, gradeLabel } from "../data/mockData";
import type { Grade, MorningPreference, Submission, SubmissionStatus } from "../data/types";
import { formatRelativeTime, formatThaiDateTime } from "../lib/time";
import "./TeacherForm.css";

function statusLabel(status: SubmissionStatus): { text: string; className: string } {
  if (status === "scheduled") return { text: "จัดตารางแล้ว", className: "badge-green" };
  return { text: "รอจัดตาราง", className: "badge-orange" };
}

const GRADE_OPTIONS: Grade[] = [1, 2, 3, 4, 5, 6];
const DURATION_OPTIONS = [30, 45, 60, 90, 120];
const ROOM_OPTIONS = Array.from({ length: ROOMS_PER_GRADE }, (_, i) => i + 1);

const PREFERENCE_OPTIONS: { value: MorningPreference; label: string; icon: string }[] = [
  { value: "morning", label: "ควรสอบเช้า", icon: "☀" },
  { value: "afternoon-ok", label: "บ่ายก็ได้", icon: "🌤" },
  { value: "none", label: "ไม่ระบุ", icon: "" },
];

// One suggestion per distinct subject_code+grade already known in the catalog.
function dedupeCatalog(catalog: Submission[]): Submission[] {
  const seen = new Map<string, Submission>();
  for (const s of catalog) {
    seen.set(`${s.code}_${s.grade}`, s);
  }
  return [...seen.values()];
}

export default function TeacherForm() {
  const { state, submit } = useStore();
  const catalog = useCatalog();
  const submissions = useSubmissions();
  const knownSubjects = useMemo(() => dedupeCatalog(catalog), [catalog]);

  const examTitle = state.round?.name ?? "";
  const schoolName = state.school?.schoolName ?? "";
  const deadline = formatThaiDateTime(state.round?.submissionClosesAt);
  const opensAt = state.round?.submissionOpensAt ? new Date(state.round.submissionOpensAt).getTime() : null;
  const closesAt = state.round?.submissionClosesAt ? new Date(state.round.submissionClosesAt).getTime() : null;
  const notYetOpen = opensAt !== null && Date.now() < opensAt;
  const alreadyClosed = closesAt !== null && Date.now() > closesAt;
  const windowClosed = notYetOpen || alreadyClosed;
  const windowMessage = notYetOpen
    ? `ยังไม่ถึงเวลาเปิดรับข้อมูล (เปิดรับ ${formatThaiDateTime(state.round?.submissionOpensAt)})`
    : alreadyClosed
      ? `ปิดรับข้อมูลแล้ว (ปิดรับเมื่อ ${deadline})`
      : null;

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
  const [submitting, setSubmitting] = useState(false);
  const [activeSuggestField, setActiveSuggestField] = useState<"code" | "subjectName" | null>(null);

  const mySubmissions = useMemo(() => {
    const q = teacherName.trim().toLowerCase();
    if (!q) return [];
    return submissions
      .filter((s) => s.teacherName.trim().toLowerCase() === q)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [submissions, teacherName]);

  const suggestions = useMemo(() => {
    if (!activeSuggestField) return [];
    const query = (activeSuggestField === "code" ? code : subjectName).trim().toLowerCase();
    if (!query) return [];
    return knownSubjects
      .filter((s) => s.code.toLowerCase().includes(query) || s.subjectName.toLowerCase().includes(query))
      .slice(0, 6);
  }, [activeSuggestField, code, subjectName, knownSubjects]);

  function applySuggestion(s: Submission) {
    setCode(s.code);
    setSubjectName(s.subjectName);
    setGrade(s.grade);
    if (!teacherName.trim()) setTeacherName(s.teacherName);
    setActiveSuggestField(null);
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (windowClosed) {
      setError(windowMessage);
      return;
    }
    const finalDuration = duration ?? Number(customDuration);
    if (!teacherName.trim() || !code.trim() || !subjectName.trim() || !grade || !finalDuration) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่องที่จำเป็น");
      setSubmittedMsg(null);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submit({
        code: code.trim(),
        subjectName: subjectName.trim(),
        teacherName: teacherName.trim(),
        grade,
        rooms,
        durationMinutes: finalDuration,
        morningPreference: preference,
      });
      setSubmittedMsg(`ส่งข้อมูลวิชา ${code.trim()} ${subjectName.trim()} เรียบร้อยแล้ว`);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="tform-page">
      <div className="tform-topbar">
        <div className="shell-logo">ตบ</div>
        <div className="tform-topbar-title">แบบสำรวจการจัดสอบ · {schoolName}</div>
        <div className="tform-topbar-period">{examTitle}</div>
      </div>

      <div className="tform-wrap">
        <form className="tform-card card" onSubmit={handleSubmit}>
          <div>
            <div className="tform-title">กรอกข้อมูลรายวิชาที่จัดสอบ</div>
            <div className="tform-subtitle">
              กรอก 1 ฟอร์มต่อ 1 รายวิชา{deadline ? ` · ส่งได้ถึงวันที่ ${deadline}` : ""}
            </div>
          </div>

          {windowMessage && <div className="tform-error">{windowMessage}</div>}
          {submittedMsg && <div className="tform-success">✓ {submittedMsg}</div>}
          {error && <div className="tform-error">{error}</div>}

          <label className="tform-field">
            <span className="tform-label">ชื่อครูผู้สอน</span>
            <input
              className="tform-input"
              list="teacher-names"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="เช่น นางสาวโสรดา ศรีสุข"
            />
            <datalist id="teacher-names">
              {state.teachers.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          <div className="tform-row-2 tform-row-suggest">
            <label className="tform-field">
              <span className="tform-label">รหัสวิชา</span>
              <input
                className="tform-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onFocus={() => setActiveSuggestField("code")}
                onBlur={() => setTimeout(() => setActiveSuggestField(null), 150)}
                placeholder="อ23101"
                autoComplete="off"
              />
              {activeSuggestField === "code" && suggestions.length > 0 && (
                <ul className="tform-suggest-list">
                  {suggestions.map((s) => (
                    <li key={`${s.code}_${s.grade}`}>
                      <button type="button" onMouseDown={() => applySuggestion(s)} className="tform-suggest-item">
                        <span className="tform-suggest-code">{s.code}</span>
                        <span className="tform-suggest-name">
                          {s.subjectName} · {gradeLabel(s.grade)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </label>
            <label className="tform-field">
              <span className="tform-label">ชื่อวิชา</span>
              <input
                className="tform-input"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                onFocus={() => setActiveSuggestField("subjectName")}
                onBlur={() => setTimeout(() => setActiveSuggestField(null), 150)}
                placeholder="ภาษาอังกฤษ 5"
                autoComplete="off"
              />
              {activeSuggestField === "subjectName" && suggestions.length > 0 && (
                <ul className="tform-suggest-list">
                  {suggestions.map((s) => (
                    <li key={`${s.code}_${s.grade}`}>
                      <button type="button" onMouseDown={() => applySuggestion(s)} className="tform-suggest-item">
                        <span className="tform-suggest-code">{s.code}</span>
                        <span className="tform-suggest-name">
                          {s.subjectName} · {gradeLabel(s.grade)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
            <button type="submit" className="btn btn-primary" disabled={submitting || windowClosed}>
              {submitting ? "กำลังส่ง…" : "ส่งข้อมูล"}
            </button>
          </div>
        </form>

        {teacherName.trim() && (
          <div className="tform-card card tform-mysubs">
            <div className="tform-mysubs-title">
              รายวิชาที่คุณส่งไปแล้ว <span className="tform-mysubs-count">({mySubmissions.length})</span>
            </div>
            {mySubmissions.length === 0 ? (
              <div className="tform-mysubs-empty">ยังไม่มีข้อมูลที่ส่งในชื่อ "{teacherName.trim()}"</div>
            ) : (
              <div className="tform-mysubs-list">
                {mySubmissions.map((s) => {
                  const badge = statusLabel(s.status);
                  return (
                    <div className="tform-mysubs-row" key={s.id}>
                      <div className="tform-mysubs-row-main">
                        <span className="tform-mysubs-code">{s.code}</span>
                        <span>{s.subjectName}</span>
                        <span className="tform-mysubs-grade">{gradeLabel(s.grade)}</span>
                      </div>
                      <div className="tform-mysubs-row-meta">
                        <span className={"badge " + badge.className}>{badge.text}</span>
                        <span className="tform-mysubs-time">{formatRelativeTime(s.submittedAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
