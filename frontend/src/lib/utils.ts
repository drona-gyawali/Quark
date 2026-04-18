import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { generateId } from "human-ids";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createIds() {
  const id = generateId({
    adjective: true,
    color: true,
    noun: true,
    separator: "-",
  });
  return id;
}
