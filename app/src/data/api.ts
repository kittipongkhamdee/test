import { supabase } from "../lib/supabase";
import type {
  ExamDay,
  ExamRoundMeta,
  ExamSession,
  ExamSlotMeta,
  Grade,
  MorningPreference,
  SchoolMeta,
  Submission,
  SubmissionStatus,
} from "./types";

interface SubmissionRow {
  id: string;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  grade_level: number;
  rooms: number[] | null;
  duration_minutes: number;
  session_preference: MorningPreference;
  status: SubmissionStatus;
  slot_day: number | null;
  slot_session: ExamSession | null;
  manual_start_minutes: number | null;
  sort_order: number;
  submitted_at: string;
}

function rowToSubmission(row: SubmissionRow): Submission {
  return {
    id: row.id,
    code: row.subject_code,
    subjectName: row.subject_name,
    teacherId: row.teacher_name,
    teacherName: row.teacher_name,
    grade: row.grade_level as Grade,
    rooms: row.rooms ?? [],
    durationMinutes: row.duration_minutes,
    morningPreference: row.session_preference,
    status: row.status,
    slot: row.slot_day && row.slot_session ? { day: row.slot_day as ExamDay, session: row.slot_session } : undefined,
    manualStartMinutes: row.manual_start_minutes ?? undefined,
    submittedAt: row.submitted_at,
  };
}

export interface RoundBundle {
  round: ExamRoundMeta;
  slots: ExamSlotMeta[];
  teachers: string[];
  school: SchoolMeta;
  submissions: Submission[];
}

export async function fetchActiveRoundBundle(): Promise<RoundBundle> {
  const { data: round, error: roundError } = await supabase
    .from("exam_rounds")
    .select("id, name, academic_year, semester, submission_deadline, publish_date")
    .eq("is_active", true)
    .limit(1)
    .single();
  if (roundError) throw roundError;

  const [{ data: slotRows, error: slotError }, { data: teacherRows, error: teacherError }, { data: subRows, error: subError }, { data: configRows, error: configError }] =
    await Promise.all([
      supabase
        .from("exam_round_slots")
        .select("day_number, session, exam_date, start_time, end_time")
        .eq("exam_round_id", round.id)
        .order("day_number")
        .order("session"),
      supabase.from("exam_teachers").select("full_name").order("full_name"),
      supabase
        .from("exam_submissions")
        .select(
          "id, subject_code, subject_name, teacher_name, grade_level, rooms, duration_minutes, session_preference, status, slot_day, slot_session, manual_start_minutes, sort_order, submitted_at",
        )
        .eq("exam_round_id", round.id),
      supabase.from("config").select("key, value").in("key", ["school_name", "head_academic"]),
    ]);
  if (slotError) throw slotError;
  if (teacherError) throw teacherError;
  if (subError) throw subError;
  if (configError) throw configError;

  const configMap = new Map((configRows ?? []).map((r) => [r.key, r.value]));

  return {
    round: {
      id: round.id,
      name: round.name,
      academicYear: round.academic_year,
      semester: round.semester,
      submissionDeadline: round.submission_deadline,
      publishDate: round.publish_date,
    },
    slots: (slotRows ?? []).map((s) => ({
      day: s.day_number as ExamDay,
      session: s.session as ExamSession,
      examDate: s.exam_date,
      start: s.start_time.slice(0, 5),
      end: s.end_time.slice(0, 5),
    })),
    teachers: (teacherRows ?? []).map((t) => t.full_name),
    school: {
      schoolName: configMap.get("school_name") ?? "",
      headAcademicName: configMap.get("head_academic") ?? "",
    },
    submissions: (subRows ?? []).map(rowToSubmission),
  };
}

export interface SubmitInput {
  examRoundId: string;
  code: string;
  subjectName: string;
  teacherName: string;
  grade: Grade;
  rooms: number[];
  durationMinutes: number;
  morningPreference: MorningPreference;
}

// Real subjects already exist in the catalog as "draft" rows (seeded from the
// school's subject list). Submitting the survey confirms an existing draft for
// that subject+grade if one exists, otherwise it adds a new subject.
export async function submitSubmission(input: SubmitInput): Promise<Submission> {
  const { data: existing, error: findError } = await supabase
    .from("exam_submissions")
    .select("id")
    .eq("exam_round_id", input.examRoundId)
    .eq("subject_code", input.code)
    .eq("grade_level", input.grade)
    .eq("status", "draft")
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  const payload = {
    subject_code: input.code,
    subject_name: input.subjectName,
    teacher_name: input.teacherName,
    grade_level: input.grade,
    rooms: input.rooms,
    duration_minutes: input.durationMinutes,
    session_preference: input.morningPreference,
    status: "pending" as SubmissionStatus,
    submitted_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("exam_submissions")
      .update(payload)
      .eq("id", existing.id)
      .select(
        "id, subject_code, subject_name, teacher_name, grade_level, rooms, duration_minutes, session_preference, status, slot_day, slot_session, manual_start_minutes, sort_order, submitted_at",
      )
      .single();
    if (error) throw error;
    return rowToSubmission(data);
  }

  const { data, error } = await supabase
    .from("exam_submissions")
    .insert({ exam_round_id: input.examRoundId, ...payload })
    .select(
      "id, subject_code, subject_name, teacher_name, grade_level, rooms, duration_minutes, session_preference, status, slot_day, slot_session, manual_start_minutes, sort_order, submitted_at",
    )
    .single();
  if (error) throw error;
  return rowToSubmission(data);
}

export interface PlacementPatch {
  status: SubmissionStatus;
  slot_day: number | null;
  slot_session: ExamSession | null;
  manual_start_minutes: number | null;
  sort_order?: number;
}

export async function updateSubmissionPlacement(id: string, patch: PlacementPatch): Promise<void> {
  const { error } = await supabase.from("exam_submissions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function bulkUpdatePlacements(updates: { id: string; patch: PlacementPatch }[]): Promise<void> {
  await Promise.all(updates.map((u) => updateSubmissionPlacement(u.id, u.patch)));
}

export async function updateManualStart(id: string, minutes: number | null): Promise<void> {
  const { error } = await supabase.from("exam_submissions").update({ manual_start_minutes: minutes }).eq("id", id);
  if (error) throw error;
}

export async function setRoundPublishDate(examRoundId: string, publishDate: string): Promise<void> {
  const { error } = await supabase.from("exam_rounds").update({ publish_date: publishDate }).eq("id", examRoundId);
  if (error) throw error;
}
