export type Grade = 1 | 2 | 3 | 4 | 5 | 6;

export type MorningPreference = "morning" | "afternoon-ok" | "none";

export type ExamDay = 1 | 2;
export type ExamSession = "morning" | "afternoon";

export interface Slot {
  day: ExamDay;
  session: ExamSession;
}

export const SLOT_TIME: Record<ExamSession, { start: string; end: string }> = {
  morning: { start: "08:30", end: "11:30" },
  afternoon: { start: "12:30", end: "15:30" },
};

export const EXAM_DAYS: { day: ExamDay; label: string; date: string }[] = [
  { day: 1, label: "พุธ", date: "4 มี.ค. 69" },
  { day: 2, label: "พฤหัสฯ", date: "5 มี.ค. 69" },
];

export interface Teacher {
  id: string;
  name: string;
  department: string;
}

export type SubmissionStatus = "draft" | "pending" | "scheduled";

export interface Submission {
  id: string;
  code: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  grade: Grade;
  rooms: number[]; // room numbers 1-8, empty/full = all rooms
  durationMinutes: number;
  morningPreference: MorningPreference;
  status: SubmissionStatus;
  slot?: Slot;
  manualStartMinutes?: number; // admin-forced start time override, minutes-from-midnight
  submittedAt: string; // ISO
}
