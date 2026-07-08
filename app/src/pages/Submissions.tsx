import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useActiveFormOptions, useStore, useSubmissions } from "../data/store";
import { GRADES, gradeLabel } from "../data/mockData";
import type { Grade, MorningPreference, Submission, SubmissionStatus } from "../data/types";
import "./Submissions.css";

type StatusFilter = "all" | "scheduled" | "pending";

function formatRooms(rooms: number[]): string {
  if (rooms.length === 0) return "ทุกห้อง";
  return rooms.join(", ");
}

function statusBadge(status: SubmissionStatus) {
  if (status === "scheduled") return <span className="badge badge-green">จัดแล้ว</span>;
  return <span className="badge badge-orange">รอจัด</span>;
}

function toCsv(rows: Submission[]): string {
  const header = ["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "ระดับ", "ห้อง", "เวลาสอบ (นาที)", "สถานะ"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.code,
        r.subjectName,
        r.teacherName,
        gradeLabel(r.grade),
        formatRooms(r.rooms),
        String(r.durationMinutes),
        r.status === "scheduled" ? "จัดแล้ว" : "รอจัด",
      ]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  return lines.join("\n");
}

function EditSubmissionModal({ submission, onClose }: { submission: Submission; onClose: () => void }) {
  const { editSubmission } = useStore();
  const roomOptions = useActiveFormOptions("room");
  const preferenceOptions = useActiveFormOptions("preference");
  const [code, setCode] = useState(submission.code);
  const [subjectName, setSubjectName] = useState(submission.subjectName);
  const [teacherName, setTeacherName] = useState(submission.teacherName);
  const [grade, setGrade] = useState<Grade>(submission.grade);
  const [rooms, setRooms] = useState<number[]>(submission.rooms);
  const [durationMinutes, setDurationMinutes] = useState(submission.durationMinutes);
  const [preference, setPreference] = useState<MorningPreference>(submission.morningPreference);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRoom(room: number) {
    setRooms((prev) => (prev.includes(room) ? prev.filter((r) => r !== room) : [...prev, room].sort((a, b) => a - b)));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await editSubmission(submission.id, { code, subjectName, teacherName, grade, rooms, durationMinutes, morningPreference: preference });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="subs-modal-overlay" onClick={onClose}>
      <form className="card subs-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
        <div className="subs-modal-title">แก้ไขข้อมูลรายวิชา</div>
        {error && <div className="tform-error">{error}</div>}

        <div className="tform-row-2">
          <label className="tform-field">
            <span className="tform-label">รหัสวิชา</span>
            <input className="tform-input" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="tform-field">
            <span className="tform-label">ชื่อวิชา</span>
            <input className="tform-input" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
          </label>
        </div>

        <label className="tform-field">
          <span className="tform-label">ครูผู้สอน</span>
          <input className="tform-input" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
        </label>

        <div className="tform-field">
          <span className="tform-label">ระดับชั้น</span>
          <div className="tform-chip-row">
            {GRADES.map((g) => (
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
          <span className="tform-label">ห้องที่จัดสอบ (ไม่เลือก = ทุกห้อง)</span>
          <div className="tform-chip-row">
            {roomOptions.map((opt) => {
              const r = Number(opt.value);
              return (
                <button
                  type="button"
                  key={opt.id}
                  className={"tform-chip" + (rooms.includes(r) ? " selected" : "")}
                  onClick={() => toggleRoom(r)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="tform-row-2">
          <label className="tform-field">
            <span className="tform-label">เวลาที่ใช้สอบ (นาที)</span>
            <input
              className="tform-input"
              type="number"
              min={5}
              step={5}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </label>
          <label className="tform-field">
            <span className="tform-label">ช่วงเวลาที่เหมาะสม</span>
            <select className="tform-input" value={preference} onChange={(e) => setPreference(e.target.value as MorningPreference)}>
              {preferenceOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.icon ? `${opt.icon} ` : ""}
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="tform-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export default function Submissions() {
  const { isAdmin, removeSubmission } = useStore();
  const submissions = useSubmissions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const [editing, setEditing] = useState<Submission | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuSubmission, setMenuSubmission] = useState<Submission | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions
      .filter((s) => (statusFilter === "all" ? true : s.status === statusFilter))
      .filter((s) => (gradeFilter === "all" ? true : s.grade === gradeFilter))
      .filter((s) => (q ? s.teacherName.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.subjectName.toLowerCase().includes(q) : true))
      .sort((a, b) => a.grade - b.grade || a.code.localeCompare(b.code));
  }, [submissions, search, statusFilter, gradeFilter]);

  const counts = useMemo(
    () => ({
      all: submissions.length,
      scheduled: submissions.filter((s) => s.status === "scheduled").length,
      pending: submissions.filter((s) => s.status === "pending").length,
    }),
    [submissions],
  );

  const teacherCount = useMemo(() => new Set(submissions.map((s) => s.teacherId)).size, [submissions]);

  function handleExport() {
    const csv = toCsv(filtered);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ข้อมูลรายวิชาสอบ.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openMenu(e: React.MouseEvent, s: Submission) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuSubmission(s);
    setMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  function closeMenu() {
    setMenuSubmission(null);
    setMenuAnchor(null);
  }

  async function handleDelete(s: Submission) {
    if (!window.confirm(`ลบข้อมูลวิชา ${s.code} ${s.subjectName} ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) return;
    setDeletingId(s.id);
    try {
      await removeSubmission(s.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "ลบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="subs-page">
      <div className="page-header">
        <div>
          <h1>ข้อมูลที่ส่งเข้ามา</h1>
          <div className="page-subtitle">
            {submissions.length} รายวิชา จากครู {teacherCount} คน
          </div>
        </div>
        <div className="subs-header-actions">
          <button className="btn btn-ghost" onClick={handleExport}>
            ⬇ ส่งออก Excel
          </button>
          <Link to="/form" className="btn btn-primary">
            + เพิ่มรายวิชาแทนครู
          </Link>
        </div>
      </div>

      <div className="subs-filters">
        <input
          className="subs-search"
          placeholder="🔍 ค้นหาชื่อครู / รหัสวิชา…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={"subs-tab" + (statusFilter === "all" ? " active" : "")}
          onClick={() => setStatusFilter("all")}
        >
          ทั้งหมด ({counts.all})
        </button>
        <button
          className={"subs-tab" + (statusFilter === "scheduled" ? " active" : "")}
          onClick={() => setStatusFilter("scheduled")}
        >
          จัดแล้ว ({counts.scheduled})
        </button>
        <button
          className={"subs-tab" + (statusFilter === "pending" ? " active" : "")}
          onClick={() => setStatusFilter("pending")}
        >
          รอจัด ({counts.pending})
        </button>
        <select
          className="subs-grade-select"
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
        >
          <option value="all">ระดับชั้น: ทั้งหมด</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {gradeLabel(g)}
            </option>
          ))}
        </select>
      </div>

      <div className="card subs-table-card">
        <div className={"subs-row subs-row-head" + (isAdmin ? " admin" : "")}>
          <span>รหัสวิชา</span>
          <span>ชื่อวิชา</span>
          <span>ครูผู้สอน</span>
          <span>ระดับ</span>
          <span>ห้อง</span>
          <span>เวลาสอบ</span>
          <span>สถานะ</span>
          {isAdmin && <span>จัดการ</span>}
        </div>
        <div className="subs-table-body">
          {filtered.map((s) => (
            <div className={"subs-row" + (isAdmin ? " admin" : "")} key={s.id}>
              <span className="subs-code">{s.code}</span>
              <span>{s.subjectName}</span>
              <span>{s.teacherName}</span>
              <span>{gradeLabel(s.grade)}</span>
              <span className="subs-muted">{formatRooms(s.rooms)}</span>
              <span>{s.durationMinutes} นาที</span>
              <span>{statusBadge(s.status)}</span>
              {isAdmin && (
                <span className="subs-row-actions">
                  <button type="button" className="subs-action-btn subs-action-desktop" onClick={() => setEditing(s)}>
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="subs-action-btn danger subs-action-desktop"
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                  >
                    ลบ
                  </button>
                  <button
                    type="button"
                    className="subs-action-btn subs-action-mobile"
                    aria-label="จัดการ"
                    onClick={(e) => openMenu(e, s)}
                  >
                    ⋮
                  </button>
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="subs-empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div>}
        </div>
      </div>

      {editing && <EditSubmissionModal submission={editing} onClose={() => setEditing(null)} />}

      {menuSubmission && menuAnchor &&
        createPortal(
          <div className="subs-kebab-overlay" onClick={closeMenu}>
            <div
              className="subs-kebab-menu"
              style={{ top: menuAnchor.top, right: menuAnchor.right }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="subs-kebab-item"
                onClick={() => { setEditing(menuSubmission); closeMenu(); }}
              >
                ✏ แก้ไข
              </button>
              <button
                className="subs-kebab-item danger"
                onClick={() => { handleDelete(menuSubmission); closeMenu(); }}
                disabled={deletingId === menuSubmission.id}
              >
                🗑 ลบ
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
