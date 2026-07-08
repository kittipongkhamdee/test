import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCatalog, useStore, useSubmissions } from "../data/store";
import { GRADES, gradeLabel } from "../data/mockData";
import { formatRelativeTime, formatThaiDateTime } from "../lib/time";
import "./Dashboard.css";

export default function Dashboard() {
  const { state } = useStore();
  const submissions = useSubmissions();
  const catalog = useCatalog();

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
    return GRADES.map((grade) => {
      const count = submissions.filter((s) => s.grade === grade).length;
      const total = catalog.filter((s) => s.grade === grade).length;
      return { grade, count, total };
    });
  }, [submissions, catalog]);

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
  const expectedTotal = catalog.length;

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
            <div className="dash-hero-num">
              {stats.submittedCount}
              <span>/{expectedTotal}</span>
            </div>
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
          <div className="dash-stat-note">จาก {expectedTotal} วิชาที่คาดไว้</div>
        </div>
        <div className="card dash-stat">
          <div className="dash-stat-label">ครูที่ส่งข้อมูลแล้ว</div>
          <div className="dash-stat-value">{stats.teachersSubmitted}</div>
          <div className="dash-stat-note">จากครู {state.teachers.length} คน</div>
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
        <div className="card dash-progress">
          <div className="dash-card-title">ความคืบหน้าการส่งข้อมูลรายระดับชั้น</div>
          <div className="dash-progress-list">
            {perGrade.map(({ grade, count, total }) => (
              <div className="dash-progress-row" key={grade}>
                <span className="dash-progress-grade">{gradeLabel(grade)}</span>
                <div className="dash-progress-bar">
                  <div
                    className="dash-progress-fill"
                    style={{ width: `${total ? Math.min(100, (count / total) * 100) : 0}%` }}
                  />
                </div>
                <span className="dash-progress-count">
                  {count}/{total} วิชา
                </span>
              </div>
            ))}
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
