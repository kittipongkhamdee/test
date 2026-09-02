import type { ExamDay, ExamSession, Grade, GradeRoomCounts } from "./types";

export const GRADES: Grade[] = [1, 2, 3, 4, 5, 6];

export function gradeLabel(g: Grade): string {
  return `ม.${g}`;
}

export function cellKey(grade: Grade, day: ExamDay, session: ExamSession): string {
  return `${grade}_${day}_${session}`;
}

export function roomsForGrade(gradeRoomCounts: GradeRoomCounts, grade: Grade): number[] {
  const count = gradeRoomCounts[grade] ?? 1;
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function roomLabel(room: number): string {
  return `/${room}`;
}
