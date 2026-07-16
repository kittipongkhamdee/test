import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCellItems, useSubmissions, useStore, type AutoScheduleRules } from "../data/store";
import { computeCellTimes, timeToMinutes, minutesToTime } from "../data/scheduling";
import type { ExamDay, ExamSession, ExamSlotMeta, Grade, Submission } from "../data/types";
import { GRADES, cellKey, gradeLabel } from "../data/mockData";
import "./Scheduler.css";

const SESSIONS: ExamSession[] = ["morning", "afternoon"];

function dayLabel(slot: ExamSlotMeta | undefined, day: ExamDay): string {
  if (!slot?.examDate) return `วันที่ ${day}`;
  return new Date(slot.examDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function subjectChipLabel(s: Submission): string {
  return `${s.code} · ${gradeLabel(s.grade)}`;
}

export default function Scheduler() {
  const { state, dispatch, isAdmin, pushUndoSnapshot, undoSchedule, canUndo } = useStore();
  const submissions = useSubmissions();
  const days = useMemo(
    () => [...new Set(state.slots.map((s) => s.day))].sort((a, b) => a - b),
    [state.slots],
  );
  const pending = useMemo(
    () => submissions.filter((s) => s.status === "pending" && !s.selfScheduled).sort((a, b) => a.grade - b.grade),
    [submissions],
  );
  const scheduledCount = useMemo(
    () => submissions.filter((s) => s.status === "scheduled" && !s.selfScheduled).length,
    [submissions],
  );
  const totalSchedulable = useMemo(
    () => submissions.filter((s) => !s.selfScheduled).length,
    [submissions],
  );
  const conflictCount = useMemo(() => {
    let n = 0;
    for (const day of days) {
      for (const session of (["morning", "afternoon"] as ExamSession[])) {
        for (const grade of GRADES) {
          const ids = state.cellOrder[cellKey(grade, day, session)] ?? [];
          if (ids.length < 2) continue;
          const items = ids.map((id) => state.submissions[id]).filter(Boolean);
          const slot = state.slots.find((s) => s.day === day && s.session === session);
          const times = computeCellTimes(items, slot?.start ?? "08:30", state.round?.gapMinutes ?? 15);
          n += times.filter((t) => t.conflict).length;
        }
      }
    }
    return n;
  }, [state.cellOrder, state.submissions, state.slots, days]);

  const [traySearch, setTraySearch] = useState("");
  const [trayGrade, setTrayGrade] = useState<number | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [rules, setRules] = useState<AutoScheduleRules>({
    morningFirst: true,
    balanceLoad: true,
    spreadHeavy: false,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [mobileSlot, setMobileSlot] = useState<{ day: ExamDay; session: ExamSession }>({
    day: 1,
    session: "morning",
  });

  const filteredPending = useMemo(() => {
    let list = pending;
    if (trayGrade !== null) list = list.filter((s) => s.grade === trayGrade);
    const q = traySearch.trim().toLowerCase();
    if (q) list = list.filter((s) => s.code.toLowerCase().includes(q) || s.subjectName.toLowerCase().includes(q));
    return list;
  }, [pending, traySearch, trayGrade]);

  const morningPrefCount = pending.filter((p) => p.morningPreference === "morning").length;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undoSchedule();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canUndo, undoSchedule]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  function requireAdmin(): boolean {
    if (!isAdmin) {
      showToast("ต้องเข้าสู่โหมดผู้ดูแลระบบก่อนจึงจะจัดตารางสอบได้");
      return false;
    }
    return true;
  }

  function handleAutoSchedule() {
    if (!requireAdmin()) return;
    pushUndoSnapshot();
    dispatch({ type: "AUTO_SCHEDULE", rules });
    setAutoOpen(false);
    showToast("จัดตารางอัตโนมัติเรียบร้อยแล้ว — ยังลาก/แก้ไขได้ทุกช่อง");
  }

  function handleClear() {
    if (!requireAdmin()) return;
    if (scheduledCount === 0) return;
    setConfirmClear(true);
  }

  function handleConfirmClear() {
    pushUndoSnapshot();
    dispatch({ type: "CLEAR_SCHEDULE" });
    setConfirmClear(false);
    showToast("ล้างตารางแล้ว");
  }

  function handlePublish() {
    showToast("บันทึกและเผยแพร่ตารางสอบเรียบร้อยแล้ว");
  }

  function handleDropOnCell(e: React.DragEvent, grade: Grade, day: ExamDay, session: ExamSession, index?: number) {
    e.preventDefault();
    if (!requireAdmin()) return;
    const id = e.dataTransfer.getData("text/plain");
    const sub = state.submissions[id];
    if (!sub || sub.grade !== grade) return;
    pushUndoSnapshot();
    dispatch({ type: "PLACE", id, day, session, index });
  }

  function handleMobilePlace(grade: Grade) {
    if (!requireAdmin()) return;
    if (!selectedPendingId) return;
    const sub = state.submissions[selectedPendingId];
    if (!sub) return;
    if (sub.grade !== grade) {
      showToast(`วางได้เฉพาะช่อง ${gradeLabel(sub.grade)} เท่านั้น`);
      return;
    }
    pushUndoSnapshot();
    dispatch({ type: "PLACE", id: selectedPendingId, day: mobileSlot.day, session: mobileSlot.session });
    setSelectedPendingId(null);
  }

  return (
    <div className="sched-page">
      <div className="sched-header">
        <div>
          <h1>จัดตารางสอบ</h1>
          <div className="page-subtitle">จัดอัตโนมัติได้ในคลิกเดียว แล้วลากปรับแก้ต่อได้ · ระบบเตือนเมื่อเวลาซ้อนกัน</div>
        </div>
        <div className="sched-header-actions">
          <button className="btn btn-ghost" onClick={handleClear} disabled={!isAdmin}>
            ล้างตาราง
          </button>
          <button
            className="btn btn-ghost sched-undo-btn"
            onClick={undoSchedule}
            disabled={!canUndo}
            title="ย้อนกลับ (Ctrl+Z)"
          >
            ↩ ย้อนกลับ
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()} title="พิมพ์ตารางสอบ">
            🖨 พิมพ์
          </button>
          <div className="sched-auto-wrap">
            <button className="btn btn-success" onClick={() => (requireAdmin() ? setAutoOpen((v) => !v) : undefined)}>
              ⚡ จัดอัตโนมัติ ▾
            </button>
            {autoOpen && (
              <div className="sched-auto-popover card">
                <div className="sched-auto-title">จัดตารางอัตโนมัติ</div>
                <div className="sched-auto-sub">ระบบจะจัดตามกฎด้านล่าง แล้วคุณปรับแก้ต่อได้</div>
                <div className="sched-auto-rules">
                  <RuleToggle
                    label={
                      <>
                        จัดวิชาที่ระบุ <b>"ควรสอบเช้า"</b> ลงช่วงเช้าก่อน
                      </>
                    }
                    checked={rules.morningFirst}
                    onChange={(v) => setRules((r) => ({ ...r, morningFirst: v }))}
                  />
                  <RuleToggle
                    label="กระจายภาระให้สมดุลในแต่ละวัน/ช่วงเวลา"
                    checked={rules.balanceLoad}
                    onChange={(v) => setRules((r) => ({ ...r, balanceLoad: v }))}
                  />
                  <RuleToggle
                    label="กระจายวิชาหนัก (≥90 นาที) ไม่ให้ซ้ำวัน"
                    checked={rules.spreadHeavy}
                    onChange={(v) => setRules((r) => ({ ...r, spreadHeavy: v }))}
                  />
                </div>
                <div className="sched-auto-note">
                  มี {pending.length} วิชารอจัด · {morningPrefCount} วิชาระบุให้สอบเช้า
                </div>
                <button className="btn btn-success sched-auto-run" onClick={handleAutoSchedule} disabled={pending.length === 0}>
                  ⚡ เริ่มจัดอัตโนมัติ
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={handlePublish}>
            บันทึกและเผยแพร่
          </button>
        </div>
      </div>

      {!isAdmin && (
        <div className="sched-locked-banner">
          🔒 ดูตารางได้ตามปกติ แต่ต้อง<b>เข้าสู่โหมดผู้ดูแลระบบ</b>ก่อนจึงจะลาก/แก้ไข/จัดอัตโนมัติได้
        </div>
      )}

      {toast && <div className="sched-toast">{toast}</div>}

      {/* ---------- Progress summary ---------- */}
      <div className="sched-summary">
        <div className="sched-summary-left">
          <span className="sched-summary-label">จัดแล้ว</span>
          <span className="sched-summary-fraction">{scheduledCount}/{totalSchedulable} วิชา</span>
          <div className="sched-summary-bar">
            <div
              className="sched-summary-fill"
              style={{ width: totalSchedulable > 0 ? `${(scheduledCount / totalSchedulable) * 100}%` : "0%" }}
            />
          </div>
        </div>
        <div className="sched-summary-right">
          {conflictCount > 0 && (
            <span className="sched-summary-badge conflict">⚠ {conflictCount} ข้อขัดแย้ง</span>
          )}
          {scheduledCount === totalSchedulable && totalSchedulable > 0 && (
            <span className="sched-summary-badge done">✓ จัดครบทุกวิชาแล้ว</span>
          )}
          {scheduledCount < totalSchedulable && (
            <span className="sched-summary-badge pending">รอจัดอีก {totalSchedulable - scheduledCount} วิชา</span>
          )}
        </div>
      </div>

      {/* ---------- Desktop: drag & drop grid ---------- */}
      <div className="sched-desktop">
        <div className="card sched-tray">
          <div className="sched-tray-head">
            <span>รอจัดลงตาราง</span>
            <span className="sched-tray-count">{pending.length}</span>
          </div>
          <div className="sched-tray-search-wrap">
            <input
              className="sched-tray-search"
              type="text"
              placeholder="ค้นหารหัส/ชื่อวิชา…"
              value={traySearch}
              onChange={(e) => setTraySearch(e.target.value)}
            />
          </div>
          <div className="sched-tray-grade-filter">
            <button
              className={"sched-tray-grade-chip" + (trayGrade === null ? " active" : "")}
              onClick={() => setTrayGrade(null)}
            >
              ทั้งหมด
            </button>
            {GRADES.map((g) => {
              const count = pending.filter((s) => s.grade === g).length;
              if (count === 0) return null;
              return (
                <button
                  key={g}
                  className={"sched-tray-grade-chip" + (trayGrade === g ? " active" : "")}
                  onClick={() => setTrayGrade(trayGrade === g ? null : g)}
                >
                  {gradeLabel(g)}
                  <span className="sched-tray-grade-count">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="sched-tray-list">
            {filteredPending.map((s) => (
              <div
                key={s.id}
                className="sched-tray-item"
                draggable={isAdmin}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
              >
                <span className="sched-drag-handle">⠿</span>
                <div className="sched-tray-item-info">
                  <div className="sched-tray-item-title">
                    <span>{subjectChipLabel(s)}</span>
                    {s.morningPreference === "morning" && <span className="badge badge-amber">เช้า</span>}
                  </div>
                  <div className="sched-tray-item-sub">
                    {s.subjectName} · {s.durationMinutes} นาที
                  </div>
                </div>
              </div>
            ))}
            {filteredPending.length === 0 && pending.length > 0 && (
              <div className="sched-tray-empty">ไม่พบวิชาที่ค้นหา</div>
            )}
            {pending.length === 0 && <div className="sched-tray-empty">จัดครบทุกวิชาแล้ว 🎉</div>}
          </div>
        </div>

        <div className="card sched-grid-wrap">
          <div className="sched-timeline-panels">
            {days.flatMap((day) =>
              SESSIONS.map((session) => {
                const slot = state.slots.find((s) => s.day === day && s.session === session);
                return (
                  <TimelinePanel
                    key={`${day}-${session}`}
                    day={day}
                    session={session}
                    slot={slot}
                    dateLabel={dayLabel(slot, day)}
                    onDropCell={handleDropOnCell}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      {/* ---------- Mobile: tap-to-place ---------- */}
      <div className="sched-mobile">
        <div className="sched-mobile-pills">
          {days.flatMap((day) =>
            SESSIONS.map((session) => {
              const active = mobileSlot.day === day && mobileSlot.session === session;
              const slot = state.slots.find((s) => s.day === day && s.session === session);
              return (
                <button
                  key={`${day}-${session}`}
                  className={"sched-pill" + (active ? " active" : "")}
                  onClick={() => setMobileSlot({ day, session })}
                >
                  {dayLabel(slot, day)} · {session === "morning" ? "เช้า" : "บ่าย"}
                </button>
              );
            }),
          )}
        </div>
        <div className="sched-mobile-hint">แตะช่องระดับชั้นเพื่อวางวิชาที่เลือกไว้ด้านล่าง</div>
        <div className="sched-mobile-rows">
          {GRADES.map((g) => (
            <MobileGradeRow
              key={g}
              grade={g}
              day={mobileSlot.day}
              session={mobileSlot.session}
              selectedPendingId={selectedPendingId}
              onTap={() => handleMobilePlace(g)}
            />
          ))}
        </div>
        <div className="sched-mobile-tray">
          <div className="sched-mobile-tray-handle" />
          {selectedPendingId && state.submissions[selectedPendingId] ? (
            <div className="sched-mobile-selected-row">
              <div className="sched-mobile-selected">
                <div className="sched-mobile-selected-title">
                  เลือกไว้: {subjectChipLabel(state.submissions[selectedPendingId])}
                </div>
                <div className="sched-mobile-selected-sub">
                  {state.submissions[selectedPendingId].subjectName} · {state.submissions[selectedPendingId].durationMinutes} นาที
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => setSelectedPendingId(null)}>
                เปลี่ยน
              </button>
            </div>
          ) : (
            <div className="sched-mobile-pick-hint">แตะวิชาด้านล่างเพื่อเลือก</div>
          )}
          <div className="sched-mobile-pick-list">
            {pending.map((s) => (
              <button
                key={s.id}
                className={"sched-mobile-pick-chip" + (selectedPendingId === s.id ? " selected" : "")}
                onClick={() => (requireAdmin() ? setSelectedPendingId(s.id) : undefined)}
              >
                {subjectChipLabel(s)}
              </button>
            ))}
            {pending.length === 0 && <span className="sched-tray-empty">จัดครบทุกวิชาแล้ว 🎉</span>}
          </div>
          {pending.length > 0 && (
            <div className="sched-mobile-remaining">ยังรอจัดอีก {pending.length} วิชา</div>
          )}
        </div>
      </div>

      {/* ---------- Print view ---------- */}
      <div className="sched-print-view">
        <div className="sched-print-header">
          <div className="sched-print-title">{state.school?.schoolName ?? "ตารางสอบ"}</div>
          <div className="sched-print-sub">{state.round?.name ?? ""}</div>
        </div>
        <table className="sched-print-table">
          <thead>
            <tr>
              <th>วัน / เวลา</th>
              {GRADES.map((g) => <th key={g}>{gradeLabel(g)}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.flatMap((day) =>
              (["morning", "afternoon"] as ExamSession[]).map((session) => {
                const slot = state.slots.find((s) => s.day === day && s.session === session);
                return (
                  <tr key={`${day}-${session}`}>
                    <td className="sched-print-rowhead">
                      <div>{dayLabel(slot, day)}</div>
                      <div className="sched-print-time">
                        {session === "morning" ? "เช้า" : "บ่าย"}{" "}
                        {slot ? `${slot.start.replace(":", ".")}–${slot.end.replace(":", ".")}` : ""}
                      </div>
                    </td>
                    {GRADES.map((g) => {
                      const ids = state.cellOrder[cellKey(g, day, session)] ?? [];
                      const items = ids.map((id) => state.submissions[id]).filter(Boolean);
                      const times = computeCellTimes(items, slot?.start ?? "08:30", state.round?.gapMinutes ?? 15);
                      return (
                        <td key={g} className="sched-print-cell">
                          {items.map((item, i) => (
                            <div key={item.id} className="sched-print-chip">
                              <b>{item.code}</b>
                              <span>{item.subjectName}</span>
                              {times[i] && (
                                <span className="sched-print-chip-time">
                                  {times[i].start.replace(":", ".")}–{times[i].end.replace(":", ".")}
                                </span>
                              )}
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      {confirmClear && createPortal(
        <div className="sched-confirm-overlay" onClick={() => setConfirmClear(false)}>
          <div className="sched-confirm-modal card" onClick={(e) => e.stopPropagation()}>
            <div className="sched-confirm-title">ล้างตารางสอบ</div>
            <div className="sched-confirm-warn">
              การดำเนินการนี้จะย้ายวิชาที่จัดแล้วทั้งหมด ({scheduledCount} วิชา) กลับไปที่ "รอจัด"
            </div>
            <div className="sched-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmClear(false)}>
                ยกเลิก
              </button>
              <button className="sched-confirm-btn" onClick={handleConfirmClear}>
                ล้างตาราง
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function RuleToggle({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="sched-rule">
      <span className="sched-rule-label">{label}</span>
      <span
        className={"sched-toggle" + (checked ? " on" : "")}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className="sched-toggle-knob" />
      </span>
    </label>
  );
}

const SUBJECT_COLORS: Record<string, { bg: string; border: string; text: string; sub: string }> = {
  ท: { bg: "#fef9c3", border: "#fde047", text: "#713f12", sub: "#a16207" },
  ค: { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a", sub: "#1d4ed8" },
  ว: { bg: "#d1fae5", border: "#6ee7b7", text: "#064e3b", sub: "#047857" },
  ส: { bg: "#ede9fe", border: "#c4b5fd", text: "#3b0764", sub: "#6d28d9" },
  อ: { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d", sub: "#b91c1c" },
  พ: { bg: "#ffedd5", border: "#fdba74", text: "#431407", sub: "#c2410c" },
  ศ: { bg: "#fce7f3", border: "#f9a8d4", text: "#500724", sub: "#be185d" },
  ง: { bg: "#cffafe", border: "#67e8f9", text: "#083344", sub: "#0e7490" },
};
const DEFAULT_SUBJECT_COLOR = { bg: "#f1f5f9", border: "#cbd5e1", text: "#1e293b", sub: "#64748b" };
function subjectColor(code: string) {
  return SUBJECT_COLORS[code.charAt(0)] ?? DEFAULT_SUBJECT_COLOR;
}

function getTimeMarks(startMin: number, endMin: number): Array<{ min: number; isHour: boolean }> {
  const marks: Array<{ min: number; isHour: boolean }> = [];
  marks.push({ min: startMin, isHour: startMin % 60 === 0 });
  let cursor = Math.ceil(startMin / 30) * 30;
  if (cursor === startMin) cursor += 30;
  while (cursor < endMin) {
    marks.push({ min: cursor, isHour: cursor % 60 === 0 });
    cursor += 30;
  }
  if (endMin > startMin) marks.push({ min: endMin, isHour: endMin % 60 === 0 });
  return marks;
}

function TimelinePanel({
  day,
  session,
  slot,
  dateLabel,
  onDropCell,
}: {
  day: ExamDay;
  session: ExamSession;
  slot: ExamSlotMeta | undefined;
  dateLabel: string;
  onDropCell: (e: React.DragEvent, grade: Grade, day: ExamDay, session: ExamSession, index?: number) => void;
}) {
  const { state } = useStore();
  const sessionStart = slot?.start ?? (session === "morning" ? "08:30" : "13:00");
  const sessionEnd = slot?.end ?? (session === "morning" ? "11:30" : "16:00");
  const startMin = timeToMinutes(sessionStart);
  const rawEndMin = timeToMinutes(sessionEnd);
  const gapMinutes = state.round?.gapMinutes ?? 15;

  const effectiveEndMin = useMemo(() => {
    let maxEnd = rawEndMin;
    for (const g of GRADES) {
      const ids = state.cellOrder[cellKey(g, day, session)] ?? [];
      const items = ids.map((id) => state.submissions[id]).filter(Boolean);
      if (items.length === 0) continue;
      const times = computeCellTimes(items, sessionStart, gapMinutes);
      const last = times[times.length - 1];
      if (last) maxEnd = Math.max(maxEnd, timeToMinutes(last.end));
    }
    return maxEnd;
  }, [state.cellOrder, state.submissions, day, session, rawEndMin, sessionStart, gapMinutes]);

  const durationMin = Math.max(effectiveEndMin - startMin, 60);
  const timeMarks = getTimeMarks(startMin, effectiveEndMin);

  return (
    <div className="sched-tl-panel">
      <div className="sched-tl-panel-header">
        <span className="sched-tl-panel-date">{dateLabel}</span>
        <span className="sched-tl-panel-session">{session === "morning" ? "เช้า" : "บ่าย"}</span>
        {slot && (
          <span className="sched-tl-panel-time">
            {slot.start.replace(":", ".")} – {slot.end.replace(":", ".")} น.
          </span>
        )}
      </div>
      <div className="sched-tl-body">
        <div className="sched-tl-ruler-row">
          <div className="sched-tl-grade-spacer" />
          <div className="sched-tl-ruler">
            {timeMarks.map(({ min, isHour }, idx) => {
              const pct = ((min - startMin) / durationMin) * 100;
              const isFirst = idx === 0;
              const isLast = idx === timeMarks.length - 1;
              return (
                <div
                  key={min}
                  className={"sched-tl-hour-mark" + (isHour ? " full-hour" : "")}
                  style={{
                    left: `${pct}%`,
                    transform: isFirst ? "none" : isLast ? "translateX(-100%)" : "translateX(-50%)",
                  }}
                >
                  <span className="sched-tl-hour-label">{minutesToTime(min).replace(":", ".")}</span>
                </div>
              );
            })}
          </div>
        </div>
        {GRADES.map((g) => (
          <TimelineLane
            key={g}
            grade={g}
            day={day}
            session={session}
            slot={slot}
            startMin={startMin}
            durationMin={durationMin}
            timeMarks={timeMarks}
            onDropCell={onDropCell}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineLane({
  grade,
  day,
  session,
  slot,
  startMin,
  durationMin,
  timeMarks,
  onDropCell,
}: {
  grade: Grade;
  day: ExamDay;
  session: ExamSession;
  slot: ExamSlotMeta | undefined;
  startMin: number;
  durationMin: number;
  timeMarks: Array<{ min: number; isHour: boolean }>;
  onDropCell: (e: React.DragEvent, grade: Grade, day: ExamDay, session: ExamSession, index?: number) => void;
}) {
  const { dispatch, state, isAdmin, pushUndoSnapshot } = useStore();
  const items = useCellItems(grade, day, session);
  const slotStart = slot?.start ?? (session === "morning" ? "08:30" : "13:00");
  const gapMinutes = state.round?.gapMinutes ?? 15;
  const times = useMemo(
    () => computeCellTimes(items, slotStart, gapMinutes),
    [items, slotStart, gapMinutes],
  );
  const [dragOver, setDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);

  function calcInsertIndex(clientX: number): number {
    const el = laneRef.current;
    if (!el || times.length === 0) return 0;
    const rect = el.getBoundingClientRect();
    const cursorMin = startMin + ((clientX - rect.left) / rect.width) * durationMin;
    for (let i = 0; i < times.length; i++) {
      const centerMin = (timeToMinutes(times[i].start) + timeToMinutes(times[i].end)) / 2;
      if (cursorMin < centerMin) return i;
    }
    return times.length;
  }

  function getIndicatorLeft(index: number): number {
    if (times.length === 0) return 0;
    if (index === 0) {
      return ((timeToMinutes(times[0].start) - startMin) / durationMin) * 100;
    }
    if (index >= times.length) {
      return ((timeToMinutes(times[times.length - 1].end) - startMin) / durationMin) * 100;
    }
    const midMin = (timeToMinutes(times[index - 1].end) + timeToMinutes(times[index].start)) / 2;
    return ((midMin - startMin) / durationMin) * 100;
  }

  return (
    <div className="sched-tl-grade-row">
      <div className="sched-tl-grade-name">{gradeLabel(grade)}</div>
      <div
        ref={laneRef}
        className={"sched-tl-lane" + (dragOver ? " drag-over" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
          if (items.length > 0) setDropIndex(calcInsertIndex(e.clientX));
        }}
        onDragLeave={() => { setDragOver(false); setDropIndex(null); }}
        onDrop={(e) => {
          setDragOver(false);
          setDropIndex(null);
          const id = e.dataTransfer.getData("text/plain");
          const currentIndex = items.findIndex((item) => item.id === id);
          let idx = calcInsertIndex(e.clientX);
          if (currentIndex >= 0 && currentIndex < idx) idx--;
          onDropCell(e, grade, day, session, idx);
        }}
      >
        {timeMarks.slice(1, -1).map(({ min, isHour }) => (
          <div
            key={min}
            className={"sched-tl-vline" + (isHour ? " full-hour" : "")}
            style={{ left: `${((min - startMin) / durationMin) * 100}%` }}
          />
        ))}
        {items.length === 0 && (
          <div className="sched-tl-lane-empty">วางที่นี่</div>
        )}
        {dragOver && dropIndex !== null && items.length > 0 && (
          <div
            className="sched-tl-insert-indicator"
            style={{ left: `${getIndicatorLeft(dropIndex)}%` }}
          />
        )}
        {items.map((item, i) => {
          const t = times[i];
          if (!t) return null;
          const tStartMin = timeToMinutes(t.start);
          const tEndMin = timeToMinutes(t.end);
          const leftPct = Math.max(0, ((tStartMin - startMin) / durationMin) * 100);
          const widthPct = Math.max(1, ((tEndMin - tStartMin) / durationMin) * 100);
          const c = subjectColor(item.code);
          return (
            <div
              key={item.id}
              className={"sched-tl-block" + (t.conflict ? " conflict" : "")}
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                ...(t.conflict ? {} : { background: c.bg, borderColor: c.border }),
              }}
              draggable={isAdmin}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
              title={`${item.code} · ${item.subjectName} · ${t.start}–${t.end}`}
            >
              <div className="sched-tl-block-time" style={t.conflict ? {} : { color: c.text }}>
                {t.start.replace(":", ".")}–{t.end.replace(":", ".")}
              </div>
              <div className="sched-tl-block-code" style={t.conflict ? {} : { color: c.text }}>
                {item.code}
              </div>
              <div className="sched-tl-block-name" style={t.conflict ? {} : { color: c.sub }}>
                {item.subjectName}
              </div>
              {isAdmin && (
                <button
                  className="sched-tl-block-remove"
                  title="ย้ายกลับไปรอจัด"
                  onClick={(e) => {
                    e.stopPropagation();
                    pushUndoSnapshot();
                    dispatch({ type: "UNPLACE", id: item.id });
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileGradeRow({
  grade,
  day,
  session,
  selectedPendingId,
  onTap,
}: {
  grade: Grade;
  day: ExamDay;
  session: ExamSession;
  selectedPendingId: string | null;
  onTap: () => void;
}) {
  const { state } = useStore();
  const items = useCellItems(grade, day, session);
  const slotStart = state.slots.find((s) => s.day === day && s.session === session)?.start ?? "08:30";
  const gapMinutes = state.round?.gapMinutes ?? 15;
  const times = useMemo(() => computeCellTimes(items, slotStart, gapMinutes), [items, slotStart, gapMinutes]);
  const selectedSub = selectedPendingId ? state.submissions[selectedPendingId] : null;
  const isValidTarget = !!selectedSub && selectedSub.grade === grade;

  return (
    <div
      className={"sched-mobile-row" + (isValidTarget ? " droppable" : "") + (times.some((t) => t.conflict) ? " conflict" : "")}
      onClick={onTap}
    >
      <span className="sched-mobile-row-grade">{gradeLabel(grade)}</span>
      <div className="sched-mobile-row-items">
        {items.map((item, i) => (
          <div className="sched-mobile-chip" key={item.id}>
            <b>{item.code}</b> {times[i]?.start.replace(":", ".")}–{times[i]?.end.replace(":", ".")}
            {times[i]?.conflict && <span className="sched-mobile-conflict"> ⚠ ซ้อน</span>}
          </div>
        ))}
        {items.length === 0 && isValidTarget && (
          <div className="sched-mobile-drop-hint">แตะเพื่อวาง {selectedSub?.code} ที่นี่</div>
        )}
        {items.length === 0 && !isValidTarget && !selectedSub && (
          <div className="sched-mobile-drop-hint muted">ยังไม่มีวิชา</div>
        )}
      </div>
    </div>
  );
}
