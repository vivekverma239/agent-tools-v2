# Downloader Service

Document download API that fetches PDFs, Office docs, and other files from URLs — bypassing Cloudflare and bot protection when needed. Also generates PDFs from Typst markup.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/llm.txt` | Machine-readable API docs |
| POST | `/download` | Download a single document from a URL |
| POST | `/download-batch` | Download up to 20 URLs, returned as ZIP |
| POST | `/generate-pdf` | Generate PDF from Typst markup |

## PDF Generation

The `/generate-pdf` endpoint compiles [Typst](https://typst.app) markup to PDF.

```bash
curl -X POST http://localhost:3000/generate-pdf \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{"markup":"= Hello World\nGenerated with Typst.", "template": "report"}' \
  -o output.pdf
```

**Request body:**
- `markup` (string, required) — Typst source
- `template` (string, optional) — style preset: `report`, `memo`, or `letter`
- `filename` (string, optional) — output filename, default `document.pdf`
- `files` (object, optional) — companion files (images, includes) as `{ "path": "<base64>" }`

**Templates:**
- `report` — serif (New Computer Modern), numbered headings, page numbers, justified
- `memo` — sans-serif (IBM Plex Sans), compact spacing, clean dividers
- `letter` — serif (Libertinus Serif), formal layout, generous top margin

## Development

```bash
npm install
npm run dev      # watch mode with tsx
npm run build    # compile TypeScript
npm start        # run compiled server
```

Requires Node 22+ and [Typst](https://typst.app) CLI for PDF generation.

## Docker

```bash
docker build -t downloader .
docker run -p 3000:3000 -e API_KEY=secret downloader
```

The Dockerfile installs Chrome (for browser-based downloads), qpdf (for PDF decryption), and Typst (for PDF generation).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_KEY` | API key for authentication (empty = open) | — |
| `PORT` | Server port | `3000` |
| `HOST` | Bind address | `0.0.0.0` |
