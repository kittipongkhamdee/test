export type Grade = 1 | 2 | 3 | 4 | 5 | 6;

export type MorningPreference = "morning" | "afternoon-ok" | "none";

export type ExamDay = 1 | 2;
export type ExamSession = "morning" | "afternoon";

export interface Slot {
  day: ExamDay;
  session: ExamSession;
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

export interface ExamRoundMeta {
  id: string;
  name: string;
  academicYear: string;
  semester: number;
  submissionOpensAt: string | null; // ISO datetime
  submissionClosesAt: string | null; // ISO datetime
  publishDate: string | null; // ISO date
}

export interface ExamSlotMeta {
  day: ExamDay;
  session: ExamSession;
  examDate: string | null; // ISO date, null until the admin sets the real calendar date
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface SchoolMeta {
  schoolName: string;
  headAcademicName: string;
}

export type FormOptionCategory = "grade" | "room" | "duration" | "preference";

export interface FormOption {
  id: string;
  category: FormOptionCategory;
  value: string;
  label: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}
