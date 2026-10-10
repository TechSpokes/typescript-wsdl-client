/** Reproducible DT01 proposal measurements; stdout is retained in the decision record. */
import {performance} from "node:perf_hooks";
import {Budget, parseCalendar, parseDuration, ProbeFailure, sameDuration, showInstant} from "./exact-calendar.js";

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
