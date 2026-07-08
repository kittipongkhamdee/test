import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore, useSubmissions } from "../data/store";
import { formatRelativeTime, formatThaiDate, formatThaiDateTime } from "../lib/time";
import { gradeLabel } from "../data/mockData";
import type { Grade } from "../data/types";
import "./Dashboard.css";

export default function Dashboard() {
  const { state } = useStore();
  const submissions = useSubmissions();

  const stats = useMemo(() => {
    const scheduled = submissions.filter((s) => s.status === "scheduled").length;
    const pending = submissions.filter((s) => s.status === "pending").length;
    const teacherIds = new Set(submissions.map((s) => s.teacherId));
    return {
      submittedCount: submissions.length,
      scheduled,
      pending,
      teachersSubmitted: teacherIds.size,
    };
  }, [submissions]);

  const perGrade = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of submissions) {
      counts.set(s.grade, (counts.get(s.grade) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([grade, count]) => ({ grade, label: gradeLabel(grade as Grade), count }))
      .sort((a, b) => a.grade - b.grade);
  }, [submissions]);

  const maxGradeCount = Math.max(1, ...perGrade.map((g) => g.count));

  const recent = useMemo(
    () =>
      [...submissions]
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        .slice(0, 5),
    [submissions],
  );

  const scheduledPct = stats.submittedCount ? Math.round((stats.scheduled / stats.submittedCount) * 100) : 0;
  const examTitle = state.round?.name ?? "";
  const deadline = formatThaiDateTime(state.round?.submissionClosesAt);

  const day1Date = state.slots.find((s) => s.day === 1)?.examDate ?? null;
  const day2Date = state.slots.find((s) => s.day === 2)?.examDate ?? null;

  if (state.loading) return <div className="dash">กำลังโหลดข้อมูล…</div>;
  if (state.error) return <div className="dash">โหลดข้อมูลไม่สำเร็จ: {state.error}</div>;

  return (
    <div className="dash">
      <div className="page-header">
        <div>
          <h1>แดชบอร์ด</h1>
          <div className="page-subtitle">{examTitle}</div>
        </div>
        <Link to="/form" className="btn btn-primary">
          + เปิดรอบสำรวจใหม่
        </Link>
      </div>

      <div className="dash-hero card">
        <div>
          <div className="dash-hero-title">{examTitle}</div>
          <div className="dash-hero-sub">{deadline ? `ปิดรับข้อมูล ${deadline}` : "ยังไม่กำหนดวันปิดรับข้อมูล"}</div>
        </div>
        <div className="dash-hero-stats">
          <div>
            <div className="dash-hero-num">{stats.submittedCount}</div>
            <div className="dash-hero-label">วิชาที่ส่งแล้ว</div>
          </div>
          <div>
            <div className="dash-hero-num">{stats.scheduled}</div>
            <div className="dash-hero-label">จัดลงตารางแล้ว</div>
          </div>
          <div>
            <div className="dash-hero-num warn">{stats.pending}</div>
            <div className="dash-hero-label">รอจัด</div>
          </div>
        </div>
      </div>

      <div className="dash-stat-grid">
        <div className="card dash-stat">
          <div className="dash-stat-label">รายวิชาที่ส่งเข้ามา</div>
          <div className="dash-stat-value">{stats.submittedCount}</div>
        </div>
        <div className="card dash-stat">
          <div className="dash-stat-label">ครูที่ส่งข้อมูลแล้ว</div>
          <div className="dash-stat-value">{stats.teachersSubmitted}</div>
        </div>
        <div className="card dash-stat">
          <div className="dash-stat-label">จัดลงตารางแล้ว</div>
          <div className="dash-stat-value">{stats.scheduled}</div>
          <div className="dash-stat-note good">คิดเป็น {scheduledPct}%</div>
        </div>
        <div className="card dash-stat">
          <div className="dash-stat-label">รอจัดลงตาราง</div>
          <div className="dash-stat-value warn">{stats.pending}</div>
          <div className="dash-stat-note">{deadline ? `ต้องจัดก่อน ${deadline}` : "ยังไม่กำหนดกำหนดการ"}</div>
        </div>
      </div>

      <div className="dash-lower">
        <div className="card dash-schedule-card">
          <div className="dash-card-title">วิชาที่ส่งเข้ามา รายระดับชั้น</div>
          {perGrade.length === 0 ? (
            <div className="dash-grade-empty">ยังไม่มีข้อมูลส่งเข้ามา</div>
          ) : (
            <div className="dash-grade-bars">
              {perGrade.map(({ grade, label, count }) => (
                <div key={grade} className="dash-grade-row">
                  <span className="dash-grade-label">{label}</span>
                  <div className="dash-grade-bar-wrap">
                    <div className="dash-grade-bar-fill" style={{ width: `${(count / maxGradeCount) * 100}%` }} />
                  </div>
                  <span className="dash-grade-count">{count}</span>
                </div>
              ))}
            </div>
          )}
          <div className="dash-exam-dates-compact">
            <div className="dash-exam-date-compact-row">
              <span className="dash-exam-date-compact-label">วันที่ 1</span>
              <span className={"dash-exam-date-compact-val" + (day1Date ? "" : " dash-schedule-unset")}>{formatThaiDate(day1Date)}</span>
            </div>
            <div className="dash-exam-date-compact-row">
              <span className="dash-exam-date-compact-label">วันที่ 2</span>
              <span className={"dash-exam-date-compact-val" + (day2Date ? "" : " dash-schedule-unset")}>{formatThaiDate(day2Date)}</span>
            </div>
          </div>
        </div>

        <div className="card dash-recent">
          <div className="dash-card-title">ส่งเข้ามาล่าสุด</div>
          <div className="dash-recent-list">
            {recent.map((s) => (
              <div className="dash-recent-row" key={s.id}>
                <div className="dash-recent-icon">{s.code.charAt(0)}</div>
                <div className="dash-recent-info">
                  <div className="dash-recent-name">
                    {s.code} {s.subjectName} · {gradeLabel(s.grade)}
                  </div>
                  <div className="dash-recent-teacher">{s.teacherName}</div>
                </div>
                <span className="dash-recent-time">{formatRelativeTime(s.submittedAt)}</span>
              </div>
            ))}
            {recent.length === 0 && <div className="dash-recent-empty">ยังไม่มีข้อมูลส่งเข้ามา</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
