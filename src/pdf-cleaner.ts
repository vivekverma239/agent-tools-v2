import { execFile } from 'node:child_process';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Strip password protection / encryption from a PDF using qpdf.
 * If qpdf is not installed or fails, returns the original buffer unchanged.
 */
export async function cleanPdf(input: Buffer): Promise<Buffer> {
  // Quick check: does this look like a PDF at all?
  if (!isPdf(input)) return input;

  const id = randomBytes(8).toString('hex');
  const tmpPath = join(tmpdir(), `dl-clean-${id}.pdf`);

  try {
    await writeFile(tmpPath, input);
    await qpdfDecrypt(tmpPath);
    const cleaned = await readFile(tmpPath);
    return cleaned;
  } catch {
    // qpdf missing, failed, or PDF wasn't encrypted — return original
    return input;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

function isPdf(buf: Buffer): boolean {
  return buf.length > 4 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
}

function qpdfDecrypt(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('qpdf', ['--decrypt', '--replace-input', filePath], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
