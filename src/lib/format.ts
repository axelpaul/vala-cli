// Shared formatting / date helpers. All pure — covered by src/lib/format.test.ts.

import { color } from "./output.ts";
import type { EatRating } from "./types.ts";

/** ISO YYYY-MM-DD (UTC) for "today". The Vala API serves Iceland, which is UTC
 * year-round, so we always work in UTC to avoid silent off-by-one errors when
 * the CLI is run from a different time zone. */
export function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

/** Strict YYYY-MM-DD validator that returns the input unchanged. */
export function isoDate(s: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
		throw new Error(`Invalid date: ${s} (expected YYYY-MM-DD)`);
	}
	return s;
}

/** Add `n` days to a YYYY-MM-DD date (UTC). Negative n goes backwards. */
export function addDays(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	const s = d.toISOString().slice(0, 10);
	if (!s) throw new Error("date overflow");
	return s;
}

/** Just the date part of any ISO-ish string (`2026-05-20T08:30:00Z` → `2026-05-20`). */
export function dayKey(iso: string): string {
	return iso.slice(0, 10);
}

/** UTC `HH:MM` from an ISO datetime, or `—` for null/empty. The Vala API serves
 * Iceland which is UTC year-round, so this is the wall-clock time at the school. */
export function formatTime(iso: string | null | undefined): string {
	if (!iso) return "—";
	const m = /T(\d{2}):(\d{2})/.exec(iso);
	return m ? `${m[1]}:${m[2]}` : iso;
}

/** Parse Vala's `DD.MM.YYYY HH:MM` chat-message timestamps. Returns null on bad input. */
export function parseValaDate(s: string): Date | null {
	const m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/.exec(s);
	if (!m) return null;
	return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`);
}

/** Human-readable relative time for chat messages. Falls back to the date when more
 * than two weeks have passed. `now` is injectable for testing. */
export function relTime(s: string | null | undefined, now: number = Date.now()): string {
	if (!s) return "—";
	const d = parseValaDate(s);
	if (!d) return s;
	const diff = (now - d.getTime()) / 1000;
	if (diff < 60) return "just now";
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
	const days = Math.floor(diff / 86400);
	if (days < 14) return `${days}d ago`;
	return s.split(" ")[0] ?? s;
}

/** Color function for an `eat` rating value. */
export function ratingColor(rating: EatRating): (s: string) => string {
	switch (rating) {
		case "verygood":
			return color.green;
		case "good":
			return color.cyan;
		case "average":
			return color.yellow;
		case "didnot":
			return color.red;
	}
}

/** True if an event spans the whole day (e.g., a national holiday). */
export function isAllDay(start: string, end: string): boolean {
	return /T00:00:00/.test(start) && /T(00:00:00|23:59:59)/.test(end);
}

/** Surface the most useful line out of a Vala menu blob. The server returns
 * something like `Aðalréttur\n<dish>\nVeganréttur\n<vegan>\nMeðlætisbar\n<sides>`;
 * we show the main dish if we can identify it, else the first non-empty line. */
export function firstMenuLine(menu: string): string {
	const lines = menu
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const adalIdx = lines.findIndex((l) => /^aðalréttur/i.test(l));
	if (adalIdx >= 0 && lines[adalIdx + 1]) return lines[adalIdx + 1] as string;
	return lines[0] ?? "";
}
