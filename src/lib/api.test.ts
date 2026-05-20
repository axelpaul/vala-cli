import { describe, expect, test } from "bun:test";
import { first, items, toValaDate } from "./api.ts";

describe("toValaDate", () => {
	test("YYYY-MM-DD → DD.MM.YYYY", () => {
		expect(toValaDate("2026-05-20")).toBe("20.05.2026");
		expect(toValaDate("2026-01-01")).toBe("01.01.2026");
	});
	test("already-Vala date passes through", () => {
		expect(toValaDate("20.05.2026")).toBe("20.05.2026");
	});
	test("invalid throws", () => {
		expect(() => toValaDate("2026/05/20")).toThrow();
		expect(() => toValaDate("nope")).toThrow();
		expect(() => toValaDate("")).toThrow();
	});
});

describe("items", () => {
	test("unwraps ORDS envelope", () => {
		expect(items({ items: [1, 2, 3] })).toEqual([1, 2, 3]);
	});
	test("passes bare array", () => {
		expect(items([1, 2])).toEqual([1, 2]);
	});
	test("undefined → []", () => {
		expect(items(undefined)).toEqual([]);
	});
	test("missing items field → []", () => {
		expect(items({ items: undefined as unknown as number[] })).toEqual([]);
	});
});

describe("first", () => {
	test("first envelope item", () => {
		expect(first({ items: [{ id: 1 }, { id: 2 }] })).toEqual({ id: 1 });
	});
	test("empty → undefined", () => {
		expect(first({ items: [] })).toBeUndefined();
		expect(first(undefined)).toBeUndefined();
	});
});
