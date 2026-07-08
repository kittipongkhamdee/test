import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { ExamDay, ExamRoundMeta, ExamSession, ExamSlotMeta, Grade, MorningPreference, SchoolMeta, Submission } from "./types";
import { cellKey } from "./mockData";
import { timeToMinutes } from "./scheduling";
import {
  bulkUpdatePlacements,
  fetchActiveRoundBundle,
  submitSubmission,
  updateManualStart,
  type PlacementPatch,
} from "./api";

interface DataState {
  loading: boolean;
  error: string | null;
  round: ExamRoundMeta | null;
  slots: ExamSlotMeta[];
  teachers: string[];
  school: SchoolMeta | null;
  submissions: Record<string, Submission>; // includes not-yet-confirmed "draft" catalog rows
  cellOrder: Record<string, string[]>;
}

const initialState: DataState = {
  loading: true,
  error: null,
  round: null,
  slots: [],
  teachers: [],
  school: null,
  submissions: {},
  cellOrder: {},
};

function buildCellOrder(submissions: Submission[]): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  for (const s of submissions) {
    if (s.status === "scheduled" && s.slot) {
      const key = cellKey(s.grade, s.slot.day, s.slot.session);
      (order[key] ??= []).push(s.id);
    }
  }
  return order;
}

export interface AutoScheduleRules {
  morningFirst: boolean;
  balanceLoad: boolean;
  spreadHeavy: boolean;
}

type Action =
  | { type: "LOADED"; submissions: Submission[]; round: ExamRoundMeta; slots: ExamSlotMeta[]; teachers: string[]; school: SchoolMeta }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "UPSERT_SUBMISSION"; submission: Submission }
  | { type: "PLACE"; id: string; day: ExamDay; session: ExamSession; index?: number }
  | { type: "UNPLACE"; id: string }
  | { type: "SET_MANUAL_START"; id: string; minutes: number | null }
  | { type: "AUTO_SCHEDULE"; rules: AutoScheduleRules }
  | { type: "CLEAR_SCHEDULE" };

function removeFromAllCells(cellOrder: Record<string, string[]>, id: string): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(cellOrder)) {
    next[key] = ids.filter((x) => x !== id);
  }
  return next;
}

const HEAVY_MINUTES = 90;
const ALL_CELLS: { day: ExamDay; session: ExamSession }[] = [
  { day: 1, session: "morning" },
  { day: 1, session: "afternoon" },
  { day: 2, session: "morning" },
  { day: 2, session: "afternoon" },
];

function reducer(state: DataState, action: Action): DataState {
  switch (action.type) {
    case "LOADED":
      return {
        ...state,
        loading: false,
        error: null,
        round: action.round,
        slots: action.slots,
        teachers: action.teachers,
        school: action.school,
        submissions: Object.fromEntries(action.submissions.map((s) => [s.id, s])),
        cellOrder: buildCellOrder(action.submissions),
      };
    case "LOAD_ERROR":
      return { ...state, loading: false, error: action.message };
    case "UPSERT_SUBMISSION":
      return { ...state, submissions: { ...state.submissions, [action.submission.id]: action.submission } };
    case "PLACE": {
      const existing = state.submissions[action.id];
      if (!existing) return state;
      const key = cellKey(existing.grade, action.day, action.session);
      const cleared = removeFromAllCells(state.cellOrder, action.id);
      const targetList = cleared[key] ? [...cleared[key]] : [];
      const insertAt = action.index ?? targetList.length;
      targetList.splice(insertAt, 0, action.id);
      const sameCell = existing.slot?.day === action.day && existing.slot?.session === action.session;
      return {
        ...state,
        submissions: {
          ...state.submissions,
          [action.id]: {
            ...existing,
            status: "scheduled",
            slot: { day: action.day, session: action.session },
            manualStartMinutes: sameCell ? existing.manualStartMinutes : undefined,
          },
        },
        cellOrder: { ...cleared, [key]: targetList },
      };
    }
    case "UNPLACE": {
      const existing = state.submissions[action.id];
      if (!existing) return state;
      return {
        ...state,
        submissions: {
          ...state.submissions,
          [action.id]: { ...existing, status: "pending", slot: undefined, manualStartMinutes: undefined },
        },
        cellOrder: removeFromAllCells(state.cellOrder, action.id),
      };
    }
    case "SET_MANUAL_START": {
      const existing = state.submissions[action.id];
      if (!existing) return state;
      return {
        ...state,
        submissions: {
          ...state.submissions,
          [action.id]: { ...existing, manualStartMinutes: action.minutes ?? undefined },
        },
      };
    }
    case "CLEAR_SCHEDULE": {
      const submissions: Record<string, Submission> = {};
      for (const [id, s] of Object.entries(state.submissions)) {
        submissions[id] =
          s.status === "scheduled" ? { ...s, status: "pending", slot: undefined, manualStartMinutes: undefined } : s;
      }
      return { ...state, submissions, cellOrder: {} };
    }
    case "AUTO_SCHEDULE": {
      const { rules } = action;
      const pending = Object.values(state.submissions).filter((s) => s.status === "pending");
      const sorted = [...pending].sort((a, b) => {
        if (rules.morningFirst) {
          const aMorning = a.morningPreference === "morning" ? 0 : 1;
          const bMorning = b.morningPreference === "morning" ? 0 : 1;
          if (aMorning !== bMorning) return aMorning - bMorning;
        }
        if (rules.spreadHeavy) {
          return b.durationMinutes - a.durationMinutes;
        }
        return 0;
      });

      const cellOrder: Record<string, string[]> = { ...state.cellOrder };
      const loadMinutes = new Map<string, number>();
      const heavyDayUsed = new Map<string, Set<ExamDay>>();
      const loadOf = (key: string) => loadMinutes.get(key) ?? 0;
      const submissions = { ...state.submissions };

      for (const item of sorted) {
        let candidates = ALL_CELLS;
        if (rules.morningFirst && item.morningPreference === "morning") {
          candidates = ALL_CELLS.filter((c) => c.session === "morning");
        }
        if (rules.spreadHeavy && item.durationMinutes >= HEAVY_MINUTES) {
          const usedDays = heavyDayUsed.get(String(item.grade)) ?? new Set<ExamDay>();
          const withoutHeavyDay = candidates.filter((c) => !usedDays.has(c.day));
          if (withoutHeavyDay.length > 0) candidates = withoutHeavyDay;
        }

        let chosen = candidates[0];
        if (rules.balanceLoad) {
          chosen = candidates.reduce((best, c) => {
            const key = cellKey(item.grade, c.day, c.session);
            const bestKey = cellKey(item.grade, best.day, best.session);
            return loadOf(key) < loadOf(bestKey) ? c : best;
          }, candidates[0]);
        }

        const key = cellKey(item.grade, chosen.day, chosen.session);
        cellOrder[key] = [...(cellOrder[key] ?? []), item.id];
        loadMinutes.set(key, loadOf(key) + item.durationMinutes + 15);
        if (item.durationMinutes >= HEAVY_MINUTES) {
          const usedDays = heavyDayUsed.get(String(item.grade)) ?? new Set<ExamDay>();
          usedDays.add(chosen.day);
          heavyDayUsed.set(String(item.grade), usedDays);
        }

        submissions[item.id] = {
          ...item,
          status: "scheduled",
          slot: { day: chosen.day, session: chosen.session },
          manualStartMinutes: undefined,
        };
      }

      return { ...state, submissions, cellOrder };
    }
    default:
      return state;
  }
}

interface StoreContextValue {
  state: DataState;
  dispatch: (action: Action) => void;
  submit: (input: {
    code: string;
    subjectName: string;
    teacherName: string;
    grade: Grade;
    rooms: number[];
    durationMinutes: number;
    morningPreference: MorningPreference;
  }) => Promise<Submission>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function persistSortOrder(cellOrder: Record<string, string[]>, key: string, submissions: Record<string, Submission>) {
  const ids = cellOrder[key] ?? [];
  return ids.map((id, index) => {
    const s = submissions[id];
    const patch: PlacementPatch = {
      status: "scheduled",
      slot_day: s.slot!.day,
      slot_session: s.slot!.session,
      manual_start_minutes: s.manualStartMinutes ?? null,
      sort_order: index,
    };
    return { id, patch };
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatchRaw] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    fetchActiveRoundBundle()
      .then((bundle) => {
        if (cancelled) return;
        dispatchRaw({
          type: "LOADED",
          submissions: bundle.submissions,
          round: bundle.round,
          slots: bundle.slots,
          teachers: bundle.teachers,
          school: bundle.school,
        });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        dispatchRaw({ type: "LOAD_ERROR", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dispatch = useCallback(
    (action: Action) => {
      // Compute the next state with the same pure reducer the useReducer hook
      // uses, so persistence always matches exactly what the UI just applied.
      const next = reducer(state, action);
      dispatchRaw(action);

      switch (action.type) {
        case "PLACE": {
          const existing = state.submissions[action.id];
          if (!existing) break;
          const key = cellKey(existing.grade, action.day, action.session);
          const updates = persistSortOrder(next.cellOrder, key, next.submissions);
          bulkUpdatePlacements(updates).catch((err) => console.error("PLACE persist failed", err));
          break;
        }
        case "UNPLACE": {
          updateSubmissionUnplace(action.id).catch((err) => console.error("UNPLACE persist failed", err));
          break;
        }
        case "SET_MANUAL_START": {
          updateManualStart(action.id, action.minutes).catch((err) => console.error("SET_MANUAL_START persist failed", err));
          break;
        }
        case "CLEAR_SCHEDULE": {
          const updates = Object.values(state.submissions)
            .filter((s) => s.status === "scheduled")
            .map((s) => ({
              id: s.id,
              patch: { status: "pending" as const, slot_day: null, slot_session: null, manual_start_minutes: null },
            }));
          bulkUpdatePlacements(updates).catch((err) => console.error("CLEAR_SCHEDULE persist failed", err));
          break;
        }
        case "AUTO_SCHEDULE": {
          const updates = Object.keys(next.cellOrder).flatMap((key) => persistSortOrder(next.cellOrder, key, next.submissions));
          bulkUpdatePlacements(updates).catch((err) => console.error("AUTO_SCHEDULE persist failed", err));
          break;
        }
      }
    },
    [state],
  );

  const submit = useCallback(
    async (input: {
      code: string;
      subjectName: string;
      teacherName: string;
      grade: Grade;
      rooms: number[];
      durationMinutes: number;
      morningPreference: MorningPreference;
    }) => {
      if (!state.round) throw new Error("ยังไม่มีรอบสอบที่เปิดใช้งาน");
      const saved = await submitSubmission({ examRoundId: state.round.id, ...input });
      dispatchRaw({ type: "UPSERT_SUBMISSION", submission: saved });
      return saved;
    },
    [state.round],
  );

  const value = useMemo(() => ({ state, dispatch, submit }), [state, dispatch, submit]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

async function updateSubmissionUnplace(id: string) {
  await bulkUpdatePlacements([
    { id, patch: { status: "pending", slot_day: null, slot_session: null, manual_start_minutes: null } },
  ]);
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// Confirmed submissions only — the pre-loaded subject catalog ("draft" rows,
// not yet confirmed by a teacher through the survey) is excluded here.
export function useSubmissions(): Submission[] {
  const { state } = useStore();
  return useMemo(() => Object.values(state.submissions).filter((s) => s.status !== "draft"), [state.submissions]);
}

// All catalog rows regardless of status — used for "expected total" counts.
export function useCatalog(): Submission[] {
  const { state } = useStore();
  return useMemo(() => Object.values(state.submissions), [state.submissions]);
}

export function useCellItems(grade: number, day: ExamDay, session: ExamSession): Submission[] {
  const { state } = useStore();
  const key = cellKey(grade as Grade, day, session);
  return useMemo(() => {
    const ids = state.cellOrder[key] ?? [];
    return ids.map((id) => state.submissions[id]).filter(Boolean);
  }, [state.cellOrder, state.submissions, key]);
}

export { timeToMinutes };
