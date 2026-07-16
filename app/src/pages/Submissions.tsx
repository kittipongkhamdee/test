import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { useActiveFormOptions, useStore, useSubmissions } from "../data/store";
import { GRADES, gradeLabel } from "../data/mockData";
import type { Grade, MorningPreference, Submission } from "../data/types";
import "./Submissions.css";

type StatusFilter = "all" | "scheduled" | "pending" | "self-scheduled";

function formatGradeRooms(grade: Grade, rooms: number[]): string {
  if (rooms.length === 0) return gradeLabel(grade);
  return rooms.map((r) => `ม.${grade}/${r}`).join(", ");
}

function statusBadge(s: Submission) {
  if (s.selfScheduled) return <span className="badge badge-purple">นอกตาราง</span>;
  if (s.status === "scheduled") return <span className="badge badge-green">จัดแล้ว</span>;
  return <span className="badge badge-orange">รอจัด</span>;
}

function toCsv(rows: Submission[]): string {
  const header = ["รหัสวิชา", "ชื่อวิชา", "ครูผู้สอน", "ระดับชั้น", "เวลาสอบ (นาที)", "สถานะ"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.code,
        r.subjectName,
        r.teacherName,
        r.selfScheduled ? "–" : formatGradeRooms(r.grade, r.rooms),
        String(r.durationMinutes),
        r.status === "scheduled" ? "จัดแล้ว" : "รอจัด",
      ]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(","),
    );
  }
  return lines.join("\n");
}

function exportGroupedExcel(submissions: Submission[], roundName: string) {
  // Group by teacher, sorted by name
  const map = new Map<string, { name: string; subs: Submission[] }>();
  for (const s of [...submissions.filter((s) => !s.selfScheduled)].sort((a, b) =>
    a.teacherName.localeCompare(b.teacherName, "th"),
  )) {
    if (!map.has(s.teacherId)) map.set(s.teacherId, { name: s.teacherName, subs: [] });
    map.get(s.teacherId)!.subs.push(s);
  }
  for (const g of map.values()) {
    g.subs.sort((a, b) => a.grade - b.grade || a.code.localeCompare(b.code));
  }
  const grouped = [...map.values()];

  // Build rows (row 0 = header)
  const rows: (string | number)[][] = [["ลำดับ", "ครูผู้สอน", "รหัสวิชา", "ชื่อวิชา", "ชั้น", "เวลา (นาที)"]];
  const merges: XLSX.Range[] = [];
  let rowIdx = 1;

  for (const [gi, group] of grouped.entries()) {
    const startRow = rowIdx;
    for (const s of group.subs) {
      rows.push([gi + 1, group.name, s.code, s.subjectName, formatGradeRooms(s.grade, s.rooms), s.durationMinutes]);
      rowIdx++;
    }
    if (group.subs.length > 1) {
      merges.push({ s: { r: startRow, c: 0 }, e: { r: rowIdx - 1, c: 0 } });
      merges.push({ s: { r: startRow, c: 1 }, e: { r: rowIdx - 1, c: 1 } });
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 8 }, { wch: 26 }, { wch: 13 }, { wch: 36 }, { wch: 18 }, { wch: 13 }];

  // Style header row
  const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "E8EEF8" } }, alignment: { horizontal: "center" } };
  ["A1", "B1", "C1", "D1", "E1", "F1"].forEach((cell) => {
    if (ws[cell]) ws[cell].s = headerStyle;
  });

  // Center-align ลำดับ and เวลา columns
  for (let r = 1; r < rows.length; r++) {
    const numCell = XLSX.utils.encode_cell({ r, c: 0 });
    const durCell = XLSX.utils.encode_cell({ r, c: 5 });
    if (ws[numCell]) ws[numCell].s = { alignment: { horizontal: "center", vertical: "center" } };
    if (ws[durCell]) ws[durCell].s = { alignment: { horizontal: "center", vertical: "center" } };
  }

  // Vertical center for merged teacher cells
  for (const m of merges) {
    const cell = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
    if (ws[cell]) ws[cell].s = { alignment: { vertical: "center" } };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "รายวิชาที่ขอจัดสอบ");
  XLSX.writeFile(wb, `รายวิชาจัดสอบ_${roundName || "ทั้งหมด"}.xlsx`);
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

function GroupedTable({ submissions }: { submissions: Submission[] }) {
  const mainSubs = useMemo(() => submissions.filter((s) => !s.selfScheduled), [submissions]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; subs: Submission[] }>();
    for (const s of [...mainSubs].sort((a, b) => a.teacherName.localeCompare(b.teacherName, "th"))) {
      if (!map.has(s.teacherId)) map.set(s.teacherId, { name: s.teacherName, subs: [] });
      map.get(s.teacherId)!.subs.push(s);
    }
    // sort each teacher's subs by grade then code
    for (const g of map.values()) {
      g.subs.sort((a, b) => a.grade - b.grade || a.code.localeCompare(b.code));
    }
    return [...map.values()];
  }, [mainSubs]);

  if (grouped.length === 0) {
    return <div className="subs-empty">ยังไม่มีข้อมูลส่งเข้ามา</div>;
  }

  return (
    <div className="card subs-grouped-card">
      <div className="subs-grouped-scroll">
        <table className="subs-grouped-table">
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>ครูผู้สอน</th>
              <th>รหัสวิชา</th>
              <th>ชื่อวิชา</th>
              <th>ชั้น</th>
              <th>เวลา</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((group, gi) =>
              group.subs.map((s, si) => (
                <tr key={s.id} className={si === 0 ? "subs-gt-first-row" : ""}>
                  {si === 0 && (
                    <td className="subs-gt-num" rowSpan={group.subs.length}>
                      {gi + 1}
                    </td>
                  )}
                  {si === 0 && (
                    <td className="subs-gt-teacher" rowSpan={group.subs.length}>
                      {group.name}
                    </td>
                  )}
                  <td className="subs-gt-code">{s.code}</td>
                  <td className="subs-gt-subject">{s.subjectName}</td>
                  <td className="subs-gt-grade">{formatGradeRooms(s.grade, s.rooms)}</td>
                  <td className="subs-gt-duration">{s.durationMinutes} นาที</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Submissions() {
  const { isAdmin, removeSubmission, state } = useStore();
  const submissions = useSubmissions();
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");
  const [editing, setEditing] = useState<Submission | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteSub, setConfirmDeleteSub] = useState<Submission | null>(null);
  const [menuSubmission, setMenuSubmission] = useState<Submission | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return submissions
      .filter((s) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "self-scheduled") return s.selfScheduled;
        return !s.selfScheduled && s.status === statusFilter;
      })
      .filter((s) => (gradeFilter === "all" ? true : s.grade === gradeFilter))
      .filter((s) => (q ? s.teacherName.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.subjectName.toLowerCase().includes(q) : true))
      .sort((a, b) => a.grade - b.grade || a.code.localeCompare(b.code));
  }, [submissions, search, statusFilter, gradeFilter]);

  const counts = useMemo(
    () => ({
      all: submissions.length,
      scheduled: submissions.filter((s) => !s.selfScheduled && s.status === "scheduled").length,
      pending: submissions.filter((s) => !s.selfScheduled && s.status === "pending").length,
      selfScheduled: submissions.filter((s) => s.selfScheduled).length,
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

  function handleDelete(s: Submission) {
    setConfirmDeleteSub(s);
  }

  async function doDelete() {
    if (!confirmDeleteSub) return;
    const s = confirmDeleteSub;
    setConfirmDeleteSub(null);
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
          <div className="subs-view-toggle">
            <button
              className={"subs-view-btn" + (viewMode === "list" ? " active" : "")}
              onClick={() => setViewMode("list")}
              title="มุมมองรายการ"
            >
              ☰ รายการ
            </button>
            <button
              className={"subs-view-btn" + (viewMode === "grouped" ? " active" : "")}
              onClick={() => setViewMode("grouped")}
              title="มุมมองจัดกลุ่มตามครู"
            >
              ⊞ จัดกลุ่มครู
            </button>
          </div>
          <button className="btn btn-ghost" onClick={() => exportGroupedExcel(filtered, state.round?.name ?? "")}>
            ⬇ ส่งออก Excel (จัดกลุ่ม)
          </button>
          <button className="btn btn-ghost" onClick={handleExport}>
            ⬇ ส่งออก CSV
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
        {counts.selfScheduled > 0 && (
          <button
            className={"subs-tab subs-tab-purple" + (statusFilter === "self-scheduled" ? " active" : "")}
            onClick={() => setStatusFilter("self-scheduled")}
          >
            นอกตาราง ({counts.selfScheduled})
          </button>
        )}
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

      {viewMode === "grouped" ? (
        <GroupedTable submissions={filtered} />
      ) : (
        <div className="card subs-table-card">
          <div className={"subs-row subs-row-head" + (isAdmin ? " admin" : "")}>
            <span>รหัสวิชา</span>
            <span>ชื่อวิชา</span>
            <span>ครูผู้สอน</span>
            <span>ระดับชั้น</span>
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
                <span>{s.selfScheduled ? "–" : formatGradeRooms(s.grade, s.rooms)}</span>
                <span>{s.selfScheduled ? "–" : `${s.durationMinutes} นาที`}</span>
                <span>{statusBadge(s)}</span>
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
      )}

      {editing && <EditSubmissionModal submission={editing} onClose={() => setEditing(null)} />}

      {confirmDeleteSub && createPortal(
        <div className="subs-delete-overlay" onClick={() => setConfirmDeleteSub(null)}>
          <div className="subs-delete-modal card" onClick={(e) => e.stopPropagation()}>
            <div className="subs-delete-title">ยืนยันการลบรายวิชา</div>
            <div className="subs-delete-warn">การลบนี้ไม่สามารถย้อนกลับได้</div>
            <div className="subs-delete-body">
              <div className="subs-delete-row">
                <span className="subs-delete-label">รหัสวิชา</span>
                <span className="subs-delete-code">{confirmDeleteSub.code}</span>
              </div>
              <div className="subs-delete-row">
                <span className="subs-delete-label">ชื่อวิชา</span>
                <span>{confirmDeleteSub.subjectName}</span>
              </div>
              <div className="subs-delete-row">
                <span className="subs-delete-label">ครูผู้สอน</span>
                <span>{confirmDeleteSub.teacherName}</span>
              </div>
              <div className="subs-delete-row">
                <span className="subs-delete-label">ระดับชั้น</span>
                <span>{gradeLabel(confirmDeleteSub.grade)}</span>
              </div>
            </div>
            <div className="subs-delete-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDeleteSub(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="subs-delete-btn"
                onClick={doDelete}
                disabled={deletingId === confirmDeleteSub.id}
              >
                {deletingId === confirmDeleteSub.id ? "กำลังลบ…" : "ลบรายวิชา"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

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
