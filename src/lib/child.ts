// Helpers for resolving which child a command should target.

/** Match against `child_id` or a case-insensitive substring of the child's name.
 * Works for both top-level Child objects and rows in attendance/event responses
 * (which use `child_name` instead of `name`). */
export function matchChild<
	T extends { child_id?: number | string; name?: string; child_name?: string },
>(row: T, needle: string): boolean {
	const n = needle.toLowerCase();
	if (row.child_id !== undefined && String(row.child_id) === n) return true;
	const displayName = (row.name ?? row.child_name ?? "").toLowerCase();
	return displayName.includes(n);
}

/** Re-exports so existing imports `from "../lib/child.ts"` keep working. */
export { addDays, isoDate, todayIso } from "./format.ts";
