import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCentsToSGD(cents: number): string {
  const sgd = cents / 100;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(sgd);
}

export function formatDateLabel(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat("en-SG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function formatTimeWindow(start: string, end: string): string {
  return `${start} – ${end}`;
}
