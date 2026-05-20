import { describe, expect, test } from "bun:test";
import type { AbsenceType } from "../lib/types.ts";
import { pickAbsenceType } from "./absent.ts";

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
