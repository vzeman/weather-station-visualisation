import { mkdir, writeFile } from "node:fs/promises";

let seed = 1729;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const round = (value, digits = 1) => Number(value.toFixed(digits));
const addDay = (date) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const days = [];
for (let date = "2020-01-01"; date <= "2026-08-19"; date = addDay(date)) {
  const point = new Date(`${date}T12:00:00Z`);
  const start = Date.UTC(point.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((point.getTime() - start) / 86400000);
  const season = Math.sin(((dayOfYear - 95) / 365) * Math.PI * 2);
  const warming = (point.getUTCFullYear() - 2020) * 0.12;
  const avg = 10.4 + season * 11.5 + warming + (random() - 0.5) * 5.2;
  const wetChance = 0.24 + (1 - season) * 0.045;
  const rainy = random() < wetChance;
  const rain = rainy ? Math.pow(random(), 2.25) * 38 + (random() < 0.035 ? 42 : 0) : 0;
  const windAvg = 4 + random() * 10 + (1 - season) * 2.3;
  const gust = windAvg * (1.55 + random() * 1.8);
  days.push({
    date,
    tempAvgC: round(avg),
    tempMinC: round(avg - 3.7 - random() * 3.4),
    tempMaxC: round(avg + 4.2 + random() * 4.1),
    rainMm: round(rain),
    rainRateMaxMmH: rainy ? round(2 + rain * (0.65 + random() * 1.6)) : 0,
    windAvgKmh: round(windAvg),
    windSustainedMaxKmh: round(windAvg * (1.15 + random() * 0.75)),
    windGustMaxKmh: round(gust),
    windGustDirDeg: Math.round(random() * 359),
    coverage: round(0.93 + random() * 0.07, 3),
    records: 270 + Math.round(random() * 18),
  });
}

const dataset = {
  schemaVersion: 1,
  generatedAt: "2026-08-20T09:00:00.000Z",
  source: "sample",
  sample: true,
  station: {
    id: "sample-garden",
    name: "Garden station",
    location: "Bratislava region, Slovakia",
    timeZone: "Europe/Bratislava",
    recordingIntervalMinutes: 5,
  },
  definitions: { wetDayMm: 0.2, frostC: 0 },
  days,
};

await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/data/weather.json", import.meta.url), `${JSON.stringify(dataset)}\n`);
console.log(`Generated ${days.length} sample days.`);
