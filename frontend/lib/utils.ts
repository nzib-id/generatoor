// lib/utils.ts
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// gabungin className + auto handle conflict Tailwind
export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}
