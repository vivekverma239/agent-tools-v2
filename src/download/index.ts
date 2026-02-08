import { httpDownload, type HttpDownloadResult } from './http-client.js';
import { browserDownload, type BrowserDownloadResult } from './browser-client.js';
import config from '../config.js';
import { cleanPdf } from '../pdf-cleaner.js';

export type DownloadResult = HttpDownloadResult | BrowserDownloadResult;

interface DownloadOptions {
  strategy?: 'auto' | 'http' | 'browser';
  timeout?: number;
}

/**
 * Download a document from the given URL.
 *
 * "auto" sends a single GET — if the response is binary, streams it directly.
 * If blocked or HTML challenge, falls back to browser. No separate HEAD probe.
 */
export async function download(url: string, options: DownloadOptions = {}): Promise<DownloadResult> {
  const { strategy = 'auto', timeout = config.defaultTimeout } = options;

  if (strategy === 'browser') {
    return maybecleanPdf(await browserDownload(url, timeout));
  }

  const result = await httpDownload(url, timeout);

  if (!result.needsBrowser) return maybecleanPdf(result);

  if (strategy === 'http') {
    throw new Error('HTTP download blocked; use strategy "auto" or "browser"');
  }

  // auto: escalate to browser
  return maybecleanPdf(await browserDownload(url, timeout));
}

/**
 * If the result is a PDF, buffer it and strip encryption.
 * Non-PDF results pass through unchanged.
 */
async function maybecleanPdf(result: DownloadResult): Promise<DownloadResult> {
  const isPdf = result.contentType.includes('application/pdf');
  if (!isPdf) return result;

  // Browser results are already buffered
  if ('buffer' in result) {
    const cleaned = await cleanPdf(result.buffer);
    return { ...result, buffer: cleaned };
  }

  // HTTP stream results — consume into buffer, clean, return as buffer result
  const reader = result.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const buffer = await cleanPdf(Buffer.concat(chunks));

  return {
    buffer,
    contentType: result.contentType,
    contentDisposition: result.contentDisposition,
  };
}
