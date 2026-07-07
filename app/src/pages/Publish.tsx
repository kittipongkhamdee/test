import { useMemo } from "react";
import { useSubmissions } from "../data/store";
import { computeCellTimes } from "../data/scheduling";
import { EXAM_DAYS, type ExamDay, type ExamSession, type Grade } from "../data/types";
import { EXAM_TITLE, PUBLISH_DATE, ROOMS_PER_GRADE, SCHOOL_NAME, gradeLabel } from "../data/mockData";
import "./Publish.css";

const SESSIONS: ExamSession[] = ["morning", "afternoon"];

const FULL_DAY_TITLE: Record<ExamDay, string> = {
  1: "วันพุธที่ 4 มีนาคม 2569",
  2: "วันพฤหัสบดีที่ 5 มีนาคม 2569",
};

interface PrintRow {
  start: string;
  end: string;
  code: string;
  subjectName: string;
  grade: Grade;
  rooms: string;
  teacherName: string;
}

function formatRooms(rooms: number[]): string {
  if (rooms.length === 0) return `1–${ROOMS_PER_GRADE}`;
  return rooms.join(", ");
}

export default function Publish() {
  const submissions = useSubmissions();

  const rowsByDay = useMemo(() => {
    const byDay: Record<ExamDay, PrintRow[]> = { 1: [], 2: [] };

    for (const day of EXAM_DAYS.map((d) => d.day)) {
      for (const session of SESSIONS) {
        const grouped = new Map<Grade, typeof submissions>();
        for (const s of submissions) {
          if (s.status === "scheduled" && s.slot?.day === day && s.slot.session === session) {
            const list = grouped.get(s.grade) ?? [];
            list.push(s);
            grouped.set(s.grade, list);
          }
        }
        for (const [grade, items] of grouped) {
          const times = computeCellTimes(items, session);
          items.forEach((item, i) => {
            byDay[day].push({
              start: times[i].start,
              end: times[i].end,
              code: item.code,
              subjectName: item.subjectName,
              grade,
              rooms: formatRooms(item.rooms),
              teacherName: item.teacherName,
            });
          });
        }
      }
    }

    (Object.keys(byDay) as unknown as ExamDay[]).forEach((day) => {
      byDay[day].sort((a, b) => a.start.localeCompare(b.start) || a.grade - b.grade);
    });

    return byDay;
  }, [submissions]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="pub-page">
      <div className="page-header no-print">
        <div>
          <h1>ตารางสอบเผยแพร่</h1>
          <div className="page-subtitle">พร้อมพิมพ์และเผยแพร่ให้ครูและนักเรียน</div>
        </div>
        <button className="btn btn-primary" onClick={handlePrint}>
          🖨 พิมพ์ / บันทึก PDF
        </button>
      </div>

      <div className="pub-sheet-wrap">
        <div className="pub-sheet card">
          <div className="pub-sheet-title">
            <div className="pub-sheet-h1">ตารางสอบ{EXAM_TITLE}</div>
            <div className="pub-sheet-h2">
              {SCHOOL_NAME} · สอบวันที่ 4–5 มีนาคม 2569
            </div>
          </div>

          {EXAM_DAYS.map((d) => (
            <div className="pub-day" key={d.day}>
              <div className="pub-day-title">{FULL_DAY_TITLE[d.day]}</div>
              <div className="pub-table">
                <div className="pub-table-head">
                  <span>เวลา</span>
                  <span>รหัสวิชา</span>
                  <span>ชื่อวิชา</span>
                  <span>ระดับชั้น</span>
                  <span>ห้องสอบ</span>
                  <span>ครูผู้ออกข้อสอบ</span>
                </div>
                {rowsByDay[d.day].map((row, i) => (
                  <div className="pub-table-row" key={i}>
                    <span>
                      {row.start.replace(":", ".")}–{row.end.replace(":", ".")}
                    </span>
                    <span className="pub-code">{row.code}</span>
                    <span>{row.subjectName}</span>
                    <span>{gradeLabel(row.grade)}</span>
                    <span>{row.rooms}</span>
                    <span>{row.teacherName}</span>
                  </div>
                ))}
                {rowsByDay[d.day].length === 0 && (
                  <div className="pub-table-empty">ยังไม่มีวิชาที่จัดลงตารางสำหรับวันนี้</div>
                )}
              </div>
            </div>
          ))}

          <div className="pub-footer">
            <div className="pub-footer-date">ประกาศ ณ วันที่ {PUBLISH_DATE}</div>
            <div className="pub-signature">
              <div className="pub-signature-line" />
              <div>ลงชื่อ ..............................................</div>
              <div className="pub-signature-role">รองผู้อำนวยการฝ่ายวิชาการ</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
