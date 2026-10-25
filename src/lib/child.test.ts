import { describe, expect, test } from "bun:test";
import { matchChild } from "./child.ts";

// Fictional placeholder data only — never put real children's names or ids here.
describe("matchChild", () => {
	const jona = { child_id: 12345, name: "Jóna Lóa Jónsdóttir", school_name: "Dæmiskóli" };
	const siggi = { child_id: 67890, name: "Sigurður Hrafn Jónsson", school_name: "Prófskóli" };

	test("matches by exact child_id", () => {
		expect(matchChild(jona, "12345")).toBe(true);
		expect(matchChild(jona, "67890")).toBe(false);
	});
	test("matches by case-insensitive name substring", () => {
		expect(matchChild(jona, "jóna")).toBe(true);
		expect(matchChild(jona, "JÓNA")).toBe(true);
		expect(matchChild(jona, "lóa")).toBe(true);
		expect(matchChild(jona, "sigurður")).toBe(false);
	});
	test("works on rows that use child_name instead of name", () => {
		const row = { child_id: 12345, child_name: "Jóna Lóa Jónsdóttir" };
		expect(matchChild(row, "jóna")).toBe(true);
	});
	test("does not falsely match across kids", () => {
		expect(matchChild(siggi, "Jóna")).toBe(false);
	});
	test("empty needle matches everything (substring of any string)", () => {
		// Documents current behavior; the CLI never passes an empty string.
		expect(matchChild(jona, "")).toBe(true);
	});
});
