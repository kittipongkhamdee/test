import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { ExamDay, ExamSession, Submission } from "./types";
import { buildInitialCellOrder, cellKey, INITIAL_SUBMISSIONS } from "./mockData";
import { timeToMinutes } from "./scheduling";

const STORAGE_KEY = "exam-scheduler-state-v1";

interface State {
  submissions: Record<string, Submission>;
  cellOrder: Record<string, string[]>;
}

function loadInitialState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    // fall through to fresh mock state
  }
  const submissions: Record<string, Submission> = {};
  for (const s of INITIAL_SUBMISSIONS) submissions[s.id] = s;
  return { submissions, cellOrder: buildInitialCellOrder(INITIAL_SUBMISSIONS) };
}

export interface AutoScheduleRules {
  morningFirst: boolean;
  balanceLoad: boolean;
  spreadHeavy: boolean;
}

type Action =
  | { type: "SUBMIT"; submission: Submission }
  | { type: "UPDATE_SUBMISSION"; id: string; patch: Partial<Submission> }
  | { type: "PLACE"; id: string; day: ExamDay; session: ExamSession; index?: number }
  | { type: "UNPLACE"; id: string }
  | { type: "SET_MANUAL_START"; id: string; minutes: number | null }
  | { type: "AUTO_SCHEDULE"; rules: AutoScheduleRules }
  | { type: "CLEAR_SCHEDULE" }
  | { type: "RESET_DEMO" };

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

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SUBMIT": {
      return {
        ...state,
        submissions: { ...state.submissions, [action.submission.id]: action.submission },
      };
    }
    case "UPDATE_SUBMISSION": {
      const existing = state.submissions[action.id];
      if (!existing) return state;
      return {
        ...state,
        submissions: { ...state.submissions, [action.id]: { ...existing, ...action.patch } },
      };
    }
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
      return { submissions, cellOrder: {} };
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
      const heavyDayUsed = new Map<string, Set<ExamDay>>(); // per grade: days that already have a heavy subject

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

      return { submissions, cellOrder };
    }
    case "RESET_DEMO": {
      const submissions: Record<string, Submission> = {};
      for (const s of INITIAL_SUBMISSIONS) submissions[s.id] = s;
      return { submissions, cellOrder: buildInitialCellOrder(INITIAL_SUBMISSIONS) };
    }
    default:
      return state;
  }
}

interface StoreContextValue {
  state: State;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable — ignore, in-memory state still works
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function useSubmissions(): Submission[] {
  const { state } = useStore();
  return useMemo(() => Object.values(state.submissions), [state.submissions]);
}

export function useCellItems(grade: number, day: ExamDay, session: ExamSession): Submission[] {
  const { state } = useStore();
  const key = cellKey(grade as 1 | 2 | 3 | 4 | 5 | 6, day, session);
  return useMemo(() => {
    const ids = state.cellOrder[key] ?? [];
    return ids.map((id) => state.submissions[id]).filter(Boolean);
  }, [state.cellOrder, state.submissions, key]);
}

export { timeToMinutes };
