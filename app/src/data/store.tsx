import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
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
} from "./types";
import { cellKey } from "./mockData";
import { timeToMinutes } from "./scheduling";
import {
  addExamDay as apiAddExamDay,
  bulkUpdatePlacements,
  createFormOption,
  deleteExamDay as apiDeleteExamDay,
  deleteFormOption as apiDeleteFormOption,
  deleteSubmission as apiDeleteSubmission,
  fetchActiveRoundBundle,
  submitSubmission,
  updateFormOption as apiUpdateFormOption,
  updateManualStart,
  updateRoundSettings as apiUpdateRoundSettings,
  updateSchoolSettings as apiUpdateSchoolSettings,
  updateSlotExamDate as apiUpdateSlotExamDate,
  updateSubmissionDetails,
  type FormOptionInput,
  type PlacementPatch,
  type RoundSettingsInput,
  type SubmissionEditInput,
} from "./api";

const ADMIN_PASSWORD = "32140";
const ADMIN_STORAGE_KEY = "exam-scheduler-admin-unlocked";

interface DataState {
  loading: boolean;
  error: string | null;
  round: ExamRoundMeta | null;
  slots: ExamSlotMeta[];
  teachers: string[];
  school: SchoolMeta | null;
  submissions: Record<string, Submission>; // includes not-yet-confirmed "draft" catalog rows
  cellOrder: Record<string, string[]>;
  formOptions: FormOption[];
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
  formOptions: [],
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
  | {
      type: "LOADED";
      submissions: Submission[];
      round: ExamRoundMeta;
      slots: ExamSlotMeta[];
      teachers: string[];
      school: SchoolMeta;
      formOptions: FormOption[];
    }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "UPSERT_SUBMISSION"; submission: Submission }
  | { type: "REMOVE_SUBMISSION"; id: string }
  | { type: "UPDATE_ROUND"; round: ExamRoundMeta }
  | { type: "UPSERT_FORM_OPTION"; option: FormOption }
  | { type: "REMOVE_FORM_OPTION"; id: string }
  | { type: "PLACE"; id: string; day: ExamDay; session: ExamSession; index?: number }
  | { type: "UNPLACE"; id: string }
  | { type: "SET_MANUAL_START"; id: string; minutes: number | null }
  | { type: "AUTO_SCHEDULE"; rules: AutoScheduleRules }
  | { type: "CLEAR_SCHEDULE" }
  | { type: "UPDATE_SCHOOL"; school: SchoolMeta }
  | { type: "UPDATE_SLOT_DATE"; day: ExamDay; examDate: string | null }
  | { type: "ADD_SLOTS"; slots: ExamSlotMeta[] }
  | { type: "REMOVE_DAY"; day: ExamDay }
  | { type: "RESTORE_SCHEDULE"; submissions: Record<string, Submission>; cellOrder: Record<string, string[]> };

function removeFromAllCells(cellOrder: Record<string, string[]>, id: string): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(cellOrder)) {
    next[key] = ids.filter((x) => x !== id);
  }
  return next;
}

const HEAVY_MINUTES = 90;

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
        formOptions: action.formOptions,
      };
    case "LOAD_ERROR":
      return { ...state, loading: false, error: action.message };
    case "UPSERT_SUBMISSION":
      return { ...state, submissions: { ...state.submissions, [action.submission.id]: action.submission } };
    case "REMOVE_SUBMISSION": {
      const { [action.id]: _removed, ...submissions } = state.submissions;
      return { ...state, submissions, cellOrder: removeFromAllCells(state.cellOrder, action.id) };
    }
    case "UPDATE_ROUND":
      return { ...state, round: action.round };
    case "UPSERT_FORM_OPTION": {
      const exists = state.formOptions.some((o) => o.id === action.option.id);
      return {
        ...state,
        formOptions: exists
          ? state.formOptions.map((o) => (o.id === action.option.id ? action.option : o))
          : [...state.formOptions, action.option],
      };
    }
    case "REMOVE_FORM_OPTION":
      return { ...state, formOptions: state.formOptions.filter((o) => o.id !== action.id) };
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
    case "UPDATE_SCHOOL":
      return { ...state, school: action.school };
    case "UPDATE_SLOT_DATE":
      return {
        ...state,
        slots: state.slots.map((s) => (s.day === action.day ? { ...s, examDate: action.examDate } : s)),
      };
    case "CLEAR_SCHEDULE": {
      const submissions: Record<string, Submission> = {};
      for (const [id, s] of Object.entries(state.submissions)) {
        submissions[id] =
          s.status === "scheduled" ? { ...s, status: "pending", slot: undefined, manualStartMinutes: undefined } : s;
      }
      return { ...state, submissions, cellOrder: {} };
    }
    case "ADD_SLOTS":
      return { ...state, slots: [...state.slots, ...action.slots] };
    case "RESTORE_SCHEDULE":
      return { ...state, submissions: action.submissions, cellOrder: action.cellOrder };
    case "REMOVE_DAY": {
      const submissions: Record<string, Submission> = {};
      for (const [id, s] of Object.entries(state.submissions)) {
        submissions[id] =
          s.slot?.day === action.day ? { ...s, status: "pending", slot: undefined, manualStartMinutes: undefined } : s;
      }
      const cellOrder: Record<string, string[]> = {};
      for (const [key, ids] of Object.entries(state.cellOrder)) {
        const filtered = ids.filter((id) => submissions[id]?.slot !== undefined);
        if (filtered.length > 0) cellOrder[key] = filtered;
      }
      return {
        ...state,
        slots: state.slots.filter((s) => s.day !== action.day),
        submissions,
        cellOrder,
      };
    }
    case "AUTO_SCHEDULE": {
      const { rules } = action;
      const allCells = state.slots.map((s) => ({ day: s.day, session: s.session }));
      const pending = Object.values(state.submissions).filter((s) => s.status === "pending" && !s.selfScheduled);
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
        let candidates = allCells;
        if (rules.morningFirst && item.morningPreference === "morning") {
          candidates = allCells.filter((c) => c.session === "morning");
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
  examMenuEnabled: boolean;
  toggleExamMenu: () => void;
  submit: (input: {
    code: string;
    subjectName: string;
    teacherName: string;
    grade: Grade;
    rooms: number[];
    durationMinutes: number;
    morningPreference: MorningPreference;
    selfScheduled: boolean;
    selfScheduledNote: string;
  }) => Promise<Submission>;
  isAdmin: boolean;
  unlockAdmin: (password: string) => boolean;
  lockAdmin: () => void;
  removeSubmission: (id: string) => Promise<void>;
  editSubmission: (id: string, input: SubmissionEditInput) => Promise<Submission>;
  updateRoundSettings: (input: RoundSettingsInput) => Promise<void>;
  addFormOption: (input: FormOptionInput) => Promise<FormOption>;
  editFormOption: (id: string, patch: Partial<Pick<FormOptionInput, "label" | "icon" | "sortOrder" | "isActive">>) => Promise<FormOption>;
  removeFormOption: (id: string) => Promise<void>;
  updateSchoolSettings: (schoolName: string, logoUrl: string | null) => Promise<void>;
  updateSlotDate: (day: ExamDay, examDate: string | null) => Promise<void>;
  addExamDay: (morningStart: string, morningEnd: string, afternoonStart: string, afternoonEnd: string) => Promise<void>;
  removeExamDay: (day: ExamDay) => Promise<void>;
  pushUndoSnapshot: () => void;
  undoSchedule: () => void;
  canUndo: boolean;
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
          formOptions: bundle.formOptions,
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
        case "RESTORE_SCHEDULE": {
          const updates: { id: string; patch: PlacementPatch }[] = [];
          for (const sub of Object.values(state.submissions)) {
            if (sub.status === "scheduled" && action.submissions[sub.id]?.status !== "scheduled") {
              updates.push({ id: sub.id, patch: { status: "pending", slot_day: null, slot_session: null, manual_start_minutes: null } });
            }
          }
          for (const [, ids] of Object.entries(action.cellOrder)) {
            ids.forEach((id, i) => {
              const sub = action.submissions[id];
              if (!sub?.slot) return;
              updates.push({ id, patch: { status: "scheduled", slot_day: sub.slot.day, slot_session: sub.slot.session, manual_start_minutes: sub.manualStartMinutes ?? null, sort_order: i } });
            });
          }
          if (updates.length) bulkUpdatePlacements(updates).catch((err) => console.error("RESTORE_SCHEDULE persist failed", err));
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
      selfScheduled: boolean;
      selfScheduledNote: string;
    }) => {
      if (!state.round) throw new Error("ยังไม่มีรอบสอบที่เปิดใช้งาน");
      const saved = await submitSubmission({ examRoundId: state.round.id, ...input });
      dispatchRaw({ type: "UPSERT_SUBMISSION", submission: saved });
      return saved;
    },
    [state.round],
  );

  const [undoStack, setUndoStack] = useState<{ submissions: Record<string, Submission>; cellOrder: Record<string, string[]> }[]>([]);

  const pushUndoSnapshot = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-9), { submissions: state.submissions, cellOrder: state.cellOrder }]);
  }, [state.submissions, state.cellOrder]);

  const undoSchedule = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      dispatch({ type: "RESTORE_SCHEDULE", submissions: snap.submissions, cellOrder: snap.cellOrder });
      return prev.slice(0, -1);
    });
  }, [dispatch]);

  const canUndo = undoStack.length > 0;

  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [examMenuEnabled, setExamMenuEnabled] = useState(() => {
    try {
      return localStorage.getItem("exam-menu-enabled") === "1";
    } catch {
      return false;
    }
  });

  const toggleExamMenu = useCallback(() => {
    setExamMenuEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("exam-menu-enabled", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  const unlockAdmin = useCallback((password: string) => {
    const ok = password === ADMIN_PASSWORD;
    if (ok) {
      setIsAdmin(true);
      try {
        localStorage.setItem(ADMIN_STORAGE_KEY, "1");
      } catch {
        // storage unavailable — admin unlock still works for this session
      }
    }
    return ok;
  }, []);

  const lockAdmin = useCallback(() => {
    setIsAdmin(false);
    try {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const removeSubmission = useCallback(async (id: string) => {
    await apiDeleteSubmission(id);
    dispatchRaw({ type: "REMOVE_SUBMISSION", id });
  }, []);

  const editSubmission = useCallback(async (id: string, input: SubmissionEditInput) => {
    const saved = await updateSubmissionDetails(id, input);
    dispatchRaw({ type: "UPSERT_SUBMISSION", submission: saved });
    return saved;
  }, []);

  const updateRoundSettings = useCallback(
    async (input: RoundSettingsInput) => {
      if (!state.round) throw new Error("ยังไม่มีรอบสอบที่เปิดใช้งาน");
      await apiUpdateRoundSettings(state.round.id, input);
      dispatchRaw({
        type: "UPDATE_ROUND",
        round: {
          ...state.round,
          name: input.name,
          submissionOpensAt: input.submissionOpensAt,
          submissionClosesAt: input.submissionClosesAt,
        },
      });
    },
    [state.round],
  );

  const addFormOption = useCallback(async (input: FormOptionInput) => {
    const saved = await createFormOption(input);
    dispatchRaw({ type: "UPSERT_FORM_OPTION", option: saved });
    return saved;
  }, []);

  const editFormOption = useCallback(
    async (id: string, patch: Partial<Pick<FormOptionInput, "label" | "icon" | "sortOrder" | "isActive">>) => {
      const saved = await apiUpdateFormOption(id, patch);
      dispatchRaw({ type: "UPSERT_FORM_OPTION", option: saved });
      return saved;
    },
    [],
  );

  const removeFormOption = useCallback(async (id: string) => {
    await apiDeleteFormOption(id);
    dispatchRaw({ type: "REMOVE_FORM_OPTION", id });
  }, []);

  const updateSchoolSettings = useCallback(
    async (schoolName: string, logoUrl: string | null) => {
      await apiUpdateSchoolSettings(schoolName, logoUrl);
      dispatchRaw({
        type: "UPDATE_SCHOOL",
        school: { ...(state.school ?? { headAcademicName: "" }), schoolName, logoUrl },
      });
    },
    [state.school],
  );

  const updateSlotDate = useCallback(
    async (day: ExamDay, examDate: string | null) => {
      if (!state.round) throw new Error("ยังไม่มีรอบสอบที่เปิดใช้งาน");
      await apiUpdateSlotExamDate(state.round.id, day, examDate);
      dispatchRaw({ type: "UPDATE_SLOT_DATE", day, examDate });
    },
    [state.round],
  );

  const addExamDay = useCallback(
    async (morningStart: string, morningEnd: string, afternoonStart: string, afternoonEnd: string) => {
      if (!state.round) throw new Error("ยังไม่มีรอบสอบที่เปิดใช้งาน");
      const existingDays = [...new Set(state.slots.map((s) => s.day))].sort((a, b) => a - b);
      const newDay = existingDays.length > 0 ? existingDays[existingDays.length - 1] + 1 : 1;
      const newSlots = await apiAddExamDay(state.round.id, newDay, morningStart, morningEnd, afternoonStart, afternoonEnd);
      dispatchRaw({ type: "ADD_SLOTS", slots: newSlots });
    },
    [state.round, state.slots],
  );

  const removeExamDay = useCallback(
    async (day: ExamDay) => {
      if (!state.round) throw new Error("ยังไม่มีรอบสอบที่เปิดใช้งาน");
      await apiDeleteExamDay(state.round.id, day);
      dispatchRaw({ type: "REMOVE_DAY", day });
    },
    [state.round],
  );

  const value = useMemo(
    () => ({
      state,
      dispatch,
      examMenuEnabled,
      toggleExamMenu,
      submit,
      isAdmin,
      unlockAdmin,
      lockAdmin,
      removeSubmission,
      editSubmission,
      updateRoundSettings,
      addFormOption,
      editFormOption,
      removeFormOption,
      updateSchoolSettings,
      updateSlotDate,
      addExamDay,
      removeExamDay,
      pushUndoSnapshot,
      undoSchedule,
      canUndo,
    }),
    [
      state,
      dispatch,
      examMenuEnabled,
      toggleExamMenu,
      submit,
      isAdmin,
      unlockAdmin,
      lockAdmin,
      removeSubmission,
      editSubmission,
      updateRoundSettings,
      addFormOption,
      editFormOption,
      removeFormOption,
      updateSchoolSettings,
      updateSlotDate,
      addExamDay,
      removeExamDay,
      pushUndoSnapshot,
      undoSchedule,
      canUndo,
    ],
  );
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

// All options for a category (any status), sorted for the admin management list.
export function useFormOptions(category: FormOptionCategory): FormOption[] {
  const { state } = useStore();
  return useMemo(
    () => state.formOptions.filter((o) => o.category === category).sort((a, b) => a.sortOrder - b.sortOrder),
    [state.formOptions, category],
  );
}

// Only the enabled options, for rendering the survey form's chips.
export function useActiveFormOptions(category: FormOptionCategory): FormOption[] {
  const options = useFormOptions(category);
  return useMemo(() => options.filter((o) => o.isActive), [options]);
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
