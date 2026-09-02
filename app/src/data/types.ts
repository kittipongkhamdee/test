export type Grade = 1 | 2 | 3 | 4 | 5 | 6;

export type MorningPreference = "morning" | "afternoon-ok" | "none";

export type ExamDay = number;
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
  selfScheduled: boolean;
  selfScheduledNote: string;
}

export interface ExamRoundMeta {
  id: string;
  name: string;
  academicYear: string;
  semester: number;
  submissionOpensAt: string | null; // ISO datetime
  submissionClosesAt: string | null; // ISO datetime
  publishDate: string | null; // ISO date
  gapMinutes: number; // break between subjects in same cell
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
  logoUrl: string | null;
}

export type FormOptionCategory = "grade" | "duration" | "preference";

// How many exam rooms are selectable for each grade, e.g. { 1: 1, 2: 3 } means
// ม.1 only has room /1, ม.2 has /1..3. Keyed by grade number.
export type GradeRoomCounts = Record<number, number>;

export interface SubjectCatalogEntry {
  id: string;
  code: string;
  subjectName: string;
  grade: Grade;
  createdAt: string;
  teacherName?: string; // set for PP5-sourced entries; unset for manually-added catalog entries (open to any teacher)
}

export interface FormOption {
  id: string;
  category: FormOptionCategory;
  value: string;
  label: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}
