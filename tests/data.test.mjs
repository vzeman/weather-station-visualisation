import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("bundled dataset follows the portable v1 schema", async () => {
  const dataset = JSON.parse(await readFile(new URL("../public/data/weather.json", import.meta.url), "utf8"));
  assert.equal(dataset.schemaVersion, 1);
  assert.ok(dataset.station.name);
  assert.ok(dataset.station.timeZone);
  assert.ok(dataset.days.length > 365);
  assert.match(dataset.days[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof dataset.days[0].coverage, "number");
});
