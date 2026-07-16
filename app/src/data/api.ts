import { supabase } from "../lib/supabase";
import type {
  ExamDay,
  ExamRoundMeta,
  ExamSession,
  ExamSlotMeta,
  FormOption,
  FormOptionCategory,
  Grade,
  MorningPreference,
  SchoolMeta,
  Submission,
  SubmissionStatus,
  SubjectCatalogEntry,
} from "./types";

interface FormOptionRow {
  id: string;
  category: FormOptionCategory;
  value: string;
  label: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

function rowToFormOption(row: FormOptionRow): FormOption {
  return {
    id: row.id,
    category: row.category,
    value: row.value,
    label: row.label,
    icon: row.icon,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

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
  self_scheduled: boolean;
  self_scheduled_note: string;
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
    selfScheduled: row.self_scheduled ?? false,
    selfScheduledNote: row.self_scheduled_note ?? "",
  };
}

export interface RoundBundle {
  round: ExamRoundMeta;
  slots: ExamSlotMeta[];
  teachers: string[];
  school: SchoolMeta;
  submissions: Submission[];
  formOptions: FormOption[];
}

export async function fetchActiveRoundBundle(): Promise<RoundBundle> {
  const { data: round, error: roundError } = await supabase
    .from("exam_rounds")
    .select("id, name, academic_year, semester, submission_opens_at, submission_closes_at, publish_date, gap_minutes")
    .eq("is_active", true)
    .limit(1)
    .single();
  if (roundError) throw roundError;

  const [
    { data: slotRows, error: slotError },
    { data: teacherRows, error: teacherError },
    { data: subRows, error: subError },
    { data: configRows, error: configError },
    { data: formOptionRows, error: formOptionError },
  ] = await Promise.all([
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
        "id, subject_code, subject_name, teacher_name, grade_level, rooms, duration_minutes, session_preference, status, slot_day, slot_session, manual_start_minutes, sort_order, submitted_at, self_scheduled, self_scheduled_note",
      )
      .eq("exam_round_id", round.id)
      .order("sort_order")
      .order("submitted_at"),
    supabase.from("config").select("key, value").in("key", ["school_name", "head_academic", "school_logo"]),
    supabase.from("exam_form_options").select("id, category, value, label, icon, sort_order, is_active").order("sort_order"),
  ]);
  if (slotError) throw slotError;
  if (teacherError) throw teacherError;
  if (subError) throw subError;
  if (configError) throw configError;
  if (formOptionError) throw formOptionError;

  const configMap = new Map((configRows ?? []).map((r) => [r.key, r.value]));

  return {
    round: {
      id: round.id,
      name: round.name,
      academicYear: round.academic_year,
      semester: round.semester,
      submissionOpensAt: round.submission_opens_at,
      submissionClosesAt: round.submission_closes_at,
      publishDate: round.publish_date,
      gapMinutes: round.gap_minutes ?? 15,
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
      logoUrl: configMap.get("school_logo") || null,
    },
    submissions: (subRows ?? []).map(rowToSubmission),
    formOptions: (formOptionRows ?? []).map(rowToFormOption),
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
  selfScheduled: boolean;
  selfScheduledNote: string;
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
    self_scheduled: input.selfScheduled,
    self_scheduled_note: input.selfScheduledNote,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("exam_submissions")
      .update(payload)
      .eq("id", existing.id)
      .select(
        "id, subject_code, subject_name, teacher_name, grade_level, rooms, duration_minutes, session_preference, status, slot_day, slot_session, manual_start_minutes, sort_order, submitted_at, self_scheduled, self_scheduled_note",
      )
      .single();
    if (error) throw error;
    return rowToSubmission(data);
  }

  const { data, error } = await supabase
    .from("exam_submissions")
    .insert({ exam_round_id: input.examRoundId, ...payload })
    .select(
      "id, subject_code, subject_name, teacher_name, grade_level, rooms, duration_minutes, session_preference, status, slot_day, slot_session, manual_start_minutes, sort_order, submitted_at, self_scheduled, self_scheduled_note",
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

export interface RoundSettingsInput {
  name: string;
  submissionOpensAt: string | null;
  submissionClosesAt: string | null;
  gapMinutes: number;
}

export interface NewRoundInput {
  name: string;
  academicYear: string;
  semester: number;
  submissionOpensAt: string | null;
  submissionClosesAt: string | null;
}

export async function createNewExamRound(currentRoundId: string, input: NewRoundInput): Promise<void> {
  const { data: slotRows, error: slotError } = await supabase
    .from("exam_round_slots")
    .select("day_number, session, start_time, end_time")
    .eq("exam_round_id", currentRoundId);
  if (slotError) throw slotError;

  const { data: newRound, error: roundError } = await supabase
    .from("exam_rounds")
    .insert({
      name: input.name,
      academic_year: input.academicYear,
      semester: input.semester,
      is_active: true,
      submission_opens_at: input.submissionOpensAt,
      submission_closes_at: input.submissionClosesAt,
    })
    .select("id")
    .single();
  if (roundError) throw roundError;

  const { error: deactivateError } = await supabase
    .from("exam_rounds")
    .update({ is_active: false })
    .eq("id", currentRoundId);
  if (deactivateError) throw deactivateError;

  if (slotRows && slotRows.length > 0) {
    const { error: slotInsertError } = await supabase
      .from("exam_round_slots")
      .insert(
        slotRows.map((s) => ({
          exam_round_id: newRound.id,
          day_number: s.day_number,
          session: s.session,
          start_time: s.start_time,
          end_time: s.end_time,
          exam_date: null,
        }))
      );
    if (slotInsertError) throw slotInsertError;
  }
}

export async function updateRoundSettings(examRoundId: string, input: RoundSettingsInput): Promise<void> {
  const { error } = await supabase
    .from("exam_rounds")
    .update({
      name: input.name,
      submission_opens_at: input.submissionOpensAt,
      submission_closes_at: input.submissionClosesAt,
      gap_minutes: input.gapMinutes,
    })
    .eq("id", examRoundId);
  if (error) throw error;
}

export async function updateSlotTimes(
  examRoundId: string,
  day: ExamDay,
  session: ExamSession,
  start: string,
  end: string,
): Promise<void> {
  const { error } = await supabase
    .from("exam_round_slots")
    .update({ start_time: start + ":00", end_time: end + ":00" })
    .eq("exam_round_id", examRoundId)
    .eq("day_number", day)
    .eq("session", session);
  if (error) throw error;
}

export async function deleteSubmission(id: string): Promise<void> {
  const { error } = await supabase.from("exam_submissions").delete().eq("id", id);
  if (error) throw error;
}

export interface SubmissionEditInput {
  code: string;
  subjectName: string;
  teacherName: string;
  grade: Grade;
  rooms: number[];
  durationMinutes: number;
  morningPreference: MorningPreference;
}

export async function updateSubmissionDetails(id: string, input: SubmissionEditInput): Promise<Submission> {
  const { data, error } = await supabase
    .from("exam_submissions")
    .update({
      subject_code: input.code,
      subject_name: input.subjectName,
      teacher_name: input.teacherName,
      grade_level: input.grade,
      rooms: input.rooms,
      duration_minutes: input.durationMinutes,
      session_preference: input.morningPreference,
    })
    .eq("id", id)
    .select(
      "id, subject_code, subject_name, teacher_name, grade_level, rooms, duration_minutes, session_preference, status, slot_day, slot_session, manual_start_minutes, sort_order, submitted_at, self_scheduled, self_scheduled_note",
    )
    .single();
  if (error) throw error;
  return rowToSubmission(data);
}

export interface FormOptionInput {
  category: FormOptionCategory;
  value: string;
  label: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
}

export async function createFormOption(input: FormOptionInput): Promise<FormOption> {
  const { data, error } = await supabase
    .from("exam_form_options")
    .insert({
      category: input.category,
      value: input.value,
      label: input.label,
      icon: input.icon,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select("id, category, value, label, icon, sort_order, is_active")
    .single();
  if (error) throw error;
  return rowToFormOption(data);
}

export async function updateFormOption(
  id: string,
  patch: Partial<Pick<FormOptionInput, "label" | "icon" | "sortOrder" | "isActive">>,
): Promise<FormOption> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.label !== undefined) dbPatch.label = patch.label;
  if (patch.icon !== undefined) dbPatch.icon = patch.icon;
  if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) dbPatch.is_active = patch.isActive;

  const { data, error } = await supabase
    .from("exam_form_options")
    .update(dbPatch)
    .eq("id", id)
    .select("id, category, value, label, icon, sort_order, is_active")
    .single();
  if (error) throw error;
  return rowToFormOption(data);
}

export async function deleteFormOption(id: string): Promise<void> {
  const { error } = await supabase.from("exam_form_options").delete().eq("id", id);
  if (error) throw error;
}

export async function updateSchoolSettings(schoolName: string, logoUrl: string | null): Promise<void> {
  const rows = [
    { key: "school_name", value: schoolName },
    { key: "school_logo", value: logoUrl ?? "" },
  ];
  for (const row of rows) {
    const { error } = await supabase.from("config").upsert(row, { onConflict: "key" });
    if (error) throw error;
  }
}

export async function updateSlotExamDate(examRoundId: string, day: ExamDay, examDate: string | null): Promise<void> {
  const { error } = await supabase
    .from("exam_round_slots")
    .update({ exam_date: examDate })
    .eq("exam_round_id", examRoundId)
    .eq("day_number", day);
  if (error) throw error;
}

export async function addExamDay(
  examRoundId: string,
  day: number,
  morningStart: string,
  morningEnd: string,
  afternoonStart: string,
  afternoonEnd: string,
): Promise<ExamSlotMeta[]> {
  const rows = [
    { exam_round_id: examRoundId, day_number: day, session: "morning", start_time: morningStart + ":00", end_time: morningEnd + ":00", exam_date: null },
    { exam_round_id: examRoundId, day_number: day, session: "afternoon", start_time: afternoonStart + ":00", end_time: afternoonEnd + ":00", exam_date: null },
  ];
  const { data, error } = await supabase
    .from("exam_round_slots")
    .insert(rows)
    .select("day_number, session, exam_date, start_time, end_time");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    day: s.day_number as ExamDay,
    session: s.session as ExamSession,
    examDate: s.exam_date,
    start: s.start_time.slice(0, 5),
    end: s.end_time.slice(0, 5),
  }));
}

export async function deleteExamDay(examRoundId: string, day: number): Promise<void> {
  const { error } = await supabase
    .from("exam_round_slots")
    .delete()
    .eq("exam_round_id", examRoundId)
    .eq("day_number", day);
  if (error) throw error;
}

interface SubjectCatalogRow {
  id: string;
  code: string;
  subject_name: string;
  grade: number;
  created_at: string;
}

function rowToCatalogEntry(row: SubjectCatalogRow): SubjectCatalogEntry {
  return {
    id: row.id,
    code: row.code,
    subjectName: row.subject_name,
    grade: row.grade as Grade,
    createdAt: row.created_at,
  };
}

interface Pp5SubjectRow {
  id: string;
  code: string;
  subject_name: string;
  grade: string; // text in subjects table
}

export async function fetchSubjectCatalog(): Promise<SubjectCatalogEntry[]> {
  // Pull from both PP5 subjects (via security-definer RPC) and manually-added catalog entries.
  const [rpcResult, manualResult] = await Promise.all([
    supabase.rpc("get_subject_catalog"),
    supabase.from("subject_catalog").select("id, code, subject_name, grade, created_at").order("grade").order("code"),
  ]);

  const pp5Entries: SubjectCatalogEntry[] = ((rpcResult.data ?? []) as Pp5SubjectRow[])
    .map((row) => ({
      id: `pp5_${row.id}`,
      code: row.code,
      subjectName: row.subject_name,
      grade: Number(row.grade) as Grade,
      createdAt: "",
    }))
    .filter((e) => e.grade >= 1 && e.grade <= 6);

  const manualEntries: SubjectCatalogEntry[] = (manualResult.data ?? []).map(rowToCatalogEntry);

  // Merge: PP5 entries first, then manual — deduplicate by code+grade.
  const seen = new Set<string>();
  const merged: SubjectCatalogEntry[] = [];
  for (const e of [...pp5Entries, ...manualEntries]) {
    const key = `${e.code.toLowerCase()}_${e.grade}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(e);
    }
  }
  return merged;
}

export interface SubjectCatalogInput {
  code: string;
  subjectName: string;
  grade: Grade;
}

export async function addSubjectCatalogEntry(input: SubjectCatalogInput): Promise<SubjectCatalogEntry> {
  const { data, error } = await supabase
    .from("subject_catalog")
    .insert({ code: input.code.trim(), subject_name: input.subjectName.trim(), grade: input.grade })
    .select("id, code, subject_name, grade, created_at")
    .single();
  if (error) throw error;
  return rowToCatalogEntry(data);
}

export async function deleteSubjectCatalogEntry(id: string): Promise<void> {
  const { error } = await supabase.from("subject_catalog").delete().eq("id", id);
  if (error) throw error;
}
