import type { ExamDay, ExamSession, Grade } from "./types";

export const ROOMS_PER_GRADE = 8;
export const GRADES: Grade[] = [1, 2, 3, 4, 5, 6];

export function gradeLabel(g: Grade): string {
  return `ม.${g}`;
}

export function cellKey(grade: Grade, day: ExamDay, session: ExamSession): string {
  return `${grade}_${day}_${session}`;
}
