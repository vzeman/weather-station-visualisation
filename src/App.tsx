import { useEffect, useMemo, useRef, useState } from "react";
import { del, get, set } from "idb-keyval";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CloudRain,
  Database,
  Download,
  Droplets,
  FileUp,
  Gauge,
  Github,
  Info,
  LayoutDashboard,
  Leaf,
  RefreshCw,
  Settings,
  Snowflake,
  Thermometer,
  Wind,
  X,
} from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MONTHS,
  annualClimateRows,
  annualWindRows,
  availableYears,
  climateMatrix,
  dailyTemperatureClimatology,
  daysForYear,
  distributionRows,
  frostDates,
  longestDrySpell,
  mergedYtdChart,
  mergedYearProgress,
  monthRank,
  monthlyClimatology,
  monthlyRows,
  recordDay,
  rollingRainRows,
  seasonalRows,
  summarize,
  windDirectionBins,
  yearlyRows,
} from "./analytics";
import type { DailyWeather, PeriodSummary, WeatherDataset } from "./types";

type Tab = "overview" | "rain" | "temperature" | "wind" | "data";
const STORAGE_KEY = "weather-archive:dataset:v1";
const LOCAL_MODE_KEY = "weather-archive:local-mode";
const chartColors = ["#f16e4b", "#2f7d6e", "#7aa9a1", "#d8a72e", "#805d91", "#74a4d4"];
const yAxisTick = { fill: "#777c75", fontSize: 9 };

const fmt = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";

const prettyDate = (date: string | null | undefined) => {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
};

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, unit, detail, tone = "green" }: {
  label: string; value: string; unit?: string; detail: string; tone?: "green" | "orange" | "blue" | "plum";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}<span>{unit}</span></div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function Panel({ title, eyebrow, action, children, className = "" }: {
  title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>
        {action}
      </header>
      {children}
    </section>
  );
}

function EmptyState() {
  return <div className="empty-state"><Activity size={22} /><span>No observations in this period.</span></div>;
}

type HeatmapMode = "temperature" | "rain" | "coverage";

function heatColor(value: number | null, mode: HeatmapMode) {
  if (value === null) return "#eeece5";
  if (mode === "temperature") {
    const strength = Math.min(Math.abs(value) / 2.5, 1);
    return value < 0
      ? `color-mix(in srgb, #3d83a8 ${30 + strength * 65}%, #f5f2e9)`
      : `color-mix(in srgb, #eb6b48 ${30 + strength * 65}%, #f5f2e9)`;
  }
  if (mode === "coverage") {
    const strength = Math.max(0, Math.min(value / 100, 1));
    return `color-mix(in srgb, #2f7d6e ${18 + strength * 78}%, #f5f2e9)`;
  }
  const strength = Math.max(0, Math.min(value / 160, 1));
  return `color-mix(in srgb, #377e9f ${16 + strength * 80}%, #f5f2e9)`;
}

function ClimateHeatmap({ matrix, mode }: { matrix: ReturnType<typeof climateMatrix>; mode: HeatmapMode }) {
  const unit = mode === "temperature" ? "°C anomaly" : mode === "rain" ? "mm" : "% coverage";
  return <div className="heatmap-shell">
    <div className="heatmap-grid" style={{ gridTemplateColumns: "50px repeat(12, minmax(34px, 1fr))" }}>
      <span />{MONTHS.map((month) => <strong className="heatmap-month" key={month}>{month}</strong>)}
      {matrix.map((row) => <div className="heatmap-row" key={row.year}>
        <strong className="heatmap-year">{row.year}</strong>
        {row.values.map((cell) => <span
          key={cell.month}
          className="heatmap-cell"
          style={{ background: heatColor(cell.value, mode) }}
          title={`${cell.month} ${row.year}: ${cell.value === null ? "no data" : `${fmt(cell.value, mode === "coverage" ? 0 : 1)} ${unit}`}`}
          aria-label={`${cell.month} ${row.year}: ${cell.value === null ? "no data" : `${fmt(cell.value, 1)} ${unit}`}`}
        >{cell.value === null ? "" : mode === "temperature" ? `${cell.value > 0 ? "+" : ""}${fmt(cell.value, 1)}` : fmt(cell.value, 0)}</span>)}
      </div>)}
    </div>
    <div className={`heatmap-scale heatmap-scale-${mode}`}><span>{mode === "temperature" ? "cooler" : "low"}</span><i/><span>{mode === "temperature" ? "warmer" : "high"}</span></div>
  </div>;
}

function YearProgressChart({ data, years, selectedYear, unit, digits = 1 }: {
  data: Array<Record<string, number>>; years: number[]; selectedYear: number; unit: string; digits?: number;
}) {
  return <>
    <div className="chart-wrap chart-tall"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
      <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#7b7a73", fontSize: 11 }} tickFormatter={(day) => day % 60 === 1 ? `Day ${day}` : ""}/><YAxis tickLine={false} axisLine={false} tick={yAxisTick} unit={unit} width={unit === " km/h" ? 82 : 68}/>
      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} labelFormatter={(label) => `Day ${label}`} formatter={(value, name) => [`${fmt(Number(value), digits)}${unit}`, String(name)]}/>
      {years.map((candidate, index) => <Line key={candidate} type="monotone" dataKey={String(candidate)} stroke={chartColors[index]} strokeWidth={candidate === selectedYear ? 3 : 1.5} dot={false} opacity={candidate === selectedYear ? 1 : 0.5} connectNulls/>)}
    </LineChart></ResponsiveContainer></div>
    <div className="chart-legend">{years.map((candidate, index) => <span key={candidate}><i style={{ background: chartColors[index] }}/>{candidate}</span>)}</div>
  </>;
}

function Overview({ dataset, year, days, summary }: {
  dataset: WeatherDataset; year: number; days: DailyWeather[]; summary: PeriodSummary;
}) {
  const monthly = monthlyRows(dataset, year);
  const ytdData = mergedYtdChart(dataset, year);
  const years = availableYears(dataset).slice(0, 6);
  const lastMonth = Number(days.at(-1)?.date.slice(5, 7) ?? 12);
  const rank = monthRank(dataset, year, lastMonth);
  const dry = longestDrySpell(days, dataset.definitions.wetDayMm);
  const hottest = recordDay(days, "tempMaxC");
  const annual = annualClimateRows(dataset);
  const seasons = seasonalRows(dataset, year);

  return <>
    <div className="metrics-grid">
      <MetricCard label="Rainfall · YTD" value={fmt(summary.rainMm, 0)} unit=" mm" detail={`${summary.wetDays} wet days · ${summary.dryDays} dry days`} tone="blue" />
      <MetricCard label="Mean temperature" value={fmt(summary.tempAvgC)} unit=" °C" detail={`${fmt(summary.tempMinC)}° low · ${fmt(summary.tempMaxC)}° high`} tone="orange" />
      <MetricCard label="Peak gust" value={fmt(summary.windGustMaxKmh, 0)} unit=" km/h" detail={`Sustained peak ${fmt(summary.windSustainedMaxKmh, 0)} km/h`} tone="plum" />
      <MetricCard label="Data quality" value={fmt(summary.coverage * 100, 0)} unit="%" detail={`${days.length} local days analysed`} />
    </div>

    <div className="dashboard-grid dashboard-grid-main">
      <Panel title="Rainfall through the year" eyebrow="Year-to-date comparison" className="chart-panel">
        <div className="chart-wrap chart-tall">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ytdData} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid vertical={false} stroke="#e8e5dc" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#7b7a73", fontSize: 11 }} tickFormatter={(d) => d % 60 === 1 ? `Day ${d}` : ""} />
              <YAxis tickLine={false} axisLine={false} tick={yAxisTick} unit=" mm" width={78} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} labelFormatter={(label) => `Day ${label}`} />
              {years.map((candidate, index) => <Line key={candidate} type="monotone" dataKey={String(candidate)} stroke={chartColors[index]} strokeWidth={candidate === year ? 3 : 1.5} dot={false} opacity={candidate === year ? 1 : 0.55} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-legend">{years.map((candidate, index) => <span key={candidate}><i style={{ background: chartColors[index] }} />{candidate}</span>)}</div>
      </Panel>

      <aside className="insight-card">
        <div className="insight-icon"><Droplets size={22} /></div>
        <div className="eyebrow">The local story</div>
        <h2>{MONTHS[lastMonth - 1]} ranks #{rank.rank ?? "—"} for dryness</h2>
        <p>{rank.total > 1 ? `Among ${rank.total} comparable years. The longest dry run in ${year} lasted ${dry.days} days.` : "More complete years will unlock historical rankings."}</p>
        <div className="insight-divider" />
        <div className="insight-record"><span>Warmest day</span><strong>{fmt(hottest?.tempMaxC)} °C</strong><small>{prettyDate(hottest?.date)}</small></div>
      </aside>
    </div>

    <Panel title={`${year}, month by month`} eyebrow="One year at a glance">
      <div className="month-strip">
        {monthly.map((month) => <div className={`month-cell ${month.rainMm > 100 ? "month-wet" : ""}`} key={month.month}>
          <span>{month.month}</span><strong>{month.tempAvgC === null ? "—" : `${fmt(month.tempAvgC)}°`}</strong><small>{month.rainMm ? `${fmt(month.rainMm, 0)} mm` : "0 mm"}</small>
        </div>)}
      </div>
    </Panel>

    <div className="dashboard-grid">
      <Panel title="Local climate trend" eyebrow="Annual mean temperature" className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={annual} margin={{ top: 10, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="year" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" °C" width={68}/>
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} formatter={(value, name) => [`${fmt(Number(value))} °C`, String(name)]}/>
          <Line type="monotone" dataKey="tempTrendC" name="Annual mean" stroke="#e76745" strokeWidth={3} dot={{ r: 3, fill: "#e76745" }}/>
          {annual[0]?.tempNormal !== null && <ReferenceLine
            y={annual[0]?.tempNormal ?? undefined}
            stroke="#1d4037"
            strokeDasharray="5 5"
            label={{ value: "record mean", fill: "#647069", fontSize: 10 }}
          />}
        </ComposedChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Seasonal departures" eyebrow={`${year} vs other years`}>
        <div className="season-grid">{seasons.map((season) => {
          const tempDelta = season.temp !== null && season.tempNormal !== null ? season.temp - season.tempNormal : null;
          const rainDelta = season.rain !== null && season.rainNormal ? ((season.rain - season.rainNormal) / season.rainNormal) * 100 : null;
          return <div className="season-cell" key={season.season}><strong>{season.season}</strong><span className={tempDelta !== null && tempDelta >= 0 ? "warm" : "cool"}>{tempDelta === null ? "—" : `${tempDelta >= 0 ? "+" : ""}${fmt(tempDelta)} °C`}</span><small>{rainDelta === null ? "—" : `${rainDelta >= 0 ? "+" : ""}${fmt(rainDelta, 0)}% rain`}</small></div>;
        })}</div>
      </Panel>
    </div>
  </>;
}

function RainReport({ dataset, year, days, summary }: { dataset: WeatherDataset; year: number; days: DailyWeather[]; summary: PeriodSummary }) {
  const monthly = monthlyRows(dataset, year);
  const dry = longestDrySpell(days, dataset.definitions.wetDayMm);
  const wettest = recordDay(days, "rainMm");
  const rate = recordDay(days, "rainRateMaxMmH");
  const annual = annualClimateRows(dataset);
  const climatology = monthlyClimatology(dataset, year).map((row) => ({ ...row, rainBand: row.rainLow !== null && row.rainHigh !== null ? row.rainHigh - row.rainLow : null }));
  const rainMatrix = climateMatrix(dataset, "rain");
  const rolling = rollingRainRows(dataset, year);
  const distribution = distributionRows(days.map((day) => day.rainMm), [0.2, 2, 5, 10, 20, 40, 80]);
  const comparisonYears = [year, ...availableYears(dataset).filter((candidate) => candidate !== year)].slice(0, 6);
  const yearProgress = mergedYtdChart(dataset, year);
  return <>
    <div className="metrics-grid metrics-grid-three">
      <MetricCard label="Annual total" value={fmt(summary.rainMm, 0)} unit=" mm" detail={`${summary.wetDays} days ≥ ${dataset.definitions.wetDayMm} mm`} tone="blue" />
      <MetricCard label="Longest dry spell" value={String(dry.days)} unit=" days" detail={dry.start ? `${prettyDate(dry.start)} – ${prettyDate(dry.end)}` : "No complete dry spell"} tone="orange" />
      <MetricCard label="Peak rain rate" value={fmt(summary.rainRateMaxMmH, 0)} unit=" mm/h" detail={prettyDate(rate?.date)} tone="plum" />
    </div>
    <Panel title="Rainfall through the year" eyebrow="Cumulative total · same day across years" className="chart-panel">
      <YearProgressChart data={yearProgress} years={comparisonYears} selectedYear={year} unit=" mm" digits={0}/>
    </Panel>
    <div className="dashboard-grid">
      <Panel title="Monthly rainfall" eyebrow={`${year} distribution`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" mm" width={78} />
          <Tooltip cursor={{ fill: "#f3f0e8" }} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} formatter={(value) => [`${fmt(Number(value), 1)} mm`, "Rainfall"]} />
          <Bar dataKey="rainMm" fill="#377e9f" radius={[6, 6, 0, 0]} />
        </BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Rainfall records" eyebrow="Daily extremes">
        <div className="record-list">
          <div><CloudRain /><span><small>Wettest day</small><strong>{fmt(wettest?.rainMm)} mm</strong><em>{prettyDate(wettest?.date)}</em></span></div>
          <div><Gauge /><span><small>Highest intensity</small><strong>{fmt(rate?.rainRateMaxMmH)} mm/h</strong><em>{prettyDate(rate?.date)}</em></span></div>
          <div><CalendarDays /><span><small>Dry-day threshold</small><strong>&lt; {dataset.definitions.wetDayMm} mm</strong><em>Local calendar day</em></span></div>
        </div>
      </Panel>
    </div>
    <div className="dashboard-grid">
      <Panel title="Monthly rainfall vs local climate" eyebrow="Historical 10–90% range" className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={climatology} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="month" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" mm" width={78}/>
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} formatter={(value, name) => [`${fmt(Number(value), 0)} mm`, String(name)]}/>
          <Area dataKey="rainLow" stackId="rain-band" stroke="none" fill="transparent"/><Area name="Historical range" dataKey="rainBand" stackId="rain-band" stroke="none" fill="#b8d1d9" fillOpacity={0.55}/>
          <Bar name={`${year}`} dataKey="selectedRain" fill="#377e9f" radius={[5, 5, 0, 0]} barSize={18}/><Line name="Historical median" type="monotone" dataKey="rainMedian" stroke="#1d4037" strokeWidth={2.5} dot={false}/>
        </ComposedChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Rolling rainfall" eyebrow="Moisture over 30 and 90 days" className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={rolling} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={42} tickFormatter={(value) => String(value).slice(5, 7)}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" mm" width={78}/>
          <Tooltip labelFormatter={(value) => prettyDate(String(value))} formatter={(value, name) => [`${fmt(Number(value), 0)} mm`, name === "rain30" ? "30 days" : "90 days"]} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/>
          <Line type="monotone" dataKey="rain90" stroke="#8ab1bd" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="rain30" stroke="#2f718d" strokeWidth={2.5} dot={false}/>
        </LineChart></ResponsiveContainer></div>
      </Panel>
    </div>
    <Panel title="Rainfall calendar" eyebrow="Every month across the archive · millimetres">
      <ClimateHeatmap matrix={rainMatrix} mode="rain"/>
    </Panel>
    <div className="dashboard-grid">
      <Panel title="Annual rainfall trend" eyebrow="Totals and local normal" className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={annual} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="year" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" mm" width={78}/>
          <Tooltip formatter={(value) => `${fmt(Number(value), 0)} mm`} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/><Bar dataKey="rainTrendMm" name="Annual rainfall" fill="#377e9f" radius={[5, 5, 0, 0]}/>
          {annual[0]?.rainNormal !== null && <ReferenceLine
            y={annual[0]?.rainNormal ?? undefined}
            stroke="#1d4037"
            strokeDasharray="5 5"
            label={{ value: "record mean", fill: "#647069", fontSize: 10 }}
          />}
        </ComposedChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Daily rainfall distribution" eyebrow={`${year} · number of days`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={distribution} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} width={46}/><Tooltip formatter={(value) => [`${value} days`, "Frequency"]} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/><Bar dataKey="count" fill="#78a8b7" radius={[5, 5, 0, 0]}/>
        </BarChart></ResponsiveContainer></div>
      </Panel>
    </div>
    <Panel title="Annual rainfall comparison" eyebrow="Long-term record">
      <div className="table-scroll"><table><thead><tr><th>Year</th><th>Total</th><th>Wet days</th><th>Dry days</th><th>Peak rate</th><th>Coverage</th></tr></thead><tbody>
        {annual.map((row) => <tr key={row.year} className={row.year === year ? "selected-row" : ""}><td><strong>{row.year}</strong></td><td>{fmt(row.rainMm, 0)} mm</td><td>{row.wetDays}</td><td>{row.dryDays}</td><td>{fmt(row.rainRateMaxMmH, 0)} mm/h</td><td>{fmt(row.coverage * 100, 0)}%</td></tr>)}
      </tbody></table></div>
    </Panel>
  </>;
}

function TemperatureReport({ dataset, year, days, summary }: { dataset: WeatherDataset; year: number; days: DailyWeather[]; summary: PeriodSummary }) {
  const tempClimatology = monthlyClimatology(dataset, year).map((row) => ({ ...row, tempBand: row.tempLow !== null && row.tempHigh !== null ? row.tempHigh - row.tempLow : null }));
  const frost = frostDates(days);
  const coldest = recordDay(days, "tempMinC", "min");
  const hottest = recordDay(days, "tempMaxC");
  const annual = annualClimateRows(dataset);
  const dailyClimate = dailyTemperatureClimatology(dataset, year);
  const anomalyMatrix = climateMatrix(dataset, "temperature");
  const comparisonYears = [year, ...availableYears(dataset).filter((candidate) => candidate !== year)].slice(0, 6);
  const yearProgress = mergedYearProgress(dataset, year, "temperature");
  return <>
    <div className="metrics-grid metrics-grid-three">
      <MetricCard label="Mean temperature" value={fmt(summary.tempAvgC)} unit=" °C" detail={`${year} observation mean`} tone="orange" />
      <MetricCard label="Last spring frost" value={frost.spring ? prettyDate(frost.spring.date).replace(` ${year}`, "") : "None"} detail={frost.spring ? `${fmt(frost.spring.tempMinC)} °C minimum` : "No frost before July"} tone="blue" />
      <MetricCard label="First autumn frost" value={frost.autumn ? prettyDate(frost.autumn.date).replace(` ${year}`, "") : "Not yet"} detail={frost.autumn ? `${fmt(frost.autumn.tempMinC)} °C minimum` : "No frost after June"} tone="plum" />
    </div>
    <Panel title="Temperature through the year" eyebrow="Running mean · same day across years" className="chart-panel">
      <YearProgressChart data={yearProgress} years={comparisonYears} selectedYear={year} unit=" °C"/>
    </Panel>
    <div className="dashboard-grid">
      <Panel title="Temperature envelope" eyebrow={`${year} vs full-year local climate`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={tempClimatology} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" °C" width={68} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} formatter={(value, name) => [`${fmt(Number(value))} °C`, String(name)]} />
          <Area dataKey="tempLow" stackId="temp-band" stroke="none" fill="transparent"/><Area name="Historical 10–90% range" dataKey="tempBand" stackId="temp-band" stroke="none" fill="#efad99" fillOpacity={0.35}/>
          <Line name="Historical mean" type="monotone" dataKey="tempMean" stroke="#4a6c62" strokeWidth={2} dot={false}/><Line name={String(year)} type="monotone" dataKey="selectedTemp" stroke="#df6545" strokeWidth={3} dot={{ r: 3, fill: "#df6545" }} connectNulls={false}/>
        </ComposedChart></ResponsiveContainer></div>
        <div className="chart-legend"><span><i style={{ background: "#df6545" }}/>{year}</span><span><i style={{ background: "#4a6c62" }}/>Historical mean</span><span><i style={{ background: "#efad99" }}/>10–90% range</span></div>
      </Panel>
      <Panel title="Temperature records" eyebrow="Daily extremes">
        <div className="record-list">
          <div><Thermometer /><span><small>Warmest day</small><strong>{fmt(hottest?.tempMaxC)} °C</strong><em>{prettyDate(hottest?.date)}</em></span></div>
          <div><Snowflake /><span><small>Coldest night</small><strong>{fmt(coldest?.tempMinC)} °C</strong><em>{prettyDate(coldest?.date)}</em></span></div>
          <div><Leaf /><span><small>Frost days</small><strong>{summary.frostDays} days</strong><em>Minimum below 0 °C</em></span></div>
        </div>
      </Panel>
    </div>
    <Panel title="The year against local climate" eyebrow="Daily mean · historical 10–90% range" className="chart-panel">
      <div className="chart-wrap chart-tall"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={dailyClimate} margin={{ top: 8, right: 8, left: 8 }}>
        <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={50} tickFormatter={(value) => MONTHS[Number(String(value).slice(5, 7)) - 1]}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" °C" width={68}/>
        <Tooltip labelFormatter={(value) => prettyDate(String(value))} formatter={(value, name) => [`${fmt(Number(value))} °C`, name === "selected" ? String(year) : name === "normal" ? "Historical mean" : "Historical range"]} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/>
        <Area dataKey="low" stackId="temperature-band" stroke="none" fill="transparent"/><Area name="Historical range" dataKey="band" stackId="temperature-band" stroke="none" fill="#efad99" fillOpacity={0.28}/>
        <Line name="Historical mean" type="monotone" dataKey="normal" stroke="#7c8c85" strokeWidth={1.5} dot={false}/><Line name={String(year)} type="monotone" dataKey="selected" stroke="#df6545" strokeWidth={2.2} dot={false}/>
      </ComposedChart></ResponsiveContainer></div>
    </Panel>
    <Panel title="Temperature anomaly calendar" eyebrow="Monthly departure from each month’s local normal">
      <ClimateHeatmap matrix={anomalyMatrix} mode="temperature"/>
    </Panel>
    <div className="dashboard-grid">
      <Panel title="Annual temperature anomaly" eyebrow="Change across the archive" className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={annual} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="year" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" °C" width={68}/><ReferenceLine y={0} stroke="#788078"/>
          <Tooltip formatter={(value) => [`${Number(value) >= 0 ? "+" : ""}${fmt(Number(value))} °C`, "Anomaly"]} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/>
          <Bar dataKey="tempAnomalyC" radius={[4, 4, 0, 0]}>{annual.map((row) => <Cell key={row.year} fill={(row.tempAnomalyC ?? 0) >= 0 ? "#e76745" : "#4a86a1"}/>)}</Bar>
        </BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Heat and frost days" eyebrow="Threshold counts by year" className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={annual} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="year" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} width={46}/><Tooltip formatter={(value) => `${value} days`} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/><Legend/>
          <Bar name="Frost < 0°C" dataKey="frostDays" stackId="cold" fill="#4a86a1"/><Bar name="Summer ≥ 25°C" dataKey="summerDays" fill="#e9a246"/><Bar name="Tropical ≥ 30°C" dataKey="tropicalDays" fill="#e76745"/>
        </BarChart></ResponsiveContainer></div>
      </Panel>
    </div>
  </>;
}

function WindReport({ dataset, year, days, summary }: { dataset: WeatherDataset; year: number; days: DailyWeather[]; summary: PeriodSummary }) {
  const bins = windDirectionBins(days);
  const gust = recordDay(days, "windGustMaxKmh");
  const sustained = recordDay(days, "windSustainedMaxKmh");
  const monthly = MONTHS.map((month, index) => {
    const monthDays = days.filter((day) => Number(day.date.slice(5, 7)) === index + 1);
    return { month, gust: summarize(monthDays).windGustMaxKmh, sustained: summarize(monthDays).windSustainedMaxKmh };
  });
  const annual = annualWindRows(dataset);
  const distribution = distributionRows(days.map((day) => day.windGustMaxKmh), [5, 10, 20, 30, 40, 60, 100]);
  const comparisonYears = [year, ...availableYears(dataset).filter((candidate) => candidate !== year)].slice(0, 6);
  const yearProgress = mergedYearProgress(dataset, year, "wind");
  return <>
    <div className="metrics-grid metrics-grid-three">
      <MetricCard label="Peak gust" value={fmt(summary.windGustMaxKmh, 0)} unit=" km/h" detail={prettyDate(gust?.date)} tone="plum" />
      <MetricCard label="Peak sustained" value={fmt(summary.windSustainedMaxKmh, 0)} unit=" km/h" detail={prettyDate(sustained?.date)} tone="green" />
      <MetricCard label="Mean wind" value={fmt(summary.windAvgKmh)} unit=" km/h" detail={`${year} daily average`} tone="blue" />
    </div>
    <Panel title="Wind through the year" eyebrow="Maximum gust reached · same day across years" className="chart-panel">
      <YearProgressChart data={yearProgress} years={comparisonYears} selectedYear={year} unit=" km/h" digits={0}/>
    </Panel>
    <div className="dashboard-grid">
      <Panel title="Prevailing wind" eyebrow="Direction × daily speed">
        <div className="chart-wrap radar-wrap"><ResponsiveContainer width="100%" height="100%"><RadarChart data={bins} outerRadius="72%">
          <PolarGrid stroke="#dcd8ce" /><PolarAngleAxis dataKey="direction" tick={{ fill: "#5e625c", fontSize: 12 }} />
          <Radar dataKey="value" stroke="#2f7d6e" fill="#2f7d6e" fillOpacity={0.35} strokeWidth={2} />
          <Tooltip formatter={(value) => [fmt(Number(value), 0), "weighted frequency"]} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} />
        </RadarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Monthly wind peaks" eyebrow={`${year} gust vs sustained`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" km/h" width={84} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} formatter={(value) => `${fmt(Number(value), 0)} km/h`} /><Legend />
          <Bar name="Gust" dataKey="gust" fill="#805d91" radius={[5, 5, 0, 0]} /><Bar name="Sustained" dataKey="sustained" fill="#73a598" radius={[5, 5, 0, 0]} />
        </BarChart></ResponsiveContainer></div>
      </Panel>
    </div>
    <div className="dashboard-grid">
      <Panel title="Wind extremes through time" eyebrow="Annual gust and sustained peaks" className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={annual} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="year" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} unit=" km/h" width={84}/><Tooltip formatter={(value) => `${fmt(Number(value), 0)} km/h`} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/><Legend/>
          <Line name="Peak gust" type="monotone" dataKey="gust" stroke="#805d91" strokeWidth={2.8} dot={{ r: 3 }}/><Line name="Peak sustained" type="monotone" dataKey="sustained" stroke="#2f7d6e" strokeWidth={2.2} dot={{ r: 3 }}/>
        </LineChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Daily gust distribution" eyebrow={`${year} · number of days`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={distribution} margin={{ top: 8, right: 8, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc"/><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tick={yAxisTick} width={46}/><Tooltip formatter={(value) => [`${value} days`, "Frequency"]} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }}/><Bar dataKey="count" fill="#805d91" radius={[5, 5, 0, 0]}/>
        </BarChart></ResponsiveContainer></div>
      </Panel>
    </div>
  </>;
}

function DataReport({ dataset, onOpenSetup, onImport, onExport, onExportCsv }: {
  dataset: WeatherDataset; onOpenSetup: () => void; onImport: () => void; onExport: () => void; onExportCsv: () => void;
}) {
  const years = yearlyRows(dataset).slice().reverse();
  const coverageMatrix = climateMatrix(dataset, "coverage");
  return <>
    <div className="data-hero">
      <div><div className="eyebrow">Your archive</div><h2>{dataset.days.length.toLocaleString()} daily summaries</h2><p>Stored as a portable JSON dataset and cached on this device for fast, private analysis.</p></div>
      <div className="data-actions"><button className="button primary" onClick={onOpenSetup}><Settings size={17}/>Connection setup</button><button className="button" onClick={onImport}><FileUp size={17}/>Import backup</button><button className="button" onClick={onExport}><Download size={17}/>Export JSON</button><button className="button" onClick={onExportCsv}><Download size={17}/>Export CSV</button></div>
    </div>
    <Panel title="Archive completeness" eyebrow="Year-by-year diagnostics">
      <div className="table-scroll"><table><thead><tr><th>Year</th><th>Mean temp.</th><th>Rainfall</th><th>Peak gust</th><th>Frost days</th><th>Coverage</th></tr></thead><tbody>
        {years.map((row) => <tr key={row.year}><td><strong>{row.year}</strong></td><td>{fmt(row.tempAvgC)} °C</td><td>{fmt(row.rainMm, 0)} mm</td><td>{fmt(row.windGustMaxKmh, 0)} km/h</td><td>{row.frostDays}</td><td><span className={`quality-pill ${row.coverage > 0.9 ? "quality-good" : ""}`}>{fmt(row.coverage * 100, 0)}%</span></td></tr>)}
      </tbody></table></div>
    </Panel>
    <Panel title="Coverage calendar" eyebrow="Monthly data completeness">
      <ClimateHeatmap matrix={coverageMatrix} mode="coverage"/>
    </Panel>
    <div className="privacy-note"><CheckCircle2 size={20}/><div><strong>Your WeatherLink secret never reaches this page.</strong><span>Scheduled downloads happen inside GitHub Actions. The public site only receives calculated daily statistics.</span></div></div>
  </>;
}

function SetupModal({ onClose, onImport, onRestore }: { onClose: () => void; onImport: () => void; onRestore: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
      <div className="setup-mark"><Github size={25}/></div>
      <div className="eyebrow">GitHub Pages connection</div><h2 id="setup-title">Connect without exposing your keys</h2>
      <p className="modal-lead">WeatherLink does not allow direct browser requests. A private GitHub Actions job downloads and aggregates your observations instead.</p>
      <ol className="steps">
        <li><span>1</span><div><strong>Rotate the credentials shared in chat</strong><small>Generate a new v2 API secret in your WeatherLink account.</small></div></li>
        <li><span>2</span><div><strong>Add two repository secrets</strong><small><code>WEATHERLINK_API_KEY</code> and <code>WEATHERLINK_API_SECRET</code></small></div></li>
        <li><span>3</span><div><strong>Add optional repository variables</strong><small><code>WEATHERLINK_STATION_ID</code> and <code>WEATHERLINK_START_DATE</code></small></div></li>
        <li><span>4</span><div><strong>Run “Sync & deploy Weather Archive”</strong><small>The scheduled job then refreshes the archive every day.</small></div></li>
      </ol>
      <div className="modal-actions"><a className="button primary" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer"><Github size={17}/>Open GitHub</a><button className="button" onClick={onImport}><FileUp size={17}/>Import a backup</button><button className="text-button" onClick={onRestore}>Use hosted dataset</button></div>
    </section>
  </div>;
}

export default function App() {
  const [dataset, setDataset] = useState<WeatherDataset | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [setupOpen, setSetupOpen] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadHosted = async (force = false) => {
    try {
      const response = await fetch(new URL("data/weather.json", document.baseURI), { cache: "no-store" });
      if (!response.ok) throw new Error("The hosted dataset is not available yet.");
      const hosted = await response.json() as WeatherDataset;
      const localMode = await get<boolean>(LOCAL_MODE_KEY);
      if (!localMode || force) {
        setDataset(hosted);
        await set(STORAGE_KEY, hosted);
        const latest = availableYears(hosted)[0];
        if (latest) setYear(latest);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load weather data.");
    }
  };

  useEffect(() => {
    (async () => {
      const cached = await get<WeatherDataset>(STORAGE_KEY);
      if (cached) {
        setDataset(cached);
        const latest = availableYears(cached)[0];
        if (latest) setYear(latest);
      }
      await loadHosted();
    })();
  }, []);

  const years = useMemo(() => dataset ? availableYears(dataset) : [], [dataset]);
  const days = useMemo(() => dataset ? daysForYear(dataset, year) : [], [dataset, year]);
  const summary = useMemo(() => summarize(days, dataset?.definitions.wetDayMm), [days, dataset]);

  const importDataset = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as WeatherDataset;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.days) || !parsed.station?.name) throw new Error("This is not a Weather Archive backup.");
      parsed.source = "import";
      parsed.sample = false;
      parsed.days.sort((a, b) => a.date.localeCompare(b.date));
      await set(STORAGE_KEY, parsed);
      await set(LOCAL_MODE_KEY, true);
      setDataset(parsed);
      setYear(availableYears(parsed)[0]);
      setSetupOpen(false);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import failed.");
    }
  };

  const restoreHosted = async () => {
    await del(LOCAL_MODE_KEY);
    await loadHosted(true);
    setSetupOpen(false);
  };

  const exportJson = () => dataset && download(`weather-archive-${dataset.station.id}.json`, JSON.stringify(dataset, null, 2), "application/json");
  const exportCsv = () => {
    if (!dataset) return;
    const columns: Array<keyof DailyWeather> = ["date", "tempAvgC", "tempMinC", "tempMaxC", "rainMm", "rainRateMaxMmH", "windAvgKmh", "windSustainedMaxKmh", "windGustMaxKmh", "windGustDirDeg", "coverage"];
    const rows = [columns.join(","), ...dataset.days.map((day) => columns.map((column) => day[column] ?? "").join(","))];
    download(`weather-archive-${dataset.station.id}.csv`, rows.join("\n"), "text/csv");
  };

  if (!dataset) return <main className="loading-screen"><div className="brand-mark"><span/><span/><span/></div><h1>Weather Archive</h1><p>{error || "Opening your local climate record…"}</p></main>;

  const nav: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={19}/> },
    { id: "rain", label: "Rainfall", icon: <Droplets size={19}/> },
    { id: "temperature", label: "Temperature", icon: <Thermometer size={19}/> },
    { id: "wind", label: "Wind", icon: <Wind size={19}/> },
    { id: "data", label: "Data & export", icon: <Database size={19}/> },
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span/><span/><span/></div><div><strong>Weather</strong><em>Archive</em></div></div>
      <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>
      <div className="sidebar-foot"><button onClick={() => setSetupOpen(true)}><Settings size={18}/><span>Connection</span></button><div className="storage-badge"><Database size={15}/><span>Local cache ready</span></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div><div className="station-kicker"><span className="live-dot"/>{dataset.sample ? "Sample archive" : "WeatherLink archive"}</div><h1>{dataset.station.name}</h1><p>{dataset.station.location || dataset.station.timeZone} · through {prettyDate(dataset.days.at(-1)?.date)}</p></div>
        <div className="top-actions"><select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Report year">{years.map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="icon-button" onClick={() => loadHosted()} aria-label="Refresh hosted data"><RefreshCw size={18}/></button><button className="button primary" onClick={() => setSetupOpen(true)}><Settings size={17}/>Connect</button></div>
      </header>

      {dataset.sample && <div className="sample-banner"><Info size={18}/><span>You are exploring realistic sample data. Connect a WeatherLink repository or import a backup to use your station.</span><button onClick={() => setSetupOpen(true)}>Set up</button></div>}
      {error && <div className="error-banner"><Info size={18}/><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16}/></button></div>}

      <div className="page-heading"><div className="eyebrow">{year} report</div><h2>{nav.find((item) => item.id === tab)?.label}</h2><p>{tab === "overview" ? "The meaningful changes, records and comparisons from your exact location." : tab === "data" ? "Portable, transparent and under your control." : `A focused view of ${tab} across your local record.`}</p></div>

      <div className="report-content">
        {days.length === 0 ? <EmptyState/> : tab === "overview" ? <Overview dataset={dataset} year={year} days={days} summary={summary}/>
          : tab === "rain" ? <RainReport dataset={dataset} year={year} days={days} summary={summary}/>
          : tab === "temperature" ? <TemperatureReport dataset={dataset} year={year} days={days} summary={summary}/>
          : tab === "wind" ? <WindReport dataset={dataset} year={year} days={days} summary={summary}/>
          : <DataReport dataset={dataset} onOpenSetup={() => setSetupOpen(true)} onImport={() => fileInput.current?.click()} onExport={exportJson} onExportCsv={exportCsv}/>
        }
      </div>
      <footer><span>Weather Archive</span><span>Local-day statistics · metric units · WeatherLink v2</span></footer>
    </main>
    <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => event.target.files?.[0] && importDataset(event.target.files[0])}/>
    {setupOpen && <SetupModal onClose={() => setSetupOpen(false)} onImport={() => fileInput.current?.click()} onRestore={restoreHosted}/>} 
  </div>;
}
