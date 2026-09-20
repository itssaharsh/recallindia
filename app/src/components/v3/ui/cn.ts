import clsx, { type ClassValue } from "clsx";
/** Join class names (clsx). Keep it tiny: no tailwind-merge, so write non-conflicting classes. */
export function cn(...v: ClassValue[]): string { return clsx(v); }
