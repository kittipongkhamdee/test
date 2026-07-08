import { useState, useEffect } from "react";

export interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  expired: boolean;
  urgent: boolean; // less than 24 hours remaining
}

export function useCountdown(targetIso: string | null | undefined): CountdownResult | null {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!targetIso) return null;

  const totalMs = Math.max(0, new Date(targetIso).getTime() - now);
  const expired = totalMs === 0;
  const urgent = !expired && totalMs < 24 * 60 * 60 * 1000;

  return {
    days: Math.floor(totalMs / 864e5),
    hours: Math.floor((totalMs % 864e5) / 36e5),
    minutes: Math.floor((totalMs % 36e5) / 6e4),
    seconds: Math.floor((totalMs % 6e4) / 1e3),
    totalMs,
    expired,
    urgent,
  };
}
