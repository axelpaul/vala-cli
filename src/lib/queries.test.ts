import { describe, expect, test } from "bun:test";
import { buildLunchDays, pickAbsenceType, weekdaysBetween } from "./queries.ts";
import type { AbsenceType, AttendanceChild, MenuSchool } from "./types.ts";

const TYPES: AbsenceType[] = [
	{ absence_type_id: 2, absence_type: "Veikindi" },
	{ absence_type_id: 3, absence_type: "Frí" },
];

describe("pickAbsenceType", () => {
	test("matches by numeric id", () => {
		expect(pickAbsenceType("2", TYPES)?.absence_type_id).toBe(2);
		expect(pickAbsenceType("3", TYPES)?.absence_type_id).toBe(3);
	});
	test("unknown numeric id → undefined", () => {
		expect(pickAbsenceType("99", TYPES)).toBeUndefined();
	});
	test("sick alias → Veikindi", () => {
		expect(pickAbsenceType("sick", TYPES)?.absence_type_id).toBe(2);
		expect(pickAbsenceType("SICK", TYPES)?.absence_type_id).toBe(2);
	});
	test("vacation alias → Frí", () => {
		expect(pickAbsenceType("vacation", TYPES)?.absence_type_id).toBe(3);
		expect(pickAbsenceType("holiday", TYPES)?.absence_type_id).toBe(3);
	});
	test("substring on the localized name", () => {
		expect(pickAbsenceType("veik", TYPES)?.absence_type_id).toBe(2);
		expect(pickAbsenceType("frí", TYPES)?.absence_type_id).toBe(3);
	});
	test("bogus → undefined", () => {
		expect(pickAbsenceType("bogus", TYPES)).toBeUndefined();
	});
});

describe("weekdaysBetween", () => {
	test("skips Saturday and Sunday", () => {
		// 2026-05-14 is a Thursday.
		expect(weekdaysBetween("2026-05-14", "2026-05-20")).toEqual([
			"2026-05-14",
			"2026-05-15",
			"2026-05-18",
			"2026-05-19",
			"2026-05-20",
		]);
	});
});

describe("buildLunchDays", () => {
	test("keys menus by school so siblings at different schools get their own menu", () => {
		const days = buildLunchDays(
			["2026-05-15"],
			[
				{
					child_id: 12345,
					child_name: "Jóna Jónsdóttir",
					school_name: "Dæmiskóli",
					attendance: [
						{ time_from: "2026-05-15T08:00:00Z", eat: "good" },
					] as AttendanceChild["attendance"],
				},
				{
					child_id: 67890,
					child_name: "Siggi Jónsson",
					school_name: "Prófskóli",
					attendance: [],
				},
			],
			[
				{
					school_id: 1,
					school: "Dæmiskóli",
					menu: [{ menu_date: "2026-05-15T00:00:00Z", lunch: "Fiskur" }],
				},
				{
					school_id: 2,
					school: "Prófskóli",
					menu: [{ menu_date: "2026-05-15T00:00:00Z", lunch: "Súpa" }],
				},
			] as MenuSchool[],
		);
		expect(days).toEqual([
			{
				date: "2026-05-15",
				menu: "Fiskur",
				eat: "good",
				child_name: "Jóna Jónsdóttir",
				school_name: "Dæmiskóli",
			},
			{
				date: "2026-05-15",
				menu: "Súpa",
				eat: null,
				child_name: "Siggi Jónsson",
				school_name: "Prófskóli",
			},
		]);
	});
});
