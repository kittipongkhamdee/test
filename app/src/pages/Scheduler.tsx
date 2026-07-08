import { useMemo, useState } from "react";
import { useCellItems, useSubmissions, useStore, type AutoScheduleRules } from "../data/store";
import { computeCellTimes } from "../data/scheduling";
import type { ExamDay, ExamSession, ExamSlotMeta, Grade, Submission } from "../data/types";
import { GRADES, gradeLabel } from "../data/mockData";
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
  const { state, dispatch, isAdmin } = useStore();
  const submissions = useSubmissions();
  const days = useMemo(
    () => [...new Set(state.slots.map((s) => s.day))].sort((a, b) => a - b),
    [state.slots],
  );
  const pending = useMemo(
    () => submissions.filter((s) => s.status === "pending" && !s.selfScheduled).sort((a, b) => a.grade - b.grade),
    [submissions],
  );
  const scheduledCount = submissions.filter((s) => s.status === "scheduled" && !s.selfScheduled).length;

  const [autoOpen, setAutoOpen] = useState(false);
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

  const morningPrefCount = pending.filter((p) => p.morningPreference === "morning").length;

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
    dispatch({ type: "AUTO_SCHEDULE", rules });
    setAutoOpen(false);
    showToast("จัดตารางอัตโนมัติเรียบร้อยแล้ว — ยังลาก/แก้ไขได้ทุกช่อง");
  }

  function handleClear() {
    if (!requireAdmin()) return;
    if (scheduledCount === 0) return;
    if (!window.confirm("ล้างตารางสอบทั้งหมดและย้ายทุกวิชากลับไปที่ \"รอจัด\" ใช่หรือไม่?")) return;
    dispatch({ type: "CLEAR_SCHEDULE" });
    showToast("ล้างตารางแล้ว");
  }

  function handlePublish() {
    showToast("บันทึกและเผยแพร่ตารางสอบเรียบร้อยแล้ว");
  }

  function handleDropOnCell(e: React.DragEvent, grade: Grade, day: ExamDay, session: ExamSession) {
    e.preventDefault();
    if (!requireAdmin()) return;
    const id = e.dataTransfer.getData("text/plain");
    const sub = state.submissions[id];
    if (!sub || sub.grade !== grade) return;
    dispatch({ type: "PLACE", id, day, session });
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

      {/* ---------- Desktop: drag & drop grid ---------- */}
      <div className="sched-desktop">
        <div className="card sched-tray">
          <div className="sched-tray-head">
            <span>รอจัดลงตาราง</span>
            <span className="sched-tray-count">{pending.length}</span>
          </div>
          <div className="sched-tray-list">
            {pending.map((s) => (
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
            {pending.length === 0 && <div className="sched-tray-empty">จัดครบทุกวิชาแล้ว 🎉</div>}
          </div>
        </div>

        <div className="card sched-grid-wrap">
          <div className="sched-grid" style={{ gridTemplateColumns: `96px repeat(${GRADES.length}, 1fr)` }}>
            <div className="sched-grid-corner" />
            {GRADES.map((g) => (
              <div className="sched-grid-colhead" key={g}>
                {gradeLabel(g)}
              </div>
            ))}

            {days.flatMap((day) =>
              SESSIONS.map((session) => {
                const slot = state.slots.find((s) => s.day === day && s.session === session);
                return (
                  <RowCells
                    key={`${day}-${session}`}
                    day={day}
                    dateLabel={dayLabel(slot, day)}
                    slot={slot}
                    session={session}
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

function RowCells({
  day,
  dateLabel,
  session,
  slot,
  onDropCell,
}: {
  day: ExamDay;
  dateLabel: string;
  session: ExamSession;
  slot: ExamSlotMeta | undefined;
  onDropCell: (e: React.DragEvent, grade: Grade, day: ExamDay, session: ExamSession) => void;
}) {
  return (
    <>
      <div className="sched-grid-rowhead">
        <span className="sched-grid-rowhead-day">{dateLabel}</span>
        <span className="sched-grid-rowhead-time">
          {session === "morning" ? "เช้า" : "บ่าย"} {slot ? `${slot.start.replace(":", ".")}–${slot.end.replace(":", ".")}` : ""}
        </span>
      </div>
      {GRADES.map((g) => (
        <GridCell key={g} grade={g} day={day} session={session} onDropCell={onDropCell} />
      ))}
    </>
  );
}

function GridCell({
  grade,
  day,
  session,
  onDropCell,
}: {
  grade: Grade;
  day: ExamDay;
  session: ExamSession;
  onDropCell: (e: React.DragEvent, grade: Grade, day: ExamDay, session: ExamSession) => void;
}) {
  const { dispatch, state, isAdmin } = useStore();
  const items = useCellItems(grade, day, session);
  const slotStart = state.slots.find((s) => s.day === day && s.session === session)?.start ?? "08:30";
  const times = useMemo(() => computeCellTimes(items, slotStart), [items, slotStart]);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={"sched-cell" + (dragOver ? " drag-over" : "") + (items.length === 0 ? " empty" : "")}
      data-grade={grade}
      data-day={day}
      data-session={session}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        onDropCell(e, grade, day, session);
      }}
    >
      {items.length === 0 && <span className="sched-cell-placeholder">วางที่นี่</span>}
      {items.map((item, i) => {
        const t = times[i];
        return (
          <div
            key={item.id}
            className={"sched-chip" + (t?.conflict ? " conflict" : "")}
            draggable={isAdmin}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
          >
            <div className="sched-chip-top">
              <span className="sched-chip-time">
                {t?.start.replace(":", ".")}–{t?.end.replace(":", ".")} · {item.code}
              </span>
              {isAdmin && (
                <button
                  className="sched-chip-remove"
                  title="ย้ายกลับไปรอจัด"
                  onClick={() => dispatch({ type: "UNPLACE", id: item.id })}
                >
                  ×
                </button>
              )}
            </div>
            <div className="sched-chip-name">{item.subjectName}</div>
            {t?.conflict && (
              <div className="sched-conflict-msg">⚠ เวลาซ้อนกับ {t.conflictWith.join(", ")}</div>
            )}
          </div>
        );
      })}
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
  const times = useMemo(() => computeCellTimes(items, slotStart), [items, slotStart]);
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
