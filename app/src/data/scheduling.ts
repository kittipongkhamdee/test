import { SLOT_TIME, type ExamSession, type Submission } from "./types";

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

const GAP_MINUTES = 15;

/**
 * Given the ordered list of submissions placed in one grade/day/session cell,
 * compute each item's effective start/end time and flag overlaps.
 * Items normally chain back-to-back with a gap; a manually-set start time
 * can be moved earlier and collide with a neighbor, which is what should
 * trigger the red conflict warning.
 */
export function computeCellTimes(items: Submission[], session: ExamSession): CellTime[] {
  const sessionStart = toMinutes(SLOT_TIME[session].start);
  let cursor = sessionStart;
  const times: { id: string; start: number; end: number }[] = [];

  for (const item of items) {
    const start = item.manualStartMinutes ?? cursor;
    const end = start + item.durationMinutes;
    times.push({ id: item.id, start, end });
    cursor = Math.max(cursor, end) + GAP_MINUTES;
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
