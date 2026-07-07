import type { Grade, Submission, Teacher, MorningPreference } from "./types";

export const SCHOOL_NAME = "โรงเรียนตาเบาวิทยา";
export const EXAM_TITLE = "สอบปลายภาค ภาคเรียนที่ 2/2568";
export const SUBMISSION_DEADLINE = "28 กุมภาพันธ์ 2569";
export const PUBLISH_DATE = "20 กุมภาพันธ์ 2569";
export const ROOMS_PER_GRADE = 8;
export const GRADES: Grade[] = [1, 2, 3, 4, 5, 6];

export function gradeLabel(g: Grade): string {
  return `ม.${g}`;
}

// subject-group letter -> [name per grade 1..6]
const SUBJECT_TABLE: { letter: string; names: [string, string, string, string, string, string] }[] = [
  { letter: "ท", names: ["ภาษาไทย 1", "ภาษาไทย 3", "ภาษาไทย 5", "ภาษาไทย 1", "ภาษาไทย 3", "ภาษาไทย 5"] },
  { letter: "ค", names: ["คณิตศาสตร์ 1", "คณิตศาสตร์ 3", "คณิตศาสตร์ 5", "คณิตศาสตร์ 1", "คณิตศาสตร์ 3", "คณิตศาสตร์ 5"] },
  { letter: "ว", names: ["วิทยาศาสตร์ 1", "วิทยาศาสตร์ 3", "วิทยาศาสตร์ 5", "วิทยาศาสตร์กายภาพ 1", "ชีววิทยา 2", "ฟิสิกส์ 4"] },
  { letter: "ส", names: ["สังคมศึกษา 1", "สังคมศึกษา 3", "สังคมศึกษา 5", "สังคมศึกษา 1", "สังคมศึกษา 3", "สังคมศึกษา 5"] },
  { letter: "อ", names: ["ภาษาอังกฤษ 1", "ภาษาอังกฤษ 3", "ภาษาอังกฤษ 5", "ภาษาอังกฤษ 1", "ภาษาอังกฤษ 3", "ภาษาอังกฤษ 5"] },
  { letter: "พ", names: ["สุขศึกษาและพลศึกษา 1", "สุขศึกษาและพลศึกษา 3", "สุขศึกษาและพลศึกษา 5", "สุขศึกษาและพลศึกษา 1", "สุขศึกษาและพลศึกษา 3", "สุขศึกษาและพลศึกษา 5"] },
  { letter: "ศ", names: ["ศิลปะ 1", "ศิลปะ 3", "ศิลปะ 5", "ศิลปะ 1", "ศิลปะ 3", "ศิลปะ 5"] },
  { letter: "ง", names: ["การงานอาชีพ 1", "การงานอาชีพ 3", "การงานอาชีพ 5", "การงานอาชีพ 1", "การงานอาชีพ 3", "การงานอาชีพ 5"] },
];

export const SUBJECT_GROUPS_PER_GRADE = SUBJECT_TABLE.length;

function gradeCodeSuffix(grade: Grade): string {
  const level = grade <= 3 ? "2" : "3";
  const yearInLevel = ((grade - 1) % 3) + 1;
  return `${level}${yearInLevel}101`;
}

function subjectCode(letter: string, grade: Grade): string {
  return `${letter}${gradeCodeSuffix(grade)}`;
}

const TEACHER_NAMES: { name: string; department: string }[] = [
  { name: "ครูสมหญิง พากเพียร", department: "คณิตศาสตร์" },
  { name: "ครูสมชาย ใจดี", department: "คณิตศาสตร์" },
  { name: "ครูอารีย์ วงศ์สวัสดิ์", department: "ภาษาไทย" },
  { name: "ครูประวิทย์ เรืองศรี", department: "วิทยาศาสตร์" },
  { name: "ครูวิเชียร ศรีสุข", department: "วิทยาศาสตร์" },
  { name: "ครูจันทร์เพ็ญ สุขใจ", department: "ภาษาอังกฤษ" },
  { name: "ครูมานพ ธรรมรักษ์", department: "สังคมศึกษา" },
  { name: "ครูอนุชา ไพศาล", department: "ฝ่ายวิชาการ" },
  { name: "ครูนงลักษณ์ แก้วมณี", department: "ภาษาไทย" },
  { name: "ครูธีระ บุญมา", department: "สุขศึกษาและพลศึกษา" },
  { name: "ครูพิมพ์ใจ ศรีวิไล", department: "ศิลปะ" },
  { name: "ครูสุนีย์ อ่อนละมัย", department: "การงานอาชีพ" },
  { name: "ครูกิตติ สายทอง", department: "คณิตศาสตร์" },
  { name: "ครูรัตนา ชื่นบาน", department: "ภาษาอังกฤษ" },
  { name: "ครูวราภรณ์ ทองดี", department: "สังคมศึกษา" },
  { name: "ครูสมพงษ์ รุ่งเรือง", department: "วิทยาศาสตร์" },
  { name: "ครูอัมพร นิลวรรณ", department: "ภาษาไทย" },
  { name: "ครูชูชาติ พลอยงาม", department: "สุขศึกษาและพลศึกษา" },
  { name: "ครูดวงใจ ศรีสมบัติ", department: "ศิลปะ" },
  { name: "ครูประเสริฐ วงศ์ไทย", department: "การงานอาชีพ" },
  { name: "ครูกาญจนา บัวขาว", department: "คณิตศาสตร์" },
  { name: "ครูสุรชัย เดชอุดม", department: "วิทยาศาสตร์" },
  { name: "ครูปิยะดา แสงจันทร์", department: "ภาษาอังกฤษ" },
  { name: "ครูวินัย ทองเจือ", department: "สังคมศึกษา" },
  { name: "ครูศิริพร กองแก้ว", department: "ภาษาไทย" },
  { name: "ครูอดิศักดิ์ มั่นคง", department: "วิทยาศาสตร์" },
  { name: "ครูเบญจมาศ ทิพย์รักษ์", department: "คณิตศาสตร์" },
  { name: "ครูวีระพงษ์ ใจกล้า", department: "สุขศึกษาและพลศึกษา" },
  { name: "ครูสายฝน คำแก้ว", department: "ศิลปะ" },
  { name: "ครูธวัชชัย พูนสุข", department: "การงานอาชีพ" },
  { name: "ครูนิภาพร ทองสุข", department: "ภาษาอังกฤษ" },
  { name: "ครูสมบูรณ์ แก้วใส", department: "สังคมศึกษา" },
  { name: "ครูจิราพร วิไลลักษณ์", department: "ภาษาไทย" },
  { name: "ครูประพันธ์ ทรงศรี", department: "คณิตศาสตร์" },
  { name: "ครูมาลี สุขสมบูรณ์", department: "วิทยาศาสตร์" },
  { name: "ครูสมศักดิ์ ยอดเยี่ยม", department: "สุขศึกษาและพลศึกษา" },
  { name: "ครูอรทัย เพชรรัตน์", department: "ศิลปะ" },
  { name: "ครูบุญเลิศ ทับทิม", department: "การงานอาชีพ" },
  { name: "ครูลัดดา จันทร์งาม", department: "ภาษาอังกฤษ" },
  { name: "ครูสุเทพ วัฒนกุล", department: "สังคมศึกษา" },
  { name: "ครูรุ่งนภา ศิริวงศ์", department: "ภาษาไทย" },
];

export const TEACHERS: Teacher[] = TEACHER_NAMES.map((t, i) => ({
  id: `t${i + 1}`,
  name: t.name,
  department: t.department,
}));

function teacherFor(letter: string, grade: Grade): Teacher {
  const deptMap: Record<string, string> = {
    ท: "ภาษาไทย",
    ค: "คณิตศาสตร์",
    ว: "วิทยาศาสตร์",
    ส: "สังคมศึกษา",
    อ: "ภาษาอังกฤษ",
    พ: "สุขศึกษาและพลศึกษา",
    ศ: "ศิลปะ",
    ง: "การงานอาชีพ",
  };
  const dept = deptMap[letter];
  const candidates = TEACHERS.filter((t) => t.department === dept);
  const idx = (grade - 1) % Math.max(candidates.length, 1);
  return candidates[idx] ?? TEACHERS[0];
}

interface PoolSlot {
  day: 1 | 2;
  session: "morning" | "afternoon";
}

// Deterministic pseudo-distribution for the 28 "already scheduled" subjects
// across the 2-day / morning-afternoon grid. Actual times within a cell are
// computed automatically (sequential, back-to-back) by computeCellTimes().
const SCHEDULE_POOL: PoolSlot[] = [
  { day: 1, session: "morning" },
  { day: 1, session: "afternoon" },
  { day: 2, session: "morning" },
  { day: 2, session: "afternoon" },
];

function buildSubmissions(): Submission[] {
  const submissions: Submission[] = [];
  let seq = 0;

  // How many of the 8 subject-groups have submitted, per grade — matches
  // the dashboard's "8/8, 7/8, 8/8, 6/8, 7/8, 6/8" progress bars (42 of 48).
  const submittedCountByGrade: Record<Grade, number> = { 1: 8, 2: 7, 3: 8, 4: 6, 5: 7, 6: 6 };
  // How many of those submitted end up already scheduled, per grade
  // (sums to 28 across all grades; remainder are "pending" = 14 total).
  const scheduledCountByGrade: Record<Grade, number> = { 1: 6, 2: 5, 3: 5, 4: 4, 5: 4, 6: 4 };
  // Morning-preference assignment for a handful of pending subjects
  // (chat: "5 วิชาระบุให้สอบเช้า" among the 14 pending).
  const morningPreferencePendingCodes = new Set(["อ23101", "ส31101", "ศ22101", "ง23101", "ค32101"]);

  for (const grade of GRADES) {
    const submittedCount = submittedCountByGrade[grade];
    const scheduledCount = scheduledCountByGrade[grade];
    const durations = [60, 60, 90, 60, 60, 45, 45, 90];
    let scheduledSoFar = 0;

    for (let i = 0; i < submittedCount; i++) {
      const group = SUBJECT_TABLE[i];
      const code = subjectCode(group.letter, grade);
      const subjectName = group.names[grade - 1];
      const teacher = teacherFor(group.letter, grade);
      const duration = durations[i % durations.length];
      const isScheduled = scheduledSoFar < scheduledCount;
      const pref: MorningPreference =
        i === 0 || i === 3 ? "morning" : i === 1 ? "afternoon-ok" : "none";

      let slot: { day: 1 | 2; session: "morning" | "afternoon" } | undefined;
      if (isScheduled) {
        const poolIdx = (grade - 1 + i) % SCHEDULE_POOL.length;
        const chosen = SCHEDULE_POOL[poolIdx];
        slot = { day: chosen.day, session: chosen.session };
        scheduledSoFar++;
      }

      const submission: Submission = {
        id: `sub-${++seq}`,
        code,
        subjectName,
        teacherId: teacher.id,
        teacherName: teacher.name,
        grade,
        rooms: i % 3 === 0 ? [] : [1, 2, 3].map((n) => n + (i % 4)),
        durationMinutes: duration,
        morningPreference: morningPreferencePendingCodes.has(code) ? "morning" : pref,
        status: isScheduled ? "scheduled" : "pending",
        slot,
        submittedAt: new Date(Date.now() - (seq * 37 + grade * 13) * 60_000).toISOString(),
      };

      submissions.push(submission);
    }
  }

  return submissions;
}

export const INITIAL_SUBMISSIONS: Submission[] = buildSubmissions();

export const EXPECTED_SUBJECTS_TOTAL = GRADES.length * SUBJECT_TABLE.length; // 48

export function cellKey(grade: Grade, day: 1 | 2, session: "morning" | "afternoon"): string {
  return `${grade}_${day}_${session}`;
}

export function buildInitialCellOrder(submissions: Submission[]): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  for (const s of submissions) {
    if (s.status === "scheduled" && s.slot) {
      const key = cellKey(s.grade, s.slot.day, s.slot.session);
      (order[key] ??= []).push(s.id);
    }
  }
  return order;
}
