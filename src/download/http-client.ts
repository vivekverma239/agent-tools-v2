const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="131", "Chromium";v="131"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const BINARY_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/octet-stream',
  'application/zip',
];

const CLOUDFLARE_INDICATORS = ['cf-ray', 'cf-cache-status', 'cf-mitigated'];

const CHALLENGE_MARKERS = [
  'checking your browser',
  'cf-browser-verification',
  'just a moment',
  '_cf_chl_opt',
  'ddos-guard',
];

export interface HttpDownloadResult {
  needsBrowser: false;
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentDisposition: string;
  contentLength: number | undefined;
  statusCode: number;
}

export interface NeedsBrowserResult {
  needsBrowser: true;
}

export type DownloadAttempt = HttpDownloadResult | NeedsBrowserResult;

/**
 * Single-pass download: sends GET, inspects headers, and either streams the
 * body back or signals that browser fallback is needed. No separate HEAD probe.
 */
export async function httpDownload(url: string, timeout: number): Promise<DownloadAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const response = await fetch(url, {
    method: 'GET',
    headers: BROWSER_HEADERS,
    redirect: 'follow',
    signal: controller.signal,
  });

  clearTimeout(timer);

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const isBinary = BINARY_CONTENT_TYPES.some((t) => contentType.includes(t));
  const hasCloudflare = CLOUDFLARE_INDICATORS.some((key) => response.headers.has(key));

  // Blocked responses → browser
  if (response.status === 403 || response.status === 503 || hasCloudflare) {
    await response.body?.cancel();
    return { needsBrowser: true };
  }

  // Binary content → stream directly (fast path for PDFs/docs)
  if (isBinary && response.body) {
    const contentDisposition = response.headers.get('content-disposition') || '';
    const cl = response.headers.get('content-length');
    return {
      needsBrowser: false,
      body: response.body,
      contentType,
      contentDisposition,
      contentLength: cl ? parseInt(cl, 10) : undefined,
      statusCode: response.status,
    };
  }

  // HTML response → sniff for challenge pages
  if (contentType.includes('text/html') && response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    while (size < 4096) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    await reader.cancel();

    const head = Buffer.concat(chunks).toString('utf-8').toLowerCase();
    if (CHALLENGE_MARKERS.some((m) => head.includes(m))) {
      return { needsBrowser: true };
    }

    // Non-challenge HTML → still escalate for doc downloads
    return { needsBrowser: true };
  }

  // Other content types → stream
  if (response.body) {
    const contentDisposition = response.headers.get('content-disposition') || '';
    const cl = response.headers.get('content-length');
    return {
      needsBrowser: false,
      body: response.body,
      contentType,
      contentDisposition,
      contentLength: cl ? parseInt(cl, 10) : undefined,
      statusCode: response.status,
    };
  }

  return { needsBrowser: true };
}
