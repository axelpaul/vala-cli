import { describe, expect, test } from "bun:test";
import {
	addDays,
	dayKey,
	firstMenuLine,
	formatTime,
	isAllDay,
	isoDate,
	parseValaDate,
	relTime,
} from "./format.ts";

describe("isoDate", () => {
	test("passes through valid", () => {
		expect(isoDate("2026-05-20")).toBe("2026-05-20");
	});
	test("throws on bad shape", () => {
		expect(() => isoDate("2026-5-20")).toThrow();
		expect(() => isoDate("20-05-2026")).toThrow();
		expect(() => isoDate("nope")).toThrow();
	});
});

describe("addDays", () => {
	test("forward", () => expect(addDays("2026-05-20", 1)).toBe("2026-05-21"));
	test("backward", () => expect(addDays("2026-05-20", -6)).toBe("2026-05-14"));
	test("month boundary", () => expect(addDays("2026-05-31", 1)).toBe("2026-06-01"));
	test("year boundary", () => expect(addDays("2026-12-31", 1)).toBe("2027-01-01"));
	test("leap-year handling", () => expect(addDays("2024-02-28", 1)).toBe("2024-02-29"));
});

describe("dayKey", () => {
	test("strips time", () => expect(dayKey("2026-05-20T08:30:00Z")).toBe("2026-05-20"));
	test("passes plain date", () => expect(dayKey("2026-05-20")).toBe("2026-05-20"));
});

describe("formatTime", () => {
	test("UTC HH:MM", () => expect(formatTime("2026-05-20T08:30:00Z")).toBe("08:30"));
	test("null", () => expect(formatTime(null)).toBe("—"));
	test("undefined", () => expect(formatTime(undefined)).toBe("—"));
	test("fallback to raw on weird input", () => expect(formatTime("no-time")).toBe("no-time"));
});

describe("parseValaDate", () => {
	test("valid DD.MM.YYYY HH:MM", () => {
		const d = parseValaDate("13.05.2026 10:23");
		expect(d).not.toBeNull();
		expect(d?.toISOString()).toBe("2026-05-13T10:23:00.000Z");
	});
	test("invalid format → null", () => {
		expect(parseValaDate("2026-05-13 10:23")).toBeNull();
		expect(parseValaDate("nonsense")).toBeNull();
		expect(parseValaDate("13.05.2026")).toBeNull();
	});
});

describe("relTime", () => {
	// 30 seconds past noon, so a message timestamped "12:00" is 30s in the past.
	const NOW = Date.UTC(2026, 4, 20, 12, 0, 30);
	test("just now (<60s)", () => expect(relTime("20.05.2026 12:00", NOW)).toBe("just now"));
	test("minutes", () => expect(relTime("20.05.2026 11:30", NOW)).toBe("30m ago"));
	test("hours", () => expect(relTime("20.05.2026 09:00", NOW)).toBe("3h ago"));
	test("days", () => expect(relTime("13.05.2026 12:00", NOW)).toBe("7d ago"));
	test("falls back to date past 2 weeks", () =>
		expect(relTime("01.05.2026 10:00", NOW)).toBe("01.05.2026"));
	test("null/undefined → em-dash", () => {
		expect(relTime(null, NOW)).toBe("—");
		expect(relTime(undefined, NOW)).toBe("—");
	});
});

describe("isAllDay", () => {
	test("midnight to midnight", () =>
		expect(isAllDay("2026-05-20T00:00:00Z", "2026-05-20T23:59:59Z")).toBe(true));
	test("midnight to midnight (other end)", () =>
		expect(isAllDay("2026-05-20T00:00:00Z", "2026-05-20T00:00:00Z")).toBe(true));
	test("partial day", () =>
		expect(isAllDay("2026-05-20T07:30:00Z", "2026-05-20T16:30:00Z")).toBe(false));
});

describe("firstMenuLine", () => {
	test("extracts Aðalréttur line", () => {
		const menu =
			"Aðalréttur\nSoðin ýsa með kartöflum, bræddu smjöri og rúgbrauði\nVeganréttur\nAsískar grænmetisbollur";
		expect(firstMenuLine(menu)).toBe("Soðin ýsa með kartöflum, bræddu smjöri og rúgbrauði");
	});
	test("falls back to first line if no Aðalréttur header", () => {
		expect(firstMenuLine("Plain text\nmore")).toBe("Plain text");
	});
	test("empty menu", () => expect(firstMenuLine("")).toBe(""));
	test("only whitespace", () => expect(firstMenuLine("\n\n   \n")).toBe(""));
});
