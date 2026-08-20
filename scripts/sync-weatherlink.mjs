import { readFile, writeFile } from "node:fs/promises";

const API_BASE = "https://api.weatherlink.com/v2";
const DATA_URL = new URL("../public/data/weather.json", import.meta.url);
const apiKey = process.env.WEATHERLINK_API_KEY;
const apiSecret = process.env.WEATHERLINK_API_SECRET;
const configuredStationId = process.env.WEATHERLINK_STATION_ID;
const configuredStart = process.env.WEATHERLINK_START_DATE;
const maxDays = Math.max(1, Math.min(900, Number(process.env.SYNC_MAX_DAYS || 180)));

if (!apiKey || !apiSecret) {
  console.log("WeatherLink secrets are not configured; keeping the bundled dataset.");
  process.exit(0);
}

const weatherFetch = async (path, attempt = 1) => {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API_BASE}${path}${separator}api-key=${encodeURIComponent(apiKey)}`, {
    headers: { "X-Api-Secret": apiSecret, Accept: "application/json" },
  });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    const waitMs = Math.max(4000, Number(response.headers.get("retry-after") || 4) * 1000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return weatherFetch(path, attempt + 1);
  }
  if (!response.ok) throw new Error(`WeatherLink ${response.status}: ${(await response.text()).slice(0, 180)}`);
  return response.json();
};

const stationsResponse = await weatherFetch("/stations");
const stations = stationsResponse.stations || [];
const station = configuredStationId
  ? stations.find((item) => String(item.station_id) === configuredStationId || item.station_id_uuid === configuredStationId)
  : stations[0];
if (!station) throw new Error("No accessible WeatherLink station matched WEATHERLINK_STATION_ID.");

const stationId = String(station.station_id_uuid || station.station_id);
const timeZone = station.time_zone || "UTC";
const intervalMinutes = Number(station.recording_interval || 5);
const formatLocal = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
const localDate = (epochMs) => formatLocal.format(new Date(epochMs));
const addDays = (date, count) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};
const zonedMidnight = (date) => {
  const [year, month, day] = date.split("-").map(Number);
  const wallUtc = Date.UTC(year, month - 1, day);
  let guess = wallUtc;
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess)).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += wallUtc - represented;
  }
  return Math.floor(guess / 1000);
};

let existing;
try { existing = JSON.parse(await readFile(DATA_URL, "utf8")); } catch { existing = null; }
const sameStation = existing?.source === "weatherlink-v2" && String(existing.station?.id) === stationId;
const existingDays = new Map((sameStation ? existing.days : []).map((day) => [day.date, day]));
const registered = station.registered_date ? localDate(Number(station.registered_date) * 1000) : addDays(localDate(Date.now()), -365 * 5);
const startDate = configuredStart || registered;
const yesterday = addDays(localDate(Date.now()), -1);
const allDates = [];
for (let date = startDate; date <= yesterday; date = addDays(date, 1)) allDates.push(date);
const recent = allDates.slice(-3);
const missing = allDates.filter((date) => !existingDays.has(date));
const targets = [...new Set([...recent, ...missing])].slice(0, maxDays);

const celsius = (fahrenheit) => (fahrenheit - 32) * 5 / 9;
const kmh = (mph) => mph * 1.609344;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const firstFinite = (...values) => values.find(finite) ?? null;
const rounded = (value, digits = 2) => finite(value) ? Number(value.toFixed(digits)) : null;
const max = (values) => values.filter(finite).reduce((result, value) => Math.max(result, value), -Infinity);

const aggregate = (date, payloads) => {
  const candidates = payloads.flatMap((payload) => payload.sensors || []).map((sensor) => {
    const records = sensor.data || [];
    const sample = records.find((record) => record && typeof record === "object") || {};
    const score = ["temp_avg", "temp_out", "temp_last", "rainfall_mm", "wind_speed_avg", "wind_speed_hi"].filter((key) => key in sample).length;
    return { sensor, records, score };
  }).filter((candidate) => candidate.records.length && candidate.score > 0).sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;
  const records = candidates[0].records.filter((record) => localDate(record.ts * 1000) === date);
  if (!records.length) return null;
  const averagesF = records.map((record) => firstFinite(record.temp_avg, record.temp_out, record.temp_last)).filter(finite);
  const minimaF = records.map((record) => firstFinite(record.temp_lo, record.temp_out_lo, record.temp_out, record.temp_last)).filter(finite);
  const maximaF = records.map((record) => firstFinite(record.temp_hi, record.temp_out_hi, record.temp_out, record.temp_last)).filter(finite);
  const gustRecord = records.reduce((best, record) => (firstFinite(record.wind_speed_hi, 0) > firstFinite(best?.wind_speed_hi, 0) ? record : best), null);
  const daySeconds = zonedMidnight(addDays(date, 1)) - zonedMidnight(date);
  return {
    date,
    tempAvgC: averagesF.length ? rounded(celsius(averagesF.reduce((a, b) => a + b, 0) / averagesF.length), 2) : null,
    tempMinC: minimaF.length ? rounded(celsius(Math.min(...minimaF)), 2) : null,
    tempMaxC: maximaF.length ? rounded(celsius(Math.max(...maximaF)), 2) : null,
    tempMinAt: records.find((record) => firstFinite(record.temp_lo, record.temp_out_lo) === Math.min(...minimaF))?.temp_lo_at ?? null,
    tempMaxAt: records.find((record) => firstFinite(record.temp_hi, record.temp_out_hi) === Math.max(...maximaF))?.temp_hi_at ?? null,
    rainMm: rounded(records.reduce((total, record) => total + (firstFinite(record.rainfall_mm, 0) || 0), 0), 2),
    rainRateMaxMmH: rounded(max(records.map((record) => firstFinite(record.rain_rate_hi_mm, 0))), 2),
    windAvgKmh: rounded(kmh(records.map((record) => record.wind_speed_avg).filter(finite).reduce((a, b) => a + b, 0) / Math.max(1, records.map((record) => record.wind_speed_avg).filter(finite).length)), 2),
    windSustainedMaxKmh: rounded(kmh(max(records.map((record) => firstFinite(record.wind_speed_avg, 0)))), 2),
    windGustMaxKmh: rounded(kmh(max(records.map((record) => firstFinite(record.wind_speed_hi, 0)))), 2),
    windGustDirDeg: firstFinite(gustRecord?.wind_speed_hi_dir, gustRecord?.wind_dir_of_hi, gustRecord?.wind_dir_of_prevail),
    coverage: rounded(Math.min(1, records.length / Math.max(1, daySeconds / 60 / intervalMinutes)), 4),
    records: records.length,
  };
};

console.log(`Syncing ${targets.length} day(s) for ${station.station_name}; ${missing.length} missing before this run.`);
let synced = 0;
for (const date of targets) {
  const start = zonedMidnight(date);
  const end = zonedMidnight(addDays(date, 1));
  const payloads = [];
  for (let cursor = start; cursor < end; cursor += 86400) {
    const windowEnd = Math.min(end, cursor + 86400);
    payloads.push(await weatherFetch(`/historic/${encodeURIComponent(stationId)}?start-timestamp=${cursor}&end-timestamp=${windowEnd}`));
  }
  const day = aggregate(date, payloads);
  if (day) { existingDays.set(date, day); synced += 1; }
}

const dataset = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "weatherlink-v2",
  sample: false,
  station: {
    id: stationId,
    name: station.station_name || "WeatherLink station",
    location: [station.city, station.region, station.country].filter(Boolean).join(", "),
    timeZone,
    recordingIntervalMinutes: intervalMinutes,
  },
  definitions: existing?.definitions || { wetDayMm: 0.2, frostC: 0 },
  days: [...existingDays.values()].sort((a, b) => a.date.localeCompare(b.date)),
};
await writeFile(DATA_URL, `${JSON.stringify(dataset)}\n`);
console.log(`Saved ${synced} refreshed day(s); archive now contains ${dataset.days.length} days.`);
