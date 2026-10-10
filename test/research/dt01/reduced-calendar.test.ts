import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {Budget, compareCalendar, parseReduced, sameCalendar, showRepresentative} from "./exact-calendar.js";
import type {ReducedFamily} from "./exact-calendar.js";

const cases = JSON.parse(readFileSync(new URL("./dt01-reduced-cases.json", import.meta.url), "utf8")) as {
  normalization: {id: string; family: ReducedFamily; lexical: string; timeline: "zoned" | "local"; coordinate: string}[];
  relations: {id: string; family: ReducedFamily; a: string; b: string; equal: boolean; order: string}[];
  aliasSubstitution: {family: ReducedFamily; a: string; alias: string; third: string; order: string}[];
  invalidLexical: {family: ReducedFamily; lexical: string}[];
};

describe("DT01 selected reduced-calendar exact representatives", () => {
  it.each(cases.normalization)("normalizes $id", ({family, lexical, timeline, coordinate}) => {
    const budget = new Budget(), value = parseReduced(family, lexical, budget);
    expect(value.lexical).toBe(lexical);
    expect(showRepresentative(value, budget)).toEqual({family, timeline, coordinate});
  });
  it.each(cases.relations)("compares $id", ({family, a, b, equal, order}) => {
    const budget = new Budget(), first = parseReduced(family, a, budget), second = parseReduced(family, b, budget);
    expect(sameCalendar(first, second, budget)).toBe(equal);
    expect(compareCalendar(first, second, budget)).toBe(order);
    const reverse = order === "less" ? "greater" : order === "greater" ? "less" : order;
    expect(compareCalendar(second, first, budget)).toBe(reverse);
  });
  it.each(cases.aliasSubstitution)("preserves $family alias substitution against $third", ({family, a, alias, third, order}) => {
    const budget = new Budget(), first = parseReduced(family, a, budget), second = parseReduced(family, alias, budget);
    const other = parseReduced(family, third, budget);
    expect(sameCalendar(first, second, budget)).toBe(true);
    expect(compareCalendar(first, other, budget)).toBe(order);
    expect(compareCalendar(second, other, budget)).toBe(order);
  });
  it.each(cases.invalidLexical)("rejects $family $lexical", ({family, lexical}) => {
    try {parseReduced(family, lexical, new Budget()); throw new Error("Expected invalid operand");}
    catch (error) {expect(error).toMatchObject({kind: "invalid-schema"});}
  });
  it("retains family distinctions when gYear and gYearMonth have the same starting coordinate", () => {
    const budget = new Budget(), year = parseReduced("gYear", "0001+14:00", budget);
    const month = parseReduced("gYearMonth", "0001-01+14:00", budget);
    expect(showRepresentative(year, budget).coordinate).toBe("-0001-12-31T10:00:00");
    expect(showRepresentative(month, budget).coordinate).toBe("-0001-12-31T10:00:00");
    expect(sameCalendar(year, month, budget)).toBe(false);
    expect(compareCalendar(year, month, budget)).toBe("indeterminate");
  });
  it("charges reduced normalization and copied representative output at inclusive work limits", () => {
    const run = (budget: Budget) => showRepresentative(parseReduced("time", "01:00:00+14:00", budget), budget);
    const baseline = new Budget(), expected = run(baseline);
    expect(expected).toEqual({family: "time", timeline: "zoned", coordinate: "2000-01-01T11:00:00"});
    const exact = new Budget(baseline.used);
    expect(run(exact)).toEqual(expected);
    expect(exact.used).toBe(baseline.used);
    const beyond = new Budget(baseline.used - 1);
    try {run(beyond); throw new Error("Expected resource exhaustion");}
    catch (error) {expect(error).toMatchObject({kind: "resource-limit"});}
    expect(beyond.used).toBeLessThanOrEqual(beyond.maxWork);
  });
});
