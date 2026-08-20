export type DailyWeather = {
  date: string;
  tempAvgC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
  tempMinAt?: number | null;
  tempMaxAt?: number | null;
  rainMm: number | null;
  rainRateMaxMmH: number | null;
  windAvgKmh: number | null;
  windSustainedMaxKmh: number | null;
  windGustMaxKmh: number | null;
  windGustDirDeg?: number | null;
  coverage: number;
  records?: number;
};

export type WeatherDataset = {
  schemaVersion: 1;
  generatedAt: string;
  source: "weatherlink-v2" | "sample" | "import";
  sample?: boolean;
  station: {
    id: string;
    name: string;
    location?: string;
    timeZone: string;
    recordingIntervalMinutes?: number;
  };
  definitions: { wetDayMm: number; frostC: number };
  days: DailyWeather[];
};

export type PeriodSummary = {
  tempAvgC: number | null;
  tempMinC: number | null;
  tempMaxC: number | null;
  rainMm: number;
  rainRateMaxMmH: number | null;
  windAvgKmh: number | null;
  windSustainedMaxKmh: number | null;
  windGustMaxKmh: number | null;
  dryDays: number;
  wetDays: number;
  frostDays: number;
  coverage: number;
};
