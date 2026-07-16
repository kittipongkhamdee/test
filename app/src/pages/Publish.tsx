import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useStore, useSubmissions } from "../data/store";
import { computeCellTimes } from "../data/scheduling";
import type { ExamDay, ExamSession, ExamSlotMeta, Grade } from "../data/types";
import { gradeLabel } from "../data/mockData";
import "./Publish.css";

const SESSIONS: ExamSession[] = ["morning", "afternoon"];

function dayTitle(examDate: string | null | undefined, day: ExamDay): string {
  if (!examDate) return `วันที่ ${day} ของการสอบ`;
  return new Date(examDate).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

interface PrintRow {
  start: string;
  end: string;
  code: string;
  subjectName: string;
  grade: Grade;
  gradeRooms: string;
  durationMinutes: number;
  teacherName: string;
}

function fmtGradeRooms(grade: Grade, rooms: number[]): string {
  if (rooms.length === 0) return gradeLabel(grade);
  return rooms.map((r) => `ม.${grade}/${r}`).join(", ");
}

export default function Publish() {
  const { state } = useStore();
  const submissions = useSubmissions();
  const [gradeFilter, setGradeFilter] = useState<Grade | null>(null);

  const days = useMemo(
    () => [...new Set(state.slots.map((s) => s.day))].sort((a, b) => a - b),
    [state.slots],
  );

  const rowsByDay = useMemo(() => {
    const byDay: Record<ExamDay, PrintRow[]> = {};
    for (const d of days) byDay[d] = [];

    for (const day of days) {
      for (const session of SESSIONS) {
        const slot = state.slots.find((s) => s.day === day && s.session === session);
        const grouped = new Map<Grade, typeof submissions>();
        for (const s of submissions) {
          if (s.status === "scheduled" && s.slot?.day === day && s.slot.session === session) {
            const list = grouped.get(s.grade) ?? [];
            list.push(s);
            grouped.set(s.grade, list);
          }
        }
        for (const [grade, items] of grouped) {
          const times = computeCellTimes(items, slot?.start ?? "08:30");
          items.forEach((item, i) => {
            byDay[day].push({
              start: times[i].start,
              end: times[i].end,
              code: item.code,
              subjectName: item.subjectName,
              grade,
              gradeRooms: fmtGradeRooms(grade, item.rooms),
              durationMinutes: item.durationMinutes,
              teacherName: item.teacherName,
            });
          });
        }
      }
    }

    for (const day of days) {
      byDay[day].sort((a, b) => a.start.localeCompare(b.start) || a.grade - b.grade);
    }

    return byDay;
  }, [submissions, state.slots, days]);

  const availableGrades = useMemo(() => {
    const grades = new Set<Grade>();
    for (const day of days) {
      for (const row of rowsByDay[day] ?? []) grades.add(row.grade);
    }
    return [...grades].sort((a, b) => a - b);
  }, [rowsByDay]);

  const filteredByDay = useMemo(() => {
    if (!gradeFilter) return rowsByDay;
    const result: Record<ExamDay, PrintRow[]> = {};
    for (const day of days) {
      result[day] = (rowsByDay[day] ?? []).filter((r) => r.grade === gradeFilter);
    }
    return result;
  }, [rowsByDay, gradeFilter, days]);

  function handlePrint() {
    window.print();
  }

  function handleExportExcel() {
    const examTitle = state.round?.name ?? "ตารางสอบ";
    const wb = XLSX.utils.book_new();

    for (const day of days) {
      const slot = state.slots.find((s) => s.day === day);
      const sheetName = slot?.examDate
        ? new Date(slot.examDate).toLocaleDateString("th-TH", { day: "numeric", month: "short" })
        : `วันที่ ${day}`;

      const rows = rowsByDay[day];
      const data = [
        ["เวลา", "รหัสวิชา", "ชื่อวิชา", "ระดับชั้น", "เวลา (นาที)", "ครูผู้ออกข้อสอบ"],
        ...rows.map((r) => [
          `${r.start}–${r.end}`,
          r.code,
          r.subjectName,
          r.gradeRooms,
          r.durationMinutes,
          r.teacherName,
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 11 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    XLSX.writeFile(wb, `${examTitle}.xlsx`);
  }

  const examTitle = state.round?.name ?? "";
  const schoolName = state.school?.schoolName ?? "";
  const slotsByDay = (day: ExamDay): ExamSlotMeta | undefined => state.slots.find((s) => s.day === day);

  return (
    <div className="pub-page">
      <div className="page-header no-print">
        <div>
          <h1>ตารางสอบเผยแพร่</h1>
          <div className="page-subtitle">พร้อมพิมพ์และเผยแพร่ให้ครูและนักเรียน</div>
        </div>
        <div className="pub-header-actions">
          <button className="btn btn-ghost" onClick={handleExportExcel}>
            📊 ส่งออก Excel
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>
            🖨 พิมพ์ / บันทึก PDF
          </button>
        </div>
      </div>

      {availableGrades.length > 0 && (
        <div className="pub-grade-filter no-print">
          <button
            className={"pub-grade-chip" + (gradeFilter === null ? " active" : "")}
            onClick={() => setGradeFilter(null)}
          >
            ทั้งหมด
          </button>
          {availableGrades.map((g) => (
            <button
              key={g}
              className={"pub-grade-chip" + (gradeFilter === g ? " active" : "")}
              onClick={() => setGradeFilter(g)}
            >
              {gradeLabel(g)}
            </button>
          ))}
        </div>
      )}

      <div className="pub-sheet-wrap">
        <div className="pub-sheet card">
          <div className="pub-sheet-title">
            <div className="pub-sheet-h1">ตาราง{examTitle}</div>
            <div className="pub-sheet-h2">{schoolName}</div>
          </div>

          {days.map((day) => (
            <div className="pub-day" key={day}>
              <div className="pub-day-title">{dayTitle(slotsByDay(day)?.examDate, day)}</div>
              <div className="pub-table">
                <div className="pub-table-head">
                  <span>เวลา</span>
                  <span>รหัสวิชา</span>
                  <span>ชื่อวิชา</span>
                  <span>ระดับชั้น</span>
                  <span>เวลา (นาที)</span>
                  <span>ครูผู้ออกข้อสอบ</span>
                </div>
                {filteredByDay[day].map((row, i) => (
                  <div className="pub-table-row" key={i}>
                    <span>
                      {row.start.replace(":", ".")}–{row.end.replace(":", ".")}
                    </span>
                    <span className="pub-code">{row.code}</span>
                    <span>{row.subjectName}</span>
                    <span>{row.gradeRooms}</span>
                    <span>{row.durationMinutes}</span>
                    <span>{row.teacherName}</span>
                  </div>
                ))}
                {filteredByDay[day].length === 0 && (
                  <div className="pub-table-empty">ยังไม่มีวิชาที่จัดลงตารางสำหรับวันนี้</div>
                )}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}
