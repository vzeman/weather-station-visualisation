import type { DailyWeather, PeriodSummary, WeatherDataset } from "./types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const valid = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

export const sum = (values: Array<number | null | undefined>) =>
  values.reduce<number>((total, value) => total + (valid(value) ? value : 0), 0);

export const average = (values: Array<number | null | undefined>) => {
  const filtered = values.filter(valid);
  return filtered.length ? sum(filtered) / filtered.length : null;
};

export const percentile = (values: Array<number | null | undefined>, ratio: number) => {
  const filtered = values.filter(valid).sort((a, b) => a - b);
  if (!filtered.length) return null;
  const position = (filtered.length - 1) * ratio;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return filtered[lower + 1] === undefined
    ? filtered[lower]
    : filtered[lower] + fraction * (filtered[lower + 1] - filtered[lower]);
};

const extreme = (values: Array<number | null | undefined>, selector: (a: number, b: number) => number) => {
  const filtered = values.filter(valid);
  return filtered.length ? filtered.reduce((best, value) => selector(best, value)) : null;
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

export function annualClimateRows(dataset: WeatherDataset) {
  const rows = yearlyRows(dataset).map((row) => {
    const days = daysForYear(dataset, row.year);
    return {
      ...row,
      completeYear: days.length >= 330,
      longestDrySpell: longestDrySpell(days, dataset.definitions.wetDayMm).days,
      summerDays: days.filter((day) => valid(day.tempMaxC) && day.tempMaxC >= 25).length,
      tropicalDays: days.filter((day) => valid(day.tempMaxC) && day.tempMaxC >= 30).length,
      tropicalNights: days.filter((day) => valid(day.tempMinC) && day.tempMinC >= 20).length,
    };
  });
  const baseline = rows.filter((row) => row.completeYear && row.coverage >= 0.75);
  const tempNormal = average(baseline.map((row) => row.tempAvgC));
  const rainNormal = average(baseline.map((row) => row.rainMm));
  return rows.map((row) => ({
    ...row,
    tempTrendC: row.completeYear ? row.tempAvgC : null,
    rainTrendMm: row.completeYear ? row.rainMm : null,
    tempAnomalyC: row.completeYear && valid(row.tempAvgC) && valid(tempNormal) ? row.tempAvgC - tempNormal : null,
    rainAnomalyPct: row.completeYear && valid(rainNormal) && rainNormal > 0 ? ((row.rainMm - rainNormal) / rainNormal) * 100 : null,
    tempNormal,
    rainNormal,
  }));
}

export function monthlyClimatology(dataset: WeatherDataset, selectedYear: number) {
  return MONTHS.map((month, index) => {
    const summaries = availableYears(dataset).map((year) => {
      const days = dataset.days.filter((day) => yearOf(day) === year && monthOf(day) === index + 1);
      return { year, days: days.length, ...summarize(days, dataset.definitions.wetDayMm) };
    }).filter((row) => row.days >= 20);
    const selected = summaries.find((row) => row.year === selectedYear);
    const history = summaries.filter((row) => row.year !== selectedYear);
    const tempValues = history.map((row) => row.tempAvgC);
    const rainValues = history.map((row) => row.rainMm);
    return {
      month,
      monthNumber: index + 1,
      selectedTemp: selected?.tempAvgC ?? null,
      tempLow: percentile(tempValues, 0.1),
      tempMean: average(tempValues),
      tempHigh: percentile(tempValues, 0.9),
      selectedRain: selected?.rainMm ?? null,
      rainLow: percentile(rainValues, 0.1),
      rainMedian: percentile(rainValues, 0.5),
      rainHigh: percentile(rainValues, 0.9),
    };
  });
}

export function climateMatrix(dataset: WeatherDataset, metric: "temperature" | "rain" | "coverage") {
  const monthNormals = MONTHS.map((_, index) => {
    const values = availableYears(dataset).map((year) => {
      const days = dataset.days.filter((day) => yearOf(day) === year && monthOf(day) === index + 1);
      if (days.length < 20) return null;
      const summary = summarize(days, dataset.definitions.wetDayMm);
      return metric === "temperature" ? summary.tempAvgC : metric === "rain" ? summary.rainMm : summary.coverage * 100;
    });
    return average(values);
  });
  return availableYears(dataset).slice().reverse().map((year) => ({
    year,
    values: MONTHS.map((month, index) => {
      const days = dataset.days.filter((day) => yearOf(day) === year && monthOf(day) === index + 1);
      if (days.length < 5) return { month, value: null, raw: null };
      const summary = summarize(days, dataset.definitions.wetDayMm);
      const raw = metric === "temperature" ? summary.tempAvgC : metric === "rain" ? summary.rainMm : summary.coverage * 100;
      const value = metric === "temperature" && valid(raw) && valid(monthNormals[index]) ? raw - monthNormals[index] : raw;
      return { month, value, raw };
    }),
  }));
}

export function seasonalRows(dataset: WeatherDataset, selectedYear: number) {
  const seasons = [
    { season: "Winter", months: [12, 1, 2] },
    { season: "Spring", months: [3, 4, 5] },
    { season: "Summer", months: [6, 7, 8] },
    { season: "Autumn", months: [9, 10, 11] },
  ];
  return seasons.map(({ season, months }) => {
    const selectedDays = dataset.days.filter((day) => yearOf(day) === selectedYear && months.includes(monthOf(day)));
    const selected = summarize(selectedDays, dataset.definitions.wetDayMm);
    const historical = availableYears(dataset).filter((year) => year !== selectedYear).map((year) => {
      const days = dataset.days.filter((day) => yearOf(day) === year && months.includes(monthOf(day)));
      return days.length >= 45 ? summarize(days, dataset.definitions.wetDayMm) : null;
    }).filter((row): row is PeriodSummary => Boolean(row));
    const selectedAvailable = selectedDays.length >= 20;
    return {
      season,
      temp: selectedAvailable ? selected.tempAvgC : null,
      tempNormal: average(historical.map((row) => row.tempAvgC)),
      rain: selectedAvailable ? selected.rainMm : null,
      rainNormal: average(historical.map((row) => row.rainMm)),
    };
  });
}

export function dailyTemperatureClimatology(dataset: WeatherDataset, selectedYear: number) {
  const history = new Map<string, number[]>();
  const selected = new Map<string, DailyWeather>();
  dataset.days.forEach((day) => {
    if (day.date.endsWith("02-29")) return;
    const key = day.date.slice(5);
    if (yearOf(day) === selectedYear) {
      selected.set(key, day);
      return;
    }
    if (!valid(day.tempAvgC)) return;
    history.set(key, [...(history.get(key) ?? []), day.tempAvgC]);
  });
  const calendar: string[] = [];
  for (let date = new Date("2001-01-01T12:00:00Z"); date.getUTCFullYear() === 2001; date.setUTCDate(date.getUTCDate() + 1)) {
    calendar.push(date.toISOString().slice(5, 10));
  }
  return calendar.map((key, index) => {
    const values = history.get(key) ?? [];
    const low = percentile(values, 0.1);
    const high = percentile(values, 0.9);
    return {
      day: index + 1,
      date: `${selectedYear}-${key}`,
      selected: selected.get(key)?.tempAvgC ?? null,
      normal: average(values),
      low,
      band: valid(low) && valid(high) ? high - low : null,
    };
  });
}

export function rollingRainRows(dataset: WeatherDataset, selectedYear: number) {
  const sorted = dataset.days.slice().sort((a, b) => a.date.localeCompare(b.date));
  const rolling = (endIndex: number, days: number) => {
    const end = new Date(`${sorted[endIndex].date}T12:00:00Z`).getTime();
    const start = end - (days - 1) * 86_400_000;
    let total = 0;
    for (let index = endIndex; index >= 0; index -= 1) {
      const timestamp = new Date(`${sorted[index].date}T12:00:00Z`).getTime();
      if (timestamp < start) break;
      total += sorted[index].rainMm ?? 0;
    }
    return Number(total.toFixed(1));
  };
  return sorted.map((day, index) => yearOf(day) === selectedYear ? {
    date: day.date,
    day: Number(day.date.slice(5, 7)) * 31 + Number(day.date.slice(8, 10)),
    rain30: rolling(index, 30),
    rain90: rolling(index, 90),
  } : null).filter((row): row is { date: string; day: number; rain30: number; rain90: number } => Boolean(row));
}

export function distributionRows(values: Array<number | null | undefined>, thresholds: number[]) {
  const filtered = values.filter(valid);
  return thresholds.map((upper, index) => {
    const lower = index === 0 ? 0 : thresholds[index - 1];
    const count = filtered.filter((value) => index === thresholds.length - 1 ? value >= lower : value >= lower && value < upper).length;
    return { label: index === thresholds.length - 1 ? `${lower}+` : `${lower}–${upper}`, count };
  });
}

export function annualWindRows(dataset: WeatherDataset) {
  return yearlyRows(dataset).map((row) => ({
    year: row.year,
    average: row.windAvgKmh,
    sustained: row.windSustainedMaxKmh,
    gust: row.windGustMaxKmh,
  }));
}

export function ytdRainRows(dataset: WeatherDataset, selectedYear: number) {
  const selected = daysForYear(dataset, selectedYear);
  const last = selected.at(-1)?.date.slice(5) ?? "12-31";
  const years = [selectedYear, ...availableYears(dataset).filter((year) => year !== selectedYear)].slice(0, 6);
  return years.map((year) => {
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

export function mergedYearProgress(dataset: WeatherDataset, selectedYear: number, metric: "temperature" | "wind") {
  const selected = daysForYear(dataset, selectedYear);
  const last = selected.at(-1)?.date.slice(5) ?? "12-31";
  const years = [selectedYear, ...availableYears(dataset).filter((year) => year !== selectedYear)].slice(0, 6);
  const series = years.map((year) => {
    let runningTotal = 0;
    let runningCount = 0;
    let runningMax: number | null = null;
    const values = dataset.days.filter((day) => yearOf(day) === year && day.date.slice(5) <= last).map((day, index) => {
      let value: number | null = null;
      if (metric === "temperature") {
        if (valid(day.tempAvgC)) { runningTotal += day.tempAvgC; runningCount += 1; }
        value = runningCount ? runningTotal / runningCount : null;
      } else {
        if (valid(day.windGustMaxKmh)) runningMax = runningMax === null ? day.windGustMaxKmh : Math.max(runningMax, day.windGustMaxKmh);
        value = runningMax;
      }
      return { index: index + 1, value: value === null ? null : Number(value.toFixed(1)) };
    });
    return { year, values };
  });
  const maxLength = Math.max(...series.map((item) => item.values.length), 0);
  return Array.from({ length: maxLength }, (_, index) => {
    const row: Record<string, number> = { day: index + 1 };
    series.forEach(({ year, values }) => {
      const value = values[index]?.value;
      if (value !== null && value !== undefined) row[String(year)] = value;
    });
    return row;
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
