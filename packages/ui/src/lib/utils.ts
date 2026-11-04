import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并条件类名并消解 Tailwind 冲突，最后一个生效。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
