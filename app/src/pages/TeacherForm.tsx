import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useActiveFormOptions, useCatalog, useStore, useSubmissions } from "../data/store";
import { gradeLabel } from "../data/mockData";
import type { Grade, MorningPreference, Submission, SubmissionStatus } from "../data/types";
import { formatRelativeTime, formatThaiDateTime } from "../lib/time";
import { useCountdown } from "../lib/useCountdown";
import "./TeacherForm.css";

function statusLabel(status: SubmissionStatus): { text: string; className: string } {
  if (status === "scheduled") return { text: "จัดตารางแล้ว", className: "badge-green" };
  return { text: "รอจัดตาราง", className: "badge-orange" };
}

type RoomsSelection = number[] | "all" | null;

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
  const gradeOptions = useActiveFormOptions("grade");
  const roomOptions = useActiveFormOptions("room");
  const durationOptions = useActiveFormOptions("duration");
  const preferenceOptions = useActiveFormOptions("preference");
  const knownSubjects = useMemo(() => dedupeCatalog(catalog), [catalog]);

  const examTitle = state.round?.name ?? "";
  const schoolName = state.school?.schoolName ?? "";
  const deadline = formatThaiDateTime(state.round?.submissionClosesAt);
  const countdown = useCountdown(state.round?.submissionClosesAt);
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
  const [roomsSelection, setRoomsSelection] = useState<RoomsSelection>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState("");
  const [preference, setPreference] = useState<MorningPreference | null>(null);
  const [submittedMsg, setSubmittedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeSuggestField, setActiveSuggestField] = useState<"code" | "subjectName" | null>(null);
  const [selfScheduled, setSelfScheduled] = useState(false);
  const [selfScheduledNote, setSelfScheduledNote] = useState("");

  useEffect(() => {
    if (!submittedMsg) return;
    const t = setTimeout(() => setSubmittedMsg(null), 4000);
    return () => clearTimeout(t);
  }, [submittedMsg]);

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
    setRoomsSelection((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const next = current.includes(room) ? current.filter((r) => r !== room) : [...current, room].sort((a, b) => a - b);
      return next;
    });
  }

  function resetForm() {
    setTeacherName("");
    setCode("");
    setSubjectName("");
    setGrade(null);
    setRoomsSelection(null);
    setDuration(null);
    setCustomDuration("");
    setPreference(null);
    setSelfScheduled(false);
    setSelfScheduledNote("");
  }

  const finalDuration = duration ?? Number(customDuration);
  const isRoomsValid = roomsSelection === "all" || (Array.isArray(roomsSelection) && roomsSelection.length > 0);
  const isComplete = selfScheduled
    ? !!teacherName.trim()
    : !!teacherName.trim() && !!code.trim() && !!subjectName.trim() && !!grade && isRoomsValid && finalDuration > 0 && !!preference;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (windowClosed) {
      setError(windowMessage);
      return;
    }
    if (!isComplete) {
      setError(selfScheduled ? "กรุณากรอกชื่อครูผู้สอน" : "กรุณากรอกข้อมูลให้ครบทุกช่องก่อนส่งข้อมูล");
      setSubmittedMsg(null);
      return;
    }
    setError(null);
    setShowConfirm(true);
  }

  async function doSubmit() {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      await submit({
        code: selfScheduled ? "–" : code.trim(),
        subjectName: selfScheduled ? "จัดสอบเอง" : subjectName.trim(),
        teacherName: teacherName.trim(),
        grade: selfScheduled ? 1 : grade!,
        rooms: selfScheduled ? [] : (roomsSelection === "all" ? [] : (roomsSelection ?? [])),
        durationMinutes: selfScheduled ? 60 : finalDuration,
        morningPreference: selfScheduled ? "none" : (preference ?? "none"),
        selfScheduled,
        selfScheduledNote: selfScheduledNote.trim(),
      });
      setSubmittedMsg(
        selfScheduled
          ? "ส่งคำขอจัดสอบนอกตารางเรียบร้อยแล้ว"
          : `ส่งข้อมูลวิชา ${code.trim()} ${subjectName.trim()} เรียบร้อยแล้ว`,
      );
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
        {state.school?.logoUrl ? (
          <img className="shell-logo shell-logo-img" src={state.school.logoUrl} alt="โลโก้โรงเรียน" />
        ) : (
          <div className="shell-logo">ตบ</div>
        )}
        <div className="tform-topbar-title">แบบสำรวจการจัดสอบ · {schoolName}</div>
        <div className="tform-topbar-period">{examTitle}</div>
        <Link to="/" className="tform-topbar-home">← หน้าหลัก</Link>
      </div>

      <div className="tform-wrap">
        <form className="tform-card card" onSubmit={handleSubmit}>
          <div>
            <div className="tform-title">กรอกข้อมูลรายวิชาที่จัดสอบ</div>
            <div className="tform-subtitle">
              กรอก 1 ฟอร์มต่อ 1 รายวิชา ต้องกรอกครบทุกช่องจึงจะส่งข้อมูลได้
            </div>
            {deadline && (
              <div className="tform-deadline">
                <span className="tform-deadline-icon">!</span>
                <span>
                  ส่งได้ถึงวันที่ {deadline}
                  {countdown && !countdown.expired && (
                    <span className={"tform-deadline-countdown" + (countdown.urgent ? " urgent" : "")}>
                      {countdown.days > 0
                        ? ` · เหลือ ${countdown.days} วัน ${String(countdown.hours).padStart(2, "0")}:${String(countdown.minutes).padStart(2, "0")}:${String(countdown.seconds).padStart(2, "0")}`
                        : ` · เหลือ ${String(countdown.hours).padStart(2, "0")}:${String(countdown.minutes).padStart(2, "0")}:${String(countdown.seconds).padStart(2, "0")}`}
                    </span>
                  )}
                  {countdown?.expired && <span className="tform-deadline-countdown urgent"> · หมดเวลาแล้ว</span>}
                </span>
              </div>
            )}
          </div>

          {windowMessage && <div className="tform-error">{windowMessage}</div>}
          {error && <div className="tform-error">{error}</div>}

          {teacherName.trim() && (
            <div className="tform-mysubs-inline">
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

          <div className="tform-self-sched">
            <label className="tform-self-sched-toggle">
              <input
                type="checkbox"
                checked={selfScheduled}
                onChange={(e) => setSelfScheduled(e.target.checked)}
              />
              <span className="tform-self-sched-label">ขอจัดสอบนอกตาราง (ครูจัดสอบเอง)</span>
            </label>
            {selfScheduled && (
              <div className="tform-self-sched-body">
                <div className="tform-self-sched-hint">เช่น สัปดาห์ที่ 2 ของภาคเรียน, ในห้องปฏิบัติการ ฯลฯ</div>
                <textarea
                  className="tform-input tform-self-sched-note"
                  rows={2}
                  placeholder="ระบุเหตุผลหรือช่วงเวลาที่ต้องการจัดสอบเอง…"
                  value={selfScheduledNote}
                  onChange={(e) => setSelfScheduledNote(e.target.value)}
                />
              </div>
            )}
          </div>

          {!selfScheduled && (
            <>
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
                  {gradeOptions.map((opt) => {
                    const g = Number(opt.value) as Grade;
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        className={"tform-chip" + (grade === g ? " selected" : "")}
                        onClick={() => setGrade(g)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tform-field">
                <span className="tform-label">
                  ห้องที่จัดสอบ <span className="tform-label-note">(เลือกได้หลายห้อง หรือเลือก "ทุกห้อง")</span>
                </span>
                <div className="tform-chip-row">
                  <button
                    type="button"
                    className={"tform-chip" + (roomsSelection === "all" ? " selected" : "")}
                    onClick={() => setRoomsSelection("all")}
                  >
                    ทุกห้อง
                  </button>
                  {roomOptions.map((opt) => {
                    const r = Number(opt.value);
                    const selected = Array.isArray(roomsSelection) && roomsSelection.includes(r);
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        className={"tform-chip" + (selected ? " selected" : "")}
                        onClick={() => toggleRoom(r)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tform-field">
                <span className="tform-label">เวลาที่ใช้สอบ</span>
                <div className="tform-chip-row">
                  {durationOptions.map((opt) => {
                    const d = Number(opt.value);
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        className={"tform-chip" + (duration === d ? " selected" : "")}
                        onClick={() => {
                          setDuration(d);
                          setCustomDuration("");
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
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
                  {preferenceOptions.map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      className={"tform-chip" + (preference === opt.value ? " selected" : "")}
                      onClick={() => setPreference(opt.value as MorningPreference)}
                    >
                      {opt.icon ? `${opt.icon} ` : ""}
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="tform-hint">เลือก "ควรสอบเช้า" สำหรับวิชาที่ต้องใช้สมาธิสูง เช่น คณิตศาสตร์ วิทยาศาสตร์</div>
              </div>
            </>
          )}

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
            <button type="submit" className="btn btn-primary" disabled={submitting || windowClosed || !isComplete}>
              {submitting ? "กำลังส่ง…" : "ส่งข้อมูล"}
            </button>
          </div>
        </form>

        {submittedMsg && createPortal(
          <div className="tform-toast" onClick={() => setSubmittedMsg(null)}>
            <span className="tform-toast-check">✓</span>
            {submittedMsg}
          </div>,
          document.body
        )}

        {showConfirm && createPortal(
          <div className="tform-confirm-overlay" onClick={() => setShowConfirm(false)}>
            <div className="tform-confirm-modal card" onClick={(e) => e.stopPropagation()}>
              <div className="tform-confirm-title">ยืนยันการส่งข้อมูล</div>
              <div className="tform-confirm-body">
                <div className="tform-confirm-row">
                  <span className="tform-confirm-label">ครูผู้สอน</span>
                  <span>{teacherName.trim()}</span>
                </div>
                {selfScheduled ? (
                  <>
                    <div className="tform-confirm-row">
                      <span className="tform-confirm-label">ประเภท</span>
                      <span className="tform-self-sched-badge">จัดสอบนอกตาราง</span>
                    </div>
                    {selfScheduledNote.trim() && (
                      <div className="tform-confirm-row">
                        <span className="tform-confirm-label">หมายเหตุ</span>
                        <span>{selfScheduledNote.trim()}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="tform-confirm-row">
                      <span className="tform-confirm-label">รหัสวิชา</span>
                      <span className="tform-confirm-code">{code.trim()}</span>
                    </div>
                    <div className="tform-confirm-row">
                      <span className="tform-confirm-label">ชื่อวิชา</span>
                      <span>{subjectName.trim()}</span>
                    </div>
                    <div className="tform-confirm-row">
                      <span className="tform-confirm-label">ระดับชั้น</span>
                      <span>{grade ? gradeLabel(grade) : ""}</span>
                    </div>
                    <div className="tform-confirm-row">
                      <span className="tform-confirm-label">ห้องสอบ</span>
                      <span>
                        {roomsSelection === "all"
                          ? "ทุกห้อง"
                          : Array.isArray(roomsSelection)
                            ? roomsSelection.map((r) => {
                                const opt = roomOptions.find((o) => Number(o.value) === r);
                                return opt ? opt.label : `ห้อง ${r}`;
                              }).join(", ")
                            : "—"}
                      </span>
                    </div>
                    <div className="tform-confirm-row">
                      <span className="tform-confirm-label">เวลาสอบ</span>
                      <span>{finalDuration} นาที</span>
                    </div>
                  </>
                )}
              </div>
              <div className="tform-confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowConfirm(false)}>
                  ยกเลิก
                </button>
                <button type="button" className="btn btn-primary" onClick={doSubmit} disabled={submitting}>
                  {submitting ? "กำลังส่ง…" : "ยืนยัน ส่งข้อมูล"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      </div>
    </div>
  );
}
