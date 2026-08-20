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
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  MONTHS,
  availableYears,
  daysForYear,
  frostDates,
  longestDrySpell,
  mergedYtdChart,
  monthRank,
  monthlyRows,
  recordDay,
  summarize,
  windDirectionBins,
  yearlyRows,
} from "./analytics";
import type { DailyWeather, PeriodSummary, WeatherDataset } from "./types";

type Tab = "overview" | "rain" | "temperature" | "wind" | "data";
const STORAGE_KEY = "weather-archive:dataset:v1";
const LOCAL_MODE_KEY = "weather-archive:local-mode";
const chartColors = ["#f16e4b", "#2f7d6e", "#7aa9a1", "#d8a72e", "#805d91", "#74a4d4"];

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
            <LineChart data={ytdData} margin={{ top: 10, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke="#e8e5dc" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "#7b7a73", fontSize: 11 }} tickFormatter={(d) => d % 60 === 1 ? `Day ${d}` : ""} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#7b7a73", fontSize: 11 }} unit=" mm" width={68} />
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
  </>;
}

function RainReport({ dataset, year, days, summary }: { dataset: WeatherDataset; year: number; days: DailyWeather[]; summary: PeriodSummary }) {
  const monthly = monthlyRows(dataset, year);
  const dry = longestDrySpell(days, dataset.definitions.wetDayMm);
  const wettest = recordDay(days, "rainMm");
  const rate = recordDay(days, "rainRateMaxMmH");
  const annual = yearlyRows(dataset);
  return <>
    <div className="metrics-grid metrics-grid-three">
      <MetricCard label="Annual total" value={fmt(summary.rainMm, 0)} unit=" mm" detail={`${summary.wetDays} days ≥ ${dataset.definitions.wetDayMm} mm`} tone="blue" />
      <MetricCard label="Longest dry spell" value={String(dry.days)} unit=" days" detail={dry.start ? `${prettyDate(dry.start)} – ${prettyDate(dry.end)}` : "No complete dry spell"} tone="orange" />
      <MetricCard label="Peak rain rate" value={fmt(summary.rainRateMaxMmH, 0)} unit=" mm/h" detail={prettyDate(rate?.date)} tone="plum" />
    </div>
    <div className="dashboard-grid">
      <Panel title="Monthly rainfall" eyebrow={`${year} distribution`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly} margin={{ top: 8, right: 8, left: -14 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} unit=" mm" width={62} />
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
    <Panel title="Annual rainfall comparison" eyebrow="Long-term record">
      <div className="table-scroll"><table><thead><tr><th>Year</th><th>Total</th><th>Wet days</th><th>Dry days</th><th>Peak rate</th><th>Coverage</th></tr></thead><tbody>
        {annual.map((row) => <tr key={row.year} className={row.year === year ? "selected-row" : ""}><td><strong>{row.year}</strong></td><td>{fmt(row.rainMm, 0)} mm</td><td>{row.wetDays}</td><td>{row.dryDays}</td><td>{fmt(row.rainRateMaxMmH, 0)} mm/h</td><td>{fmt(row.coverage * 100, 0)}%</td></tr>)}
      </tbody></table></div>
    </Panel>
  </>;
}

function TemperatureReport({ dataset, year, days, summary }: { dataset: WeatherDataset; year: number; days: DailyWeather[]; summary: PeriodSummary }) {
  const monthly = monthlyRows(dataset, year);
  const frost = frostDates(days);
  const coldest = recordDay(days, "tempMinC", "min");
  const hottest = recordDay(days, "tempMaxC");
  return <>
    <div className="metrics-grid metrics-grid-three">
      <MetricCard label="Mean temperature" value={fmt(summary.tempAvgC)} unit=" °C" detail={`${year} observation mean`} tone="orange" />
      <MetricCard label="Last spring frost" value={frost.spring ? prettyDate(frost.spring.date).replace(` ${year}`, "") : "None"} detail={frost.spring ? `${fmt(frost.spring.tempMinC)} °C minimum` : "No frost before July"} tone="blue" />
      <MetricCard label="First autumn frost" value={frost.autumn ? prettyDate(frost.autumn.date).replace(` ${year}`, "") : "Not yet"} detail={frost.autumn ? `${fmt(frost.autumn.tempMinC)} °C minimum` : "No frost after June"} tone="plum" />
    </div>
    <div className="dashboard-grid">
      <Panel title="Temperature envelope" eyebrow={`${year} monthly range`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly} margin={{ top: 8, right: 8, left: -18 }}>
          <defs><linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef7554" stopOpacity={0.35}/><stop offset="95%" stopColor="#ef7554" stopOpacity={0.02}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#e8e5dc" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} unit="°" width={48} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} formatter={(value, name) => [`${fmt(Number(value))} °C`, String(name).replace("temp", "").replace("C", "")]} />
          <Area type="monotone" dataKey="tempMaxC" stroke="#e76745" fill="url(#tempFill)" strokeWidth={2} /><Line type="monotone" dataKey="tempAvgC" stroke="#1d4037" strokeWidth={3} dot={false}/><Line type="monotone" dataKey="tempMinC" stroke="#4a86a1" strokeWidth={2} dot={false}/>
        </AreaChart></ResponsiveContainer></div>
        <div className="chart-legend"><span><i style={{ background: "#e76745" }}/>High</span><span><i style={{ background: "#1d4037" }}/>Mean</span><span><i style={{ background: "#4a86a1" }}/>Low</span></div>
      </Panel>
      <Panel title="Temperature records" eyebrow="Daily extremes">
        <div className="record-list">
          <div><Thermometer /><span><small>Warmest day</small><strong>{fmt(hottest?.tempMaxC)} °C</strong><em>{prettyDate(hottest?.date)}</em></span></div>
          <div><Snowflake /><span><small>Coldest night</small><strong>{fmt(coldest?.tempMinC)} °C</strong><em>{prettyDate(coldest?.date)}</em></span></div>
          <div><Leaf /><span><small>Frost days</small><strong>{summary.frostDays} days</strong><em>Minimum below 0 °C</em></span></div>
        </div>
      </Panel>
    </div>
  </>;
}

function WindReport({ year, days, summary }: { year: number; days: DailyWeather[]; summary: PeriodSummary }) {
  const bins = windDirectionBins(days);
  const gust = recordDay(days, "windGustMaxKmh");
  const sustained = recordDay(days, "windSustainedMaxKmh");
  const monthly = MONTHS.map((month, index) => {
    const monthDays = days.filter((day) => Number(day.date.slice(5, 7)) === index + 1);
    return { month, gust: summarize(monthDays).windGustMaxKmh, sustained: summarize(monthDays).windSustainedMaxKmh };
  });
  return <>
    <div className="metrics-grid metrics-grid-three">
      <MetricCard label="Peak gust" value={fmt(summary.windGustMaxKmh, 0)} unit=" km/h" detail={prettyDate(gust?.date)} tone="plum" />
      <MetricCard label="Peak sustained" value={fmt(summary.windSustainedMaxKmh, 0)} unit=" km/h" detail={prettyDate(sustained?.date)} tone="green" />
      <MetricCard label="Mean wind" value={fmt(summary.windAvgKmh)} unit=" km/h" detail={`${year} daily average`} tone="blue" />
    </div>
    <div className="dashboard-grid">
      <Panel title="Prevailing wind" eyebrow="Direction × daily speed">
        <div className="chart-wrap radar-wrap"><ResponsiveContainer width="100%" height="100%"><RadarChart data={bins} outerRadius="72%">
          <PolarGrid stroke="#dcd8ce" /><PolarAngleAxis dataKey="direction" tick={{ fill: "#5e625c", fontSize: 12 }} />
          <Radar dataKey="value" stroke="#2f7d6e" fill="#2f7d6e" fillOpacity={0.35} strokeWidth={2} />
          <Tooltip formatter={(value) => [fmt(Number(value), 0), "weighted frequency"]} contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} />
        </RadarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Monthly wind peaks" eyebrow={`${year} gust vs sustained`} className="chart-panel">
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly} margin={{ top: 8, right: 8, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#e8e5dc" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} unit=" km/h" width={72} />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dedbd1" }} formatter={(value) => `${fmt(Number(value), 0)} km/h`} /><Legend />
          <Bar name="Gust" dataKey="gust" fill="#805d91" radius={[5, 5, 0, 0]} /><Bar name="Sustained" dataKey="sustained" fill="#73a598" radius={[5, 5, 0, 0]} />
        </BarChart></ResponsiveContainer></div>
      </Panel>
    </div>
  </>;
}

function DataReport({ dataset, onOpenSetup, onImport, onExport, onExportCsv }: {
  dataset: WeatherDataset; onOpenSetup: () => void; onImport: () => void; onExport: () => void; onExportCsv: () => void;
}) {
  const years = yearlyRows(dataset).slice().reverse();
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
          : tab === "wind" ? <WindReport year={year} days={days} summary={summary}/>
          : <DataReport dataset={dataset} onOpenSetup={() => setSetupOpen(true)} onImport={() => fileInput.current?.click()} onExport={exportJson} onExportCsv={exportCsv}/>
        }
      </div>
      <footer><span>Weather Archive</span><span>Local-day statistics · metric units · WeatherLink v2</span></footer>
    </main>
    <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => event.target.files?.[0] && importDataset(event.target.files[0])}/>
    {setupOpen && <SetupModal onClose={() => setSetupOpen(false)} onImport={() => fileInput.current?.click()} onRestore={restoreHosted}/>} 
  </div>;
}
