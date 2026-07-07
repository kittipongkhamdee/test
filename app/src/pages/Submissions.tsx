import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSubmissions } from "../data/store";
import { GRADES, ROOMS_PER_GRADE, gradeLabel } from "../data/mockData";
import type { Submission, SubmissionStatus } from "../data/types";
import "./Submissions.css";

type StatusFilter = "all" | "scheduled" | "pending";

function formatRooms(rooms: number[]): string {
  if (rooms.length === 0) return `1–${ROOMS_PER_GRADE} (ทุกห้อง)`;
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

export default function Submissions() {
  const submissions = useSubmissions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");

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
        <div className="subs-row subs-row-head">
          <span>รหัสวิชา</span>
          <span>ชื่อวิชา</span>
          <span>ครูผู้สอน</span>
          <span>ระดับ</span>
          <span>ห้อง</span>
          <span>เวลาสอบ</span>
          <span>สถานะ</span>
        </div>
        <div className="subs-table-body">
          {filtered.map((s) => (
            <div className="subs-row" key={s.id}>
              <span className="subs-code">{s.code}</span>
              <span>{s.subjectName}</span>
              <span>{s.teacherName}</span>
              <span>{gradeLabel(s.grade)}</span>
              <span className="subs-muted">{formatRooms(s.rooms)}</span>
              <span>{s.durationMinutes} นาที</span>
              <span>{statusBadge(s.status)}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="subs-empty">ไม่พบรายการที่ตรงกับเงื่อนไข</div>}
        </div>
      </div>
    </div>
  );
}
