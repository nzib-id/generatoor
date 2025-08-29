// lib/usePolling.ts
"use client";
import { useEffect, useRef, useState } from "react";

export function usePolling<T>(
  fn: () => Promise<T>,
  interval = 1500,
  enabled = true
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    async function tick() {
      try {
        const d = await fn();
        if (alive.current) setData(d);
      } catch (e: any) {
        if (alive.current) setError(String(e?.message ?? e));
      }
    }
    if (enabled) {
      tick();
      timer.current = window.setInterval(tick, interval);
    }
    return () => {
      alive.current = false;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [fn, interval, enabled]);

  return { data, error };
}
