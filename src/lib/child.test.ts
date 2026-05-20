import { describe, expect, test } from "bun:test";
import { matchChild } from "./child.ts";

describe("matchChild", () => {
	const urdur = { child_id: 86048, name: "Urður Lóa Axelsdóttir", school_name: "Langholt" };
	const aegir = { child_id: 125447, name: "Ægir Hrafn Axelsson", school_name: "Baldur" };

	test("matches by exact child_id", () => {
		expect(matchChild(urdur, "86048")).toBe(true);
		expect(matchChild(urdur, "125447")).toBe(false);
	});
	test("matches by case-insensitive name substring", () => {
		expect(matchChild(urdur, "urður")).toBe(true);
		expect(matchChild(urdur, "URÐUR")).toBe(true);
		expect(matchChild(urdur, "lóa")).toBe(true);
		expect(matchChild(urdur, "ægir")).toBe(false);
	});
	test("works on rows that use child_name instead of name", () => {
		const row = { child_id: 86048, child_name: "Urður Lóa Axelsdóttir" };
		expect(matchChild(row, "urður")).toBe(true);
	});
	test("does not falsely match across kids", () => {
		expect(matchChild(aegir, "Urður")).toBe(false);
	});
	test("empty needle matches everything (substring of any string)", () => {
		// Documents current behavior; the CLI never passes an empty string.
		expect(matchChild(urdur, "")).toBe(true);
	});
});
