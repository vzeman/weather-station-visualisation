# Weather Archive

Weather Archive turns raw WeatherLink v2 observations into long-term, local climate reports. It runs as a static React application on GitHub Pages. A scheduled GitHub Actions workflow downloads observations, calculates portable daily summaries, and deploys the refreshed dashboard.

The browser never receives your WeatherLink API key or secret.

## What it reports

- Monthly, annual and year-to-date rainfall comparisons
- Wet and dry days, longest dry spell and peak rain rate
- Mean, minimum and maximum temperature
- Last spring frost, first autumn frost and frost-day count
- Peak gust, peak sustained wind, monthly wind extremes and prevailing direction
- Historical rankings, record days and data-completeness diagnostics
- JSON backup/import and CSV export
- Responsive desktop and mobile dashboard

## Publish your own station

1. Create a GitHub repository from this project and push it to the `main` branch.
2. Open **Settings → Pages** and select **GitHub Actions** as the source.
3. Open **Settings → Secrets and variables → Actions → Secrets** and add `WEATHERLINK_API_KEY` and `WEATHERLINK_API_SECRET`.
4. Under **Variables**, optionally add `WEATHERLINK_STATION_ID` when the account has multiple stations and `WEATHERLINK_START_DATE` in `YYYY-MM-DD` format.
5. Open **Actions**, choose **Sync & deploy Weather Archive**, and run it manually.

The first manual run downloads up to 365 missing days. Repeat it to backfill a longer archive. The scheduled run refreshes recent observations and imports up to 180 missing days every night at 02:17 UTC.

WeatherLink historic API access requires a Pro or Pro+ station subscription. One API request can cover at most 24 hours, so long archives are deliberately imported in resumable batches.

## Security

- Rotate any API credentials that have previously been pasted into messages, issues or source files.
- Keep credentials only in GitHub Actions encrypted secrets.
- The workflow writes calculated daily statistics to `public/data/weather.json`; that file becomes public with the GitHub Pages site.
- Precise station coordinates are not included in the generated dataset.
- For a private archive, use a private repository with a GitHub plan that supports private Pages, or deploy the same static build behind private hosting.

## Local development

```bash
npm install
node scripts/generate-demo.mjs
npm run dev
```

Useful checks:

```bash
npm test
npm run lint
npm run build
```

## Data format

`public/data/weather.json` stores one row per local calendar day. Temperatures use °C, rainfall uses mm and mm/h, wind uses km/h, and coverage ranges from `0` to `1`.

WeatherLink temperatures arrive in Fahrenheit and wind speeds in mph. The sync script converts them and groups statistics in the station's IANA timezone, including daylight-saving transitions.

## Manual backup mode

The Data & export screen can export the complete JSON archive or import it into IndexedDB. An imported archive stays local to that browser until **Use hosted dataset** is selected in Connection setup.

## Project structure

- `src/` — dashboard, charts, analytics and browser cache
- `scripts/sync-weatherlink.mjs` — authenticated WeatherLink importer
- `scripts/generate-demo.mjs` — deterministic sample dataset
- `public/data/weather.json` — deployed portable archive
- `.github/workflows/pages.yml` — nightly sync and GitHub Pages deployment

## License

MIT
