import type { Submission } from "./types";

export interface CellTime {
  id: string;
  start: string;
  end: string;
  conflict: boolean;
  conflictWith: string[]; // codes of overlapping subjects
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function computeCellTimes(items: Submission[], sessionStartTime: string, gapMinutes = 15): CellTime[] {
  let cursor = toMinutes(sessionStartTime);
  const times: { id: string; start: number; end: number }[] = [];

  for (const item of items) {
    const start = cursor;
    const end = start + item.durationMinutes;
    times.push({ id: item.id, start, end });
    cursor = Math.max(cursor, end) + gapMinutes;
  }

  return times.map((t, i) => {
    const conflictsWith: string[] = [];
    times.forEach((other, j) => {
      if (i === j) return;
      const overlap = t.start < other.end && other.start < t.end;
      if (overlap) {
        const otherSubmission = items[j];
        conflictsWith.push(otherSubmission.code);
      }
    });
    return {
      id: t.id,
      start: toHHMM(t.start),
      end: toHHMM(t.end),
      conflict: conflictsWith.length > 0,
      conflictWith: conflictsWith,
    };
  });
}

export function timeToMinutes(hhmm: string): number {
  return toMinutes(hhmm);
}

export function minutesToTime(mins: number): string {
  return toHHMM(mins);
}
