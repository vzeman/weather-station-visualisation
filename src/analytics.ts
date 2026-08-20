import type { DailyWeather, PeriodSummary, WeatherDataset } from "./types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const valid = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

export const sum = (values: Array<number | null | undefined>) =>
  values.reduce<number>((total, value) => total + (valid(value) ? value : 0), 0);

export const average = (values: Array<number | null | undefined>) => {
  const filtered = values.filter(valid);
  return filtered.length ? sum(filtered) / filtered.length : null;
};

const extreme = (values: Array<number | null | undefined>, selector: (a: number, b: number) => number) => {
  const filtered = values.filter(valid);
  return filtered.length ? filtered.reduce(selector) : null;
};

export function summarize(days: DailyWeather[], wetDayMm = 0.2): PeriodSummary {
  return {
    tempAvgC: average(days.map((day) => day.tempAvgC)),
    tempMinC: extreme(days.map((day) => day.tempMinC), Math.min),
    tempMaxC: extreme(days.map((day) => day.tempMaxC), Math.max),
    rainMm: sum(days.map((day) => day.rainMm)),
    rainRateMaxMmH: extreme(days.map((day) => day.rainRateMaxMmH), Math.max),
    windAvgKmh: average(days.map((day) => day.windAvgKmh)),
    windSustainedMaxKmh: extreme(days.map((day) => day.windSustainedMaxKmh), Math.max),
    windGustMaxKmh: extreme(days.map((day) => day.windGustMaxKmh), Math.max),
    dryDays: days.filter((day) => valid(day.rainMm) && day.rainMm < wetDayMm).length,
    wetDays: days.filter((day) => valid(day.rainMm) && day.rainMm >= wetDayMm).length,
    frostDays: days.filter((day) => valid(day.tempMinC) && day.tempMinC < 0).length,
    coverage: average(days.map((day) => day.coverage)) ?? 0,
  };
}

export const yearOf = (day: DailyWeather) => Number(day.date.slice(0, 4));
export const monthOf = (day: DailyWeather) => Number(day.date.slice(5, 7));

export function availableYears(dataset: WeatherDataset) {
  return [...new Set(dataset.days.map(yearOf))].sort((a, b) => b - a);
}

export function daysForYear(dataset: WeatherDataset, year: number) {
  return dataset.days.filter((day) => yearOf(day) === year);
}

export function monthlyRows(dataset: WeatherDataset, year: number) {
  return MONTHS.map((month, index) => {
    const days = dataset.days.filter((day) => yearOf(day) === year && monthOf(day) === index + 1);
    return { month, monthNumber: index + 1, ...summarize(days, dataset.definitions.wetDayMm) };
  });
}

export function yearlyRows(dataset: WeatherDataset) {
  return availableYears(dataset).slice().reverse().map((year) => ({
    year,
    ...summarize(daysForYear(dataset, year), dataset.definitions.wetDayMm),
  }));
}

export function ytdRainRows(dataset: WeatherDataset, selectedYear: number) {
  const selected = daysForYear(dataset, selectedYear);
  const last = selected.at(-1)?.date.slice(5) ?? "12-31";
  return availableYears(dataset).slice(0, 6).map((year) => {
    let running = 0;
    const values = dataset.days
      .filter((day) => yearOf(day) === year && day.date.slice(5) <= last)
      .map((day, index) => {
        running += day.rainMm ?? 0;
        return { index: index + 1, value: Number(running.toFixed(1)) };
      });
    return { year, values };
  });
}

export function mergedYtdChart(dataset: WeatherDataset, selectedYear: number) {
  const series = ytdRainRows(dataset, selectedYear);
  const maxLength = Math.max(...series.map((item) => item.values.length), 0);
  return Array.from({ length: maxLength }, (_, index) => {
    const row: Record<string, number> = { day: index + 1 };
    series.forEach(({ year, values }) => {
      if (values[index]) row[String(year)] = values[index].value;
    });
    return row;
  });
}

export function monthRank(dataset: WeatherDataset, year: number, month: number) {
  const selectedDays = dataset.days.filter((day) => yearOf(day) === year && monthOf(day) === month);
  const cutoff = Number(selectedDays.at(-1)?.date.slice(8, 10) ?? 31);
  const requiredDays = Math.max(1, Math.floor(selectedDays.length * 0.8));
  const totals = availableYears(dataset).map((candidate) => {
    const days = dataset.days.filter((day) => yearOf(day) === candidate && monthOf(day) === month && Number(day.date.slice(8, 10)) <= cutoff);
    return days.length >= requiredDays ? { year: candidate, rainMm: sum(days.map((day) => day.rainMm)) } : null;
  }).filter((row): row is { year: number; rainMm: number } => Boolean(row)).sort((a, b) => a.rainMm - b.rainMm);
  const index = totals.findIndex((row) => row.year === year);
  return { rank: index >= 0 ? index + 1 : null, total: totals.length, rows: totals };
}

export function longestDrySpell(days: DailyWeather[], threshold: number) {
  let best = 0;
  let current = 0;
  let bestEnd = "";
  days.forEach((day) => {
    if (valid(day.rainMm) && day.rainMm < threshold) {
      current += 1;
      if (current > best) { best = current; bestEnd = day.date; }
    } else current = 0;
  });
  if (!bestEnd) return { days: 0, start: null, end: null };
  const end = new Date(`${bestEnd}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - best + 1);
  return { days: best, start: start.toISOString().slice(0, 10), end: bestEnd };
}

export function frostDates(days: DailyWeather[]) {
  const frost = days.filter((day) => valid(day.tempMinC) && day.tempMinC < 0);
  return {
    spring: frost.filter((day) => monthOf(day) <= 6).at(-1) ?? null,
    autumn: frost.find((day) => monthOf(day) >= 7) ?? null,
  };
}

export function windDirectionBins(days: DailyWeather[]) {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const bins = names.map((direction) => ({ direction, value: 0 }));
  days.forEach((day) => {
    if (!valid(day.windGustDirDeg)) return;
    bins[Math.round(day.windGustDirDeg / 45) % 8].value += day.windAvgKmh ?? 1;
  });
  return bins;
}

export function recordDay(days: DailyWeather[], field: keyof DailyWeather, type: "min" | "max" = "max") {
  return days.reduce<DailyWeather | null>((best, day) => {
    const value = day[field];
    if (!valid(value as number | null)) return best;
    if (!best) return day;
    const bestValue = best[field] as number | null;
    if (!valid(bestValue)) return day;
    return type === "max"
      ? (value as number) > bestValue ? day : best
      : (value as number) < bestValue ? day : best;
  }, null);
}
