import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser } from 'puppeteer-core';
import config from '../config.js';

const puppeteer = puppeteerExtra as any;
puppeteer.use(StealthPlugin());

let browser: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) {
    resetIdleTimer();
    return browser;
  }

  if (launching) return launching;

  launching = (async () => {
    const b = await puppeteer.launch({
      executablePath: config.chromePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--no-first-run',
        '--no-zygote',
        '--mute-audio',
      ],
    });
    browser = b;
    launching = null;
    resetIdleTimer();
    return b;
  })();

  return launching;
}

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  }, config.browserIdleMs);
}

export interface BrowserDownloadResult {
  buffer: Buffer;
  contentType: string;
  contentDisposition: string;
}

/**
 * Download a URL using headless Chrome with stealth.
 */
export async function browserDownload(url: string, timeout: number): Promise<BrowserDownloadResult> {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width: 1920, height: 1080 });

    const client = await page.createCDPSession();
    await client.send('Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Response' }],
    });

    let documentBody: Buffer | null = null;
    let documentContentType = 'application/octet-stream';

    client.on('Fetch.requestPaused', async (event: any) => {
      const { requestId, responseStatusCode, responseHeaders } = event;
      const ct = (responseHeaders || []).find(
        (h: any) => h.name.toLowerCase() === 'content-type'
      );
      const contentType: string = ct ? ct.value : '';

      const isBinary =
        contentType.includes('application/pdf') ||
        contentType.includes('application/octet-stream') ||
        contentType.includes('application/msword') ||
        contentType.includes('application/vnd.');

      if (isBinary && responseStatusCode === 200) {
        try {
          const resp = await client.send('Fetch.getResponseBody', { requestId });
          documentBody = (resp as any).base64Encoded
            ? Buffer.from((resp as any).body, 'base64')
            : Buffer.from((resp as any).body);
          documentContentType = contentType;
        } catch {
          // ignore
        }
      }

      try {
        await client.send('Fetch.continueResponse', { requestId });
      } catch {
        // page may have closed
      }
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    if (!documentBody) {
      await new Promise((r) => setTimeout(r, 2000));

      const currentUrl = page.url();
      if (currentUrl.endsWith('.pdf') || currentUrl.includes('.pdf')) {
        documentBody = Buffer.from(await page.pdf({ format: 'A4' }));
        documentContentType = 'application/pdf';
      }
    }

    if (!documentBody) {
      documentBody = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
      documentContentType = 'application/pdf';
    }

    resetIdleTimer();

    return {
      buffer: documentBody,
      contentType: documentContentType,
      contentDisposition: '',
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Gracefully close the browser if running.
 */
export async function closeBrowser(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
