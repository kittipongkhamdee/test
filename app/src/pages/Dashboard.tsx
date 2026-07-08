import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStore, useSubmissions } from "../data/store";
import { formatRelativeTime, formatThaiDate, formatThaiDateTime } from "../lib/time";
import { gradeLabel } from "../data/mockData";
import { useCountdown } from "../lib/useCountdown";
import type { Grade } from "../data/types";
import "./Dashboard.css";

function useCountUp(target: number, duration = 750): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return count;
}

export default function Dashboard() {
  const { state } = useStore();
  const submissions = useSubmissions();

  const stats = useMemo(() => {
    const mainSubs = submissions.filter((s) => !s.selfScheduled);
    const scheduled = mainSubs.filter((s) => s.status === "scheduled").length;
    const pending = mainSubs.filter((s) => s.status === "pending").length;
    const teacherIds = new Set(mainSubs.map((s) => s.teacherId));
    return {
      submittedCount: mainSubs.length,
      scheduled,
      pending,
      teachersSubmitted: teacherIds.size,
    };
  }, [submissions]);

  const perGrade = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of submissions.filter((s) => !s.selfScheduled)) {
      counts.set(s.grade, (counts.get(s.grade) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([grade, count]) => ({ grade, label: gradeLabel(grade as Grade), count }))
      .sort((a, b) => a.grade - b.grade);
  }, [submissions]);

  const maxGradeCount = Math.max(1, ...perGrade.map((g) => g.count));

  const recent = useMemo(
    () =>
      [...submissions.filter((s) => !s.selfScheduled)]
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        .slice(0, 5),
    [submissions],
  );

  const countSubmitted = useCountUp(stats.submittedCount);
  const countTeachers = useCountUp(stats.teachersSubmitted);
  const countScheduled = useCountUp(stats.scheduled);
  const countPending = useCountUp(stats.pending);

  const scheduledPct = stats.submittedCount ? Math.round((stats.scheduled / stats.submittedCount) * 100) : 0;
  const examTitle = state.round?.name ?? "";
  const deadline = formatThaiDateTime(state.round?.submissionClosesAt);
  const countdown = useCountdown(state.round?.submissionClosesAt);

  const totalTeachers = state.teachers.length;
  const submittedTeacherNames = useMemo(
    () => new Set(submissions.map((s) => s.teacherName.trim().toLowerCase())),
    [submissions],
  );
  const notSubmittedTeachers = useMemo(
    () => state.teachers.filter((t) => !submittedTeacherNames.has(t.trim().toLowerCase())),
    [state.teachers, submittedTeacherNames],
  );
  const teacherSubmittedPct = totalTeachers ? Math.round((stats.teachersSubmitted / totalTeachers) * 100) : 0;

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
        <Link to="/form" className="btn btn-primary dash-survey-btn">
          แบบสำรวจการจัดสอบ
        </Link>
      </div>

      <div className="dash-hero card">
        <div>
          <div className="dash-hero-title">{examTitle}</div>
          <div className="dash-hero-sub">{deadline ? `ปิดรับข้อมูล ${deadline}` : "ยังไม่กำหนดวันปิดรับข้อมูล"}</div>
          {countdown && (
            countdown.expired ? (
              <div className="dash-countdown-expired">หมดเวลาส่งข้อมูลแล้ว</div>
            ) : (
              <div className={"dash-countdown" + (countdown.urgent ? " urgent" : "")}>
                <div className="dash-countdown-block">
                  <span className="dash-countdown-num">{String(countdown.days).padStart(2, "0")}</span>
                  <span className="dash-countdown-unit">วัน</span>
                </div>
                <span className="dash-countdown-colon">:</span>
                <div className="dash-countdown-block">
                  <span className="dash-countdown-num">{String(countdown.hours).padStart(2, "0")}</span>
                  <span className="dash-countdown-unit">ชม.</span>
                </div>
                <span className="dash-countdown-colon">:</span>
                <div className="dash-countdown-block">
                  <span className="dash-countdown-num">{String(countdown.minutes).padStart(2, "0")}</span>
                  <span className="dash-countdown-unit">นาที</span>
                </div>
                <span className="dash-countdown-colon">:</span>
                <div className="dash-countdown-block">
                  <span className="dash-countdown-num">{String(countdown.seconds).padStart(2, "0")}</span>
                  <span className="dash-countdown-unit">วิ</span>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="dash-stat-grid">
        <div className="card dash-stat">
          <div className="dash-stat-label">รายวิชาที่ส่งเข้ามา</div>
          <div className="dash-stat-value">{countSubmitted}</div>
        </div>
        <div className="card dash-stat">
          <div className="dash-stat-label">ครูที่ส่งข้อมูลแล้ว</div>
          <div className="dash-stat-value">{countTeachers}{totalTeachers > 0 && <span className="dash-stat-total">/{totalTeachers}</span>}</div>
          {totalTeachers > 0 && (
            <div className="dash-teacher-progress">
              <div className="dash-teacher-progress-bar">
                <div className="dash-teacher-progress-fill" style={{ width: `${teacherSubmittedPct}%` }} />
              </div>
              <span className="dash-stat-note good">{teacherSubmittedPct}%</span>
            </div>
          )}
        </div>
        <div className="card dash-stat">
          <div className="dash-stat-label">จัดลงตารางแล้ว</div>
          <div className="dash-stat-value">{countScheduled}</div>
          <div className="dash-stat-note good">คิดเป็น {scheduledPct}%</div>
        </div>
        <div className="card dash-stat">
          <div className="dash-stat-label">รอจัดลงตาราง</div>
          <div className="dash-stat-value warn">{countPending}</div>
        </div>
      </div>

      {totalTeachers > 0 && notSubmittedTeachers.length > 0 && (
        <div className="card dash-not-submitted">
          <div className="dash-card-title">ครูที่ยังไม่ส่งข้อมูล <span className="dash-not-submitted-count">{notSubmittedTeachers.length} คน</span></div>
          <div className="dash-not-submitted-list">
            {notSubmittedTeachers.map((name) => (
              <div className="dash-not-submitted-row" key={name}>
                <div className="dash-not-submitted-icon">{name.charAt(name.lastIndexOf(" ") + 1) || name.charAt(0)}</div>
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
