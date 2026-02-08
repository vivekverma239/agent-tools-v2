import { Readable } from 'node:stream';
import archiver from 'archiver';
import Fastify from 'fastify';
import config from './config.js';
import { download, type DownloadResult } from './download/index.js';
import { renderTypst } from './typst-renderer.js';
import { TEMPLATE_NAMES } from './templates.js';
import { closeBrowser } from './download/browser-client.js';

const app = Fastify({ logger: true });

// --- API-key auth ---
const API_KEY = process.env.API_KEY || '';
const PUBLIC_PATHS = new Set(['/', '/health', '/llm.txt']);

app.addHook('onRequest', async (request, reply) => {
  if (!API_KEY) return;                           // no key configured → open
  if (PUBLIC_PATHS.has(request.url)) return;      // public endpoints

  const provided =
    request.headers['x-api-key'] ||
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : '');

  if (provided !== API_KEY) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing API key' });
  }
});

app.get('/health', async () => ({ status: 'ok' }));

// --- /llm.txt ---
app.get('/llm.txt', async (_request, reply) => {
  reply.type('text/plain').send(LLM_TXT);
});

const LLM_TXT = `# download.agents-tools.com
> Document download API — fetches PDFs, Office docs, and other files from URLs,
> bypassing Cloudflare and bot protection when needed.

## Base URL
https://download.agents-tools.com

## Authentication
Include your API key in every request (except /health and /llm.txt):
  x-api-key: <your-key>
  — or —
  Authorization: Bearer <your-key>

## Endpoints

### GET /health
Health check. Returns {"status":"ok"}.

### GET /llm.txt
This file — machine-readable API guidelines.

### POST /download
Download a single document.

Request body (JSON):
  {
    "url": "<target URL>",           // required
    "strategy": "auto",              // optional: "auto" | "http" | "browser"
    "timeout": 30000                 // optional: 1000–120000 ms
  }

Response: the file bytes with appropriate Content-Type / Content-Disposition.

Example:
  curl -X POST https://download.agents-tools.com/download \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: YOUR_KEY" \\
    -d '{"url":"https://example.com/report.pdf"}' \\
    -o report.pdf

### POST /download-batch
Download up to 20 URLs, returned as a ZIP archive.

Request body (JSON):
  {
    "urls": ["<url1>", "<url2>", …], // required, 1–20 items
    "strategy": "auto",              // optional
    "timeout": 30000                 // optional
  }

Response: application/zip attachment.

Example:
  curl -X POST https://download.agents-tools.com/download-batch \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: YOUR_KEY" \\
    -d '{"urls":["https://example.com/a.pdf","https://example.com/b.pdf"]}' \\
    -o documents.zip

### POST /generate-pdf
Generate a PDF from Typst markup.

Request body (JSON):
  {
    "markup": "<Typst markup>",          // required
    "filename": "document.pdf",          // optional, default "document.pdf"
    "template": "report",               // optional: style preset (see below)
    "files": {                           // optional: companion files (images, data, includes)
      "logo.png": "<base64>",           //   key = relative path, value = base64-encoded content
      "styles/theme.typ": "<base64>"    //   subdirectories are created automatically
    }
  }

Templates (built-in style presets — set fonts, spacing, heading styles automatically):
  "report"  — serif font (New Computer Modern), numbered headings, page numbers, justified text
  "memo"    — sans-serif (IBM Plex Sans), compact spacing, clean dividers
  "letter"  — serif (Libertinus Serif), formal letter layout with generous top margin

The markup can reference companion files by their relative path, e.g. #image("logo.png").

Response: the compiled PDF with Content-Type: application/pdf.

Examples:

  Simple (markup only):
  curl -X POST https://download.agents-tools.com/generate-pdf \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: YOUR_KEY" \\
    -d '{"markup":"= Hello World\\nThis is a PDF generated from Typst markup."}' \\
    -o output.pdf

  With a template:
  curl -X POST https://download.agents-tools.com/generate-pdf \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: YOUR_KEY" \\
    -d '{"markup":"= Quarterly Report\\n== Summary\\nRevenue grew 12%.","template":"report"}' \\
    -o report.pdf

  With an embedded image:
  curl -X POST https://download.agents-tools.com/generate-pdf \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: YOUR_KEY" \\
    -d '{"markup":"= Report\\n#image(\\"chart.png\\", width: 80%)","files":{"chart.png":"iVBOR..."}}' \\
    -o report.pdf

Typst quick reference (enough to produce most documents):
  = Heading 1          #strong[bold]       #list[item1][item2]
  == Heading 2         #emph[italic]       #enum[first][second]
  === Heading 3        #link("url")[text]   #table(columns:2)[a][b][c][d]
  — body text —        #image("path")      #pagebreak()

  IMPORTANT: Escape these special characters in body text:
    \\$  (dollar — otherwise triggers math mode)
    \\#  (hash — otherwise starts a function/keyword)
    \\\\ (backslash)
  Example: "Revenue was \\$4.2M" not "Revenue was $4.2M"

  Full docs: https://typst.app/docs

## Notes
- PDFs are automatically decrypted (password protection stripped) before delivery.
- "auto" strategy first tries a fast HTTP fetch; falls back to headless Chrome if blocked.
- Maximum file size: 100 MB per document.
- Batch endpoint: max 20 URLs per request.
`;

app.post('/download', {
  schema: {
    body: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri' },
        strategy: { type: 'string', enum: ['auto', 'http', 'browser'], default: 'auto' },
        timeout: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 },
      },
    },
  },
}, async (request, reply) => {
  const { url, strategy, timeout } = request.body as {
    url: string;
    strategy?: 'auto' | 'http' | 'browser';
    timeout?: number;
  };

  try {
    const result = await download(url, { strategy, timeout });
    return sendResult(reply, result);
  } catch (err: any) {
    request.log.error({ err, url }, 'Download failed');
    reply.code(502).send({ error: 'Download failed', message: err.message });
  }
});

app.post('/download-batch', {
  schema: {
    body: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          minItems: 1,
          maxItems: 20,
        },
        strategy: { type: 'string', enum: ['auto', 'http', 'browser'], default: 'auto' },
        timeout: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 },
      },
    },
  },
}, async (request, reply) => {
  const { urls, strategy, timeout } = request.body as {
    urls: string[];
    strategy?: 'auto' | 'http' | 'browser';
    timeout?: number;
  };

  const archive = archiver('zip', { store: true });
  reply
    .header('Content-Type', 'application/zip')
    .header('Content-Disposition', 'attachment; filename="documents.zip"');

  reply.send(archive);

  await Promise.allSettled(
    urls.map(async (url, i) => {
      try {
        const result = await download(url, { strategy, timeout });
        const filename = filenameFromResult(url, result, i);

        if ('buffer' in result) {
          archive.append(result.buffer, { name: filename });
        } else {
          const nodeStream = Readable.fromWeb(result.body as any);
          archive.append(nodeStream, { name: filename });
        }
      } catch (err: any) {
        request.log.warn({ err, url }, 'Batch download: failed for URL');
        archive.append(Buffer.from(`Download failed: ${err.message}\n`), {
          name: `errors/${filenameFromUrl(url, i)}.error.txt`,
        });
      }
    })
  );

  archive.finalize();
  return reply;
});

app.post('/generate-pdf', {
  schema: {
    body: {
      type: 'object',
      required: ['markup'],
      properties: {
        markup: { type: 'string' },
        filename: { type: 'string', default: 'document.pdf' },
        template: { type: 'string', enum: TEMPLATE_NAMES },
        files: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
    },
  },
}, async (request, reply) => {
  const { markup, filename, template, files } = request.body as {
    markup: string;
    filename?: string;
    template?: string;
    files?: Record<string, string>;
  };

  try {
    const pdf = await renderTypst(markup, { template, files });
    const name = filename || 'document.pdf';
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${name}"`)
      .send(pdf);
    return reply;
  } catch (err: any) {
    request.log.error({ err }, 'Typst compilation failed');
    reply.code(500).send({ error: 'Typst compilation failed', message: err.message });
  }
});

function sendResult(reply: any, result: DownloadResult) {
  if ('buffer' in result) {
    reply
      .header('Content-Type', result.contentType)
      .header('Content-Disposition', result.contentDisposition || 'attachment')
      .send(result.buffer);
    return reply;
  }

  reply.header('Content-Type', result.contentType);
  if (result.contentDisposition) {
    reply.header('Content-Disposition', result.contentDisposition);
  }
  if (result.contentLength) {
    reply.header('Content-Length', result.contentLength);
  }
  const nodeStream = Readable.fromWeb(result.body as any);
  return reply.send(nodeStream);
}

function filenameFromResult(url: string, result: DownloadResult, index: number): string {
  const disposition = 'contentDisposition' in result ? result.contentDisposition : '';
  if (disposition) {
    const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/i);
    if (match) return match[1];
  }
  return filenameFromUrl(url, index);
}

function filenameFromUrl(url: string, index: number): string {
  try {
    const pathname = new URL(url).pathname;
    const basename = pathname.split('/').filter(Boolean).pop();
    if (basename && basename.includes('.')) return basename;
  } catch {
    // ignore
  }
  return `document_${index}`;
}

async function start() {
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

async function shutdown() {
  await closeBrowser();
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
