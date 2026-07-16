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

function escHtml(val: string | number): string {
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
.pub-table-head.pub-table-head-bygrade,
.pub-table-row.pub-table-row-bygrade {
  grid-template-columns: 110px 110px 80px 1fr 120px 65px 120px;
}
.pub-grade-print-page { padding: 0; }
.pub-grade-page-break { page-break-after: always; }
`;

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
          const times = computeCellTimes(items, slot?.start ?? "08:30", state.round?.gapMinutes ?? 15);
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

  const rowsByGrade = useMemo(() => {
    const byGrade = new Map<Grade, Array<{ dayLabel: string; row: PrintRow }>>();
    for (const day of days) {
      const slot = state.slots.find((s) => s.day === day);
      const label = dayTitle(slot?.examDate, day);
      for (const row of rowsByDay[day] ?? []) {
        if (!byGrade.has(row.grade)) byGrade.set(row.grade, []);
        byGrade.get(row.grade)!.push({ dayLabel: label, row });
      }
    }
    return byGrade;
  }, [rowsByDay, days, state.slots]);

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

  const examTitle = state.round?.name ?? "";
  const schoolName = state.school?.schoolName ?? "";
  const slotsByDay = (day: ExamDay): ExamSlotMeta | undefined => state.slots.find((s) => s.day === day);

  function fullGradeLabel(grade: Grade): string {
    return `ชั้นมัธยมศึกษาปีที่ ${grade}`;
  }

  const sheetSubtitle = gradeFilter != null
    ? `${schoolName} — ${fullGradeLabel(gradeFilter)}`
    : schoolName;

  function openPrintPopup(bodyHTML: string) {
    const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>${PRINT_CSS}</style>
</head>
<body>
${bodyHTML}
<script>
(function(){
  var done=false;
  function doPrint(){
    if(done)return;done=true;
    window.addEventListener('afterprint',function(){window.close();},{once:true});
    window.print();
  }
  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(function(){setTimeout(doPrint,100);});
  } else {
    window.addEventListener('load',function(){setTimeout(doPrint,400);});
  }
})();
</` + `script>
</body>
</html>`;
    const win = window.open("", "_blank");
    if (!win) { window.print(); return; }
    win.document.write(html);
    win.document.close();
  }

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

  function buildPrintByGradeHTML(): string {
    const grades = [...rowsByGrade.keys()].sort((a, b) => a - b);
    return grades.map((grade, idx) => {
      const entries = rowsByGrade.get(grade) ?? [];
      const rowsHtml = entries.map(({ dayLabel, row }) =>
        `<div class="pub-table-row pub-table-row-bygrade">` +
        `<span>${escHtml(dayLabel)}</span>` +
        `<span>${escHtml(row.start.replace(":", "."))}–${escHtml(row.end.replace(":", "."))}</span>` +
        `<span class="pub-code">${escHtml(row.code)}</span>` +
        `<span>${escHtml(row.subjectName)}</span>` +
        `<span>${escHtml(row.gradeRooms)}</span>` +
        `<span>${escHtml(row.durationMinutes)}</span>` +
        `<span>${escHtml(row.teacherName)}</span>` +
        `</div>`
      ).join("");
      const pageBreak = idx < grades.length - 1 ? " pub-grade-page-break" : "";
      return (
        `<div class="pub-grade-print-page${pageBreak}">` +
        `<div class="pub-sheet-title">` +
        `<div class="pub-sheet-h1">ตาราง${escHtml(examTitle)}</div>` +
        `<div class="pub-sheet-h2">${escHtml(schoolName)} — ${escHtml(gradeLabel(grade))}</div>` +
        `</div>` +
        `<div class="pub-table">` +
        `<div class="pub-table-head pub-table-head-bygrade">` +
        `<span>วัน</span><span>เวลา</span><span>รหัสวิชา</span>` +
        `<span>ชื่อวิชา</span><span>ระดับชั้น</span><span>เวลา (นาที)</span>` +
        `<span>ครูผู้ออกข้อสอบ</span>` +
        `</div>${rowsHtml}</div></div>`
      );
    }).join("");
  }

  async function canvasToPDF(canvas: HTMLCanvasElement, filename: string) {
    const { jsPDF } = await import("jspdf");
    const marginMm = 12;
    const contentW = 210 - marginMm * 2;
    const contentH = 297 - marginMm * 2;
    const mmPerPx = contentW / canvas.width;
    const totalH = canvas.height * mmPerPx;
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

    if (totalH <= contentH) {
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", marginMm, marginMm, contentW, totalH);
    } else {
      const slicePx = Math.floor(contentH / mmPerPx);
      let srcY = 0;
      let first = true;
      while (srcY < canvas.height) {
        const h = Math.min(slicePx, canvas.height - srcY);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = h;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, slice.width, h);
        ctx.drawImage(canvas, 0, srcY, canvas.width, h, 0, 0, canvas.width, h);
        if (!first) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/png"), "PNG", marginMm, marginMm, contentW, h * mmPerPx);
        srcY += h;
        first = false;
      }
    }
    pdf.save(`${filename}.pdf`);
  }

  // Captures the on-screen .pub-sheet element exactly as displayed
  function handleExportPDF() {
    const sheetEl = document.querySelector<HTMLElement>(".pub-sheet");
    if (!sheetEl) { openPrintPopup(buildPrintHTML()); return; }
    void (async () => {
      try {
        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(sheetEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        await canvasToPDF(canvas, examTitle || "ตารางสอบ");
      } catch {
        openPrintPopup(buildPrintHTML());
      }
    })();
  }

  // By-grade renders each grade page into an off-screen container
  function handleExportPDFByGrade() {
    void (async () => {
      try {
        const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);

        const host = document.createElement("div");
        Object.assign(host.style, {
          position: "fixed" as const,
          top: "-10000px",
          left: "0",
          width: "794px",
          background: "white",
          boxSizing: "border-box",
          padding: "32px 48px",
        });
        const styleEl = document.createElement("style");
        styleEl.textContent = PRINT_CSS;
        host.appendChild(styleEl);
        const content = document.createElement("div");
        content.innerHTML = buildPrintByGradeHTML();
        host.appendChild(content);
        document.body.appendChild(host);

        const canvas = await html2canvas(host, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: 794,
        });
        document.body.removeChild(host);
        await canvasToPDF(canvas, (examTitle || "ตารางสอบ") + "_รายชั้น");
      } catch {
        openPrintPopup(buildPrintByGradeHTML());
      }
    })();
  }

  function handlePrint() {
    openPrintPopup(buildPrintHTML());
  }

  function handlePrintByGrade() {
    openPrintPopup(buildPrintByGradeHTML());
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
          <button className="btn btn-ghost" onClick={handleExportPDF}>
            📄 PDF (รายวัน)
          </button>
          <button className="btn btn-ghost" onClick={handleExportPDFByGrade}>
            📄 PDF (รายชั้น)
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
