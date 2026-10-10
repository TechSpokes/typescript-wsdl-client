import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {addDuration, Budget, compareCalendar, compareDuration, fromOrdinal, ordinal, parseCalendar,
  parseDuration, ProbeFailure, sameCalendar, sameDuration, showInstant} from "./exact-calendar.js";

const cases = JSON.parse(readFileSync(new URL("./dt01-cases.json", import.meta.url), "utf8")) as {
  calendarLexical: {id: string; family: "date" | "dateTime"; lexical: string; valid: boolean}[];
  normalization: {lexical: string; expected: string}[];
  additions: {start: string; duration: string; expected: string}[];
  calendarRelations: {a: string; b: string; equal: boolean; order: string}[];
  durationRelations: {a: string; b: string; equal: boolean; order: string}[];
};

describe("DT01 selected option A exact research contract", () => {
  it.each(cases.calendarLexical)("lexical $id", ({family, lexical, valid}) => {
    const budget = new Budget();
    if (valid) expect(parseCalendar(family, lexical, budget).lexical).toBe(lexical);
    else expect(() => parseCalendar(family, lexical, budget)).toThrow(ProbeFailure);
  });
  it.each(cases.normalization)("normalizes $lexical", ({lexical, expected}) => {
    const budget = new Budget();
    expect(showInstant(parseCalendar("dateTime", lexical, budget).seconds, budget)).toBe(expected);
  });
  it.each(cases.additions)("adds $duration to $start", ({start, duration, expected}) => {
    const budget = new Budget();
    expect(showInstant(addDuration(parseCalendar("dateTime", start, budget), parseDuration(duration, budget), budget), budget)).toBe(expected);
  });
  it.each(cases.calendarRelations)("calendar relation $a / $b", ({a, b, equal, order}) => {
    const budget = new Budget(), x = parseCalendar("dateTime", a, budget), y = parseCalendar("dateTime", b, budget);
    expect(sameCalendar(x, y, budget)).toBe(equal);
    expect(compareCalendar(x, y, budget)).toBe(order);
  });
  it.each(cases.durationRelations)("duration relation $a / $b", ({a, b, equal, order}) => {
    const budget = new Budget(), x = parseDuration(a, budget), y = parseDuration(b, budget);
    expect(sameDuration(x, y, budget)).toBe(equal);
    expect(compareDuration(x, y, budget)).toBe(order);
  });
  it.each(["P", "PT", "P1YT", "P-1M", "P1M-1D", "+P1D", "PT1.S"])("rejects duration %s", value => {
    expect(() => parseDuration(value, new Budget())).toThrow(ProbeFailure);
  });
  it("distinguishes date intervals from dateTime instants and preserves timezone aliases", () => {
    const budget = new Budget(), a = parseCalendar("date", "0001-01-01+14:00", budget);
    expect(sameCalendar(a, parseCalendar("date", "-0001-12-31-10:00", budget), budget)).toBe(true);
    expect(sameCalendar(a, parseCalendar("dateTime", "-0001-12-31T10:00:00Z", budget), budget)).toBe(false);
  });
  it("adds months to assessed UTC values independently of their lexical timezone alias", () => {
    const budget = new Budget(), a = parseCalendar("dateTime", "2001-03-01T00:00:00+14:00", budget);
    const b = parseCalendar("dateTime", "2001-02-28T10:00:00Z", budget), duration = parseDuration("P1M", budget);
    expect(sameCalendar(a, b, budget)).toBe(true);
    expect(showInstant(addDuration(a, duration, budget), budget)).toBe("2001-03-28T10:00:00Z");
    expect(showInstant(addDuration(b, duration, budget), budget)).toBe("2001-03-28T10:00:00Z");
  });
  it("inverts boundary dates in eight BCE/CE 400-year cycles without creating year zero", () => {
    for (let y = -1600; y <= 1600; y++) {
      if (!y) continue;
      const budget = new Budget();
      for (const [month, day] of [[1, 1], [2, 28], [3, 1], [12, 31]]) {
        expect(fromOrdinal(ordinal(BigInt(y), month, day, budget, 4), budget, 7)).toEqual({year: BigInt(y), month, day});
      }
    }
  });
  it("keeps 200-digit positive/negative years and 100-digit fractions exact", () => {
    for (const sign of ["", "-"]) {
      const budget = new Budget(10_000_000), year = sign + "9".repeat(200), fraction = "0".repeat(99) + "1";
      const lexical = `${year}-01-01T00:00:00.${fraction}Z`;
      expect(showInstant(parseCalendar("dateTime", lexical, budget).seconds, budget)).toBe(lexical);
    }
  });
  it("returns resource-limit at the first refused work charge without partial equality", () => {
    const run = (budget: Budget): boolean => sameDuration(parseDuration("P1Y", budget), parseDuration("P12M", budget), budget);
    const baseline = new Budget();
    expect(run(baseline)).toBe(true);
    const exact = new Budget(baseline.used);
    expect(run(exact)).toBe(true);
    expect(exact.used).toBe(baseline.used);
    const below = new Budget(baseline.used - 1);
    try {run(below); throw new Error("Expected exhaustion");}
    catch (error) {expect(error).toMatchObject({kind: "resource-limit"});}
    expect(below.used).toBeLessThanOrEqual(below.maxWork);
  });
  it("independently enforces inclusive semantic graph and work defaults", () => {
    const exact = new Budget();
    exact.nodes(100_000); exact.charge(900_000);
    expect(exact.used).toBe(1_000_000);
    expect(() => exact.charge(1)).toThrow(ProbeFailure);
    const beyond = new Budget();
    expect(() => beyond.nodes(100_001)).toThrow(ProbeFailure);
    expect(beyond.used).toBe(0);
  });
  it("charges huge lexical operands before BigInt conversion; no payload digit cap is imported", () => {
    const year = "9".repeat(5000), lexical = `${year}-01-01Z`, limited = new Budget();
    expect(() => parseCalendar("date", lexical, limited)).toThrow(ProbeFailure);
    expect(limited.used).toBeLessThanOrEqual(limited.maxWork);
    const sufficient = new Budget(2_000_000_000);
    expect(parseCalendar("date", lexical, sufficient).year).toBe(BigInt(year));
  });
});
