import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useGradeRoomCounts, useStore, useSubmissions } from "../data/store";
import { computeCellTimes } from "../data/scheduling";
import type { ExamDay, ExamSession, ExamSlotMeta, Grade, GradeRoomCounts } from "../data/types";
import { gradeLabel, roomsForGrade } from "../data/mockData";
import { escHtml, openPrintPopup } from "../lib/printPopup";
import "./Publish.css";

const SESSIONS: ExamSession[] = ["morning", "afternoon"];

function dayTitle(examDate: string | null | undefined, day: ExamDay): string {
  if (!examDate) return `วันที่ ${day} ของการสอบ`;
  return new Date(examDate).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Two-line variant for the merged date cell in the official per-grade sheet,
// e.g. "วันจันทร์ ที่ 20" / "กรกฎาคม 2569".
function dayTitleTwoLine(examDate: string | null | undefined, day: ExamDay): [string, string] {
  if (!examDate) return [`วันที่ ${day}`, "ของการสอบ"];
  const d = new Date(examDate);
  const weekday = d.toLocaleDateString("th-TH", { weekday: "long" });
  const dayNum = d.toLocaleDateString("th-TH", { day: "numeric" });
  const monthYear = d.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  return [`${weekday} ที่ ${dayNum}`, monthYear];
}

interface PrintRow {
  start: string;
  end: string;
  session: ExamSession;
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

// The official per-grade sheet shows the grade's whole registered room
// range (e.g. "ม.2/1-2/2"), not each submission's individually-picked
// rooms — the printed schedule is for the whole grade sitting together.
function fmtGradeRoomRange(gradeRoomCounts: GradeRoomCounts, grade: Grade): string {
  const rooms = roomsForGrade(gradeRoomCounts, grade);
  if (rooms.length <= 1) return gradeLabel(grade);
  return `ม.${grade}/${rooms[0]}-${grade}/${rooms[rooms.length - 1]}`;
}


const PRINT_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Sarabun', 'Noto Sans Thai', 'Segoe UI', Arial, sans-serif;
  font-size: 13px;
  color: #1a1a2e;
  line-height: 1.5;
}
@page { size: A4 portrait; margin: 12mm 15mm; }
.pub-sheet-title {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 20px;
}
.pub-sheet-h1 { font-size: 18px; font-weight: 700; color: #1a1a2e; }
.pub-sheet-h2 { font-size: 13px; color: #6b7280; }
.pub-day { margin-bottom: 20px; }
.pub-day-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e3a8a;
  padding: 6px 0;
  border-bottom: 2px solid #2563eb;
  margin-bottom: 4px;
}
.pub-table { display: flex; flex-direction: column; font-size: 12px; color: #1a1a2e; }
.pub-table-head,
.pub-table-row {
  display: grid;
  grid-template-columns: 110px 80px 1fr 100px 65px minmax(130px, 1fr);
  gap: 4px;
}
.pub-table-head span {
  padding: 7px 8px;
  font-weight: 700;
  color: #6b7280;
  border-bottom: 1px solid #d1d5db;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
}
.pub-table-row span {
  padding: 7px 8px;
  border-bottom: 1px solid #e5e7eb;
  word-break: break-word;
  white-space: normal;
}
.pub-code { font-weight: 600; }
.pub-table-empty { padding: 12px 8px; color: #6b7280; font-size: 12px; }
.pub-grade-print-page { padding: 0; }
.pub-grade-page-break { page-break-after: always; }

/* ---------- Official per-grade sheet ---------- */
.pub-off-school {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 4px;
}
.pub-off-title {
  display: flex;
  justify-content: center;
  gap: 28px;
  font-size: 16px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 14px;
}
.pub-off-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  color: #1a1a2e;
}
.pub-off-table th,
.pub-off-table td {
  border: 1px solid #9ca3af;
  padding: 6px 8px;
  text-align: center;
  vertical-align: middle;
}
.pub-off-table th { font-weight: 700; background: #f3f4f6; }
.pub-off-date { white-space: nowrap; font-weight: 600; }
.pub-off-table td.pub-off-subject { text-align: left; }
.pub-off-code { font-weight: 600; }
.pub-off-break { font-weight: 700; background: #f3f4f6; }
.pub-off-divider td { border: none; padding: 4px 0; }
.pub-off-time,
.pub-off-subject,
.pub-off-duration,
.pub-off-room {
  font-weight: 300;
}
`;

export default function Publish() {
  const { state } = useStore();
  const submissions = useSubmissions();
  const gradeRoomCounts = useGradeRoomCounts();
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
          const times = computeCellTimes(items, slot?.start ?? "08:30", state.round?.gapMinutes ?? 15);
          items.forEach((item, i) => {
            byDay[day].push({
              start: times[i].start,
              end: times[i].end,
              session,
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
  }, [submissions, state.slots, days, state.round?.gapMinutes]);

  const availableGrades = useMemo(() => {
    const grades = new Set<Grade>();
    for (const day of days) {
      for (const row of rowsByDay[day] ?? []) grades.add(row.grade);
    }
    return [...grades].sort((a, b) => a - b);
  }, [rowsByDay, days]);

  const filteredByDay = useMemo(() => {
    if (!gradeFilter) return rowsByDay;
    const result: Record<ExamDay, PrintRow[]> = {};
    for (const day of days) {
      result[day] = (rowsByDay[day] ?? []).filter((r) => r.grade === gradeFilter);
    }
    return result;
  }, [rowsByDay, gradeFilter, days]);

  const examTitle = state.round?.name ?? "";
  const schoolName = state.school?.schoolName ?? "";
  const slotsByDay = (day: ExamDay): ExamSlotMeta | undefined => state.slots.find((s) => s.day === day);

  function fullGradeLabel(grade: Grade): string {
    return `ชั้นมัธยมศึกษาปีที่ ${grade}`;
  }

  const sheetSubtitle = gradeFilter != null
    ? `${schoolName} — ${fullGradeLabel(gradeFilter)}`
    : schoolName;

  function buildPrintHTML(): string {
    const dayHtml = days.map((day) => {
      const rows = filteredByDay[day];
      const label = dayTitle(slotsByDay(day)?.examDate, day);
      const rowsHtml = rows.length === 0
        ? `<div class="pub-table-empty">ยังไม่มีวิชาที่จัดลงตารางสำหรับวันนี้</div>`
        : rows.map((r) =>
            `<div class="pub-table-row">` +
            `<span>${escHtml(r.start.replace(":", "."))}–${escHtml(r.end.replace(":", "."))}</span>` +
            `<span class="pub-code">${escHtml(r.code)}</span>` +
            `<span>${escHtml(r.subjectName)}</span>` +
            `<span>${escHtml(r.gradeRooms)}</span>` +
            `<span>${escHtml(r.durationMinutes)}</span>` +
            `<span>${escHtml(r.teacherName)}</span>` +
            `</div>`
          ).join("");
      return (
        `<div class="pub-day">` +
        `<div class="pub-day-title">${escHtml(label)}</div>` +
        `<div class="pub-table">` +
        `<div class="pub-table-head">` +
        `<span>เวลา</span><span>รหัสวิชา</span><span>ชื่อวิชา</span>` +
        `<span>ระดับชั้น</span><span>เวลา (นาที)</span><span>ครูผู้ออกข้อสอบ</span>` +
        `</div>${rowsHtml}</div></div>`
      );
    }).join("");

    return (
      `<div class="pub-sheet-title">` +
      `<div class="pub-sheet-h1">ตาราง${escHtml(examTitle)}</div>` +
      `<div class="pub-sheet-h2">${escHtml(sheetSubtitle)}</div>` +
      `</div>${dayHtml}`
    );
  }

  // One officially-formatted row descriptor: either a subject or the
  // midday break, so the merged date cell (rowspan) can attach to
  // whichever one ends up structurally first for that day.
  type RowDescriptor = { kind: "subject"; row: PrintRow } | { kind: "break"; start: string; end: string };

  function buildOfficialGradeTable(grade: Grade): string {
    const roomRange = fmtGradeRoomRange(gradeRoomCounts, grade);

    const dayBlocks = days
      .map((day) => {
        const slot = state.slots.find((s) => s.day === day);
        const morningSlot = state.slots.find((s) => s.day === day && s.session === "morning");
        const afternoonSlot = state.slots.find((s) => s.day === day && s.session === "afternoon");
        const dayRows = (rowsByDay[day] ?? []).filter((r) => r.grade === grade);
        const morningRows = dayRows.filter((r) => r.session === "morning");
        const afternoonRows = dayRows.filter((r) => r.session === "afternoon");
        if (morningRows.length === 0 && afternoonRows.length === 0) return null;

        const descriptors: RowDescriptor[] = [
          ...morningRows.map((row): RowDescriptor => ({ kind: "subject", row })),
          ...(morningSlot && afternoonSlot
            ? [{ kind: "break" as const, start: morningSlot.end, end: afternoonSlot.start }]
            : []),
          ...afternoonRows.map((row): RowDescriptor => ({ kind: "subject", row })),
        ];

        const [dateLine1, dateLine2] = dayTitleTwoLine(slot?.examDate, day);
        const rowsHtml = descriptors
          .map((d, i) => {
            const dateCell =
              i === 0
                ? `<td class="pub-off-date" rowspan="${descriptors.length}">${escHtml(dateLine1)}<br/>${escHtml(dateLine2)}</td>`
                : "";
            if (d.kind === "break") {
              return (
                `<tr>${dateCell}` +
                `<td class="pub-off-time">${escHtml(d.start.replace(":", "."))}-${escHtml(d.end.replace(":", "."))}</td>` +
                `<td class="pub-off-break" colspan="4">พักกลางวัน</td></tr>`
              );
            }
            const r = d.row;
            return (
              `<tr>${dateCell}` +
              `<td class="pub-off-time">${escHtml(r.start.replace(":", "."))}-${escHtml(r.end.replace(":", "."))}</td>` +
              `<td class="pub-off-subject">${escHtml(r.subjectName)}</td>` +
              `<td class="pub-off-code">${escHtml(r.code)}</td>` +
              `<td class="pub-off-duration">${escHtml(r.durationMinutes)} นาที</td>` +
              `<td class="pub-off-room">${escHtml(roomRange)}</td></tr>`
            );
          })
          .join("");
        return rowsHtml;
      })
      .filter((block): block is string => block !== null)
      .join(`<tr class="pub-off-divider"><td colspan="6"></td></tr>`);

    return (
      `<table class="pub-off-table">` +
      `<thead><tr>` +
      `<th>วัน /เดือน/ปี</th><th>เวลา</th><th>รายวิชาที่สอบ</th><th>รหัสวิชา</th><th>เวลา</th><th>ห้องที่สอบ</th>` +
      `</tr></thead>` +
      `<tbody>${dayBlocks}</tbody></table>`
    );
  }

  function buildPrintByGradeHTML(): string {
    const grades = [...availableGrades];
    return grades.map((grade, idx) => {
      const pageBreak = idx < grades.length - 1 ? " pub-grade-page-break" : "";
      return (
        `<div class="pub-grade-print-page${pageBreak}">` +
        `<div class="pub-off-school">${escHtml(schoolName)}</div>` +
        `<div class="pub-off-title">` +
        `<span>ตาราง${escHtml(examTitle)}</span>` +
        `<span>${escHtml(fullGradeLabel(grade))}</span>` +
        `</div>` +
        buildOfficialGradeTable(grade) +
        `</div>`
      );
    }).join("");
  }

  function handlePrint() {
    openPrintPopup(PRINT_CSS, buildPrintHTML());
  }

  function handlePrintByGrade() {
    openPrintPopup(PRINT_CSS, buildPrintByGradeHTML());
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

  function handleExportExcelByGrade() {
    const examTitle = state.round?.name ?? "ตารางสอบ";
    const wb = XLSX.utils.book_new();

    const byGrade = new Map<Grade, Array<{ dayLabel: string; row: PrintRow }>>();
    for (const day of days) {
      const slot = state.slots.find((s) => s.day === day);
      const label = slot?.examDate
        ? new Date(slot.examDate).toLocaleDateString("th-TH", { day: "numeric", month: "short" })
        : `วันที่ ${day}`;
      for (const row of rowsByDay[day] ?? []) {
        if (!byGrade.has(row.grade)) byGrade.set(row.grade, []);
        byGrade.get(row.grade)!.push({ dayLabel: label, row });
      }
    }

    for (const grade of [...byGrade.keys()].sort((a, b) => a - b)) {
      const entries = byGrade.get(grade)!;
      const data = [
        ["วัน", "เวลา", "รหัสวิชา", "ชื่อวิชา", "ระดับชั้น", "เวลา (นาที)", "ครูผู้ออกข้อสอบ"],
        ...entries.map(({ dayLabel, row }) => [
          dayLabel,
          `${row.start}–${row.end}`,
          row.code,
          row.subjectName,
          row.gradeRooms,
          row.durationMinutes,
          row.teacherName,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 11 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, ws, gradeLabel(grade));
    }

    XLSX.writeFile(wb, `${examTitle}_รายชั้น.xlsx`);
  }

  return (
    <div className="pub-page">
      <div className="page-header no-print">
        <div>
          <h1>ตารางสอบเผยแพร่</h1>
          <div className="page-subtitle">พร้อมพิมพ์และเผยแพร่ให้ครูและนักเรียน</div>
        </div>
        <div className="pub-header-actions">
          <button className="btn btn-ghost" onClick={handleExportExcel}>
            📊 Excel (รายวัน)
          </button>
          <button className="btn btn-ghost" onClick={handleExportExcelByGrade}>
            📊 Excel (รายชั้น)
          </button>
          <button className="btn btn-ghost" onClick={handlePrintByGrade}>
            🖨 พิมพ์รายชั้น
          </button>
          <button className="btn btn-primary" onClick={handlePrint}>
            🖨 พิมพ์
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
            <div className="pub-sheet-h2">{sheetSubtitle}</div>
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
