/** Reproducible DT01 proposal measurements; stdout is retained in the decision record. */
import {performance} from "node:perf_hooks";
import {Budget, compareCalendar, parseCalendar, parseDuration, parseReduced, ProbeFailure,
  sameDuration, showInstant, showRepresentative} from "./exact-calendar.js";

function measure(id: string, budget: Budget, run: () => unknown): void {
  const start = performance.now();
  try {
    run();
    process.stdout.write(JSON.stringify({id, outcome: "completed", used: budget.used, maxWork: budget.maxWork,
      maxNodes: budget.maxNodes, milliseconds: Number((performance.now() - start).toFixed(3))}) + "\n");
  } catch (error) {
    if (!(error instanceof ProbeFailure)) throw error;
    process.stdout.write(JSON.stringify({id, outcome: error.kind, used: budget.used, maxWork: budget.maxWork,
      maxNodes: budget.maxNodes, milliseconds: Number((performance.now() - start).toFixed(3))}) + "\n");
  }
}

const sample = new Budget();
sameDuration(parseDuration("P1Y", sample), parseDuration("P12M", sample), sample);
for (const [id, maxWork] of [["equality-at-work", sample.used], ["equality-beyond-work", sample.used - 1]] as const) {
  const budget = new Budget(maxWork);
  measure(id, budget, () => sameDuration(parseDuration("P1Y", budget), parseDuration("P12M", budget), budget));
}
for (const count of [100_000, 100_001]) {
  const budget = new Budget();
  measure(`nodes-${count}`, budget, () => budget.nodes(count));
}
for (const sign of ["", "-"]) {
  const budget = new Budget(10_000_000), lexical = sign + "9".repeat(200) + "-01-01T00:00:00." + "0".repeat(99) + "1Z";
  measure(`200-digit-${sign ? "negative" : "positive"}-year-100-fraction`, budget,
    () => showInstant(parseCalendar("dateTime", lexical, budget).seconds, budget));
}
for (const maxWork of [1_000_000, 2_000_000_000]) {
  const budget = new Budget(maxWork), lexical = "9".repeat(5000) + "-01-01Z";
  measure(`5000-digit-year-work-${maxWork}`, budget, () => parseCalendar("date", lexical, budget));
}
const reducedSample = new Budget();
showRepresentative(parseReduced("time", "01:00:00+14:00", reducedSample), reducedSample);
for (const [id, maxWork] of [["reduced-time-at-work", reducedSample.used], ["reduced-time-beyond-work", reducedSample.used - 1]] as const) {
  const budget = new Budget(maxWork);
  measure(id, budget, () => showRepresentative(parseReduced("time", "01:00:00+14:00", budget), budget));
}
{
  const budget = new Budget();
  measure("reduced-year-crosses-bce", budget, () => showRepresentative(parseReduced("gYear", "0001+14:00", budget), budget));
}
{
  const budget = new Budget();
  measure("reduced-time-endpoint-exact-fraction", budget,
    () => compareCalendar(parseReduced("time", "14:00:00.000000000000000000000000000001Z", budget),
      parseReduced("time", "00:00:00", budget), budget));
}
