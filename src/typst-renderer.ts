import { execFile } from 'node:child_process';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { randomBytes } from 'node:crypto';
import { TEMPLATES } from './templates.js';

export interface TypstFiles {
  /** Map of relative path → base64-encoded file content (images, data, .typ includes) */
  [path: string]: string;
}

export interface RenderOptions {
  files?: TypstFiles;
  /** Built-in style preset name (e.g. "report", "memo", "letter") */
  template?: string;
}

/**
 * Compile Typst markup to PDF using the `typst` CLI.
 * Optional `files` map lets the markup reference images / includes by relative path.
 * Optional `template` prepends a built-in style preset to the markup.
 * Throws on compilation failure so the caller can surface the error.
 */
export async function renderTypst(markup: string, options?: RenderOptions): Promise<Buffer> {
  const { files, template } = options ?? {};

  if (template && !(template in TEMPLATES)) {
    throw new Error(`Unknown template: "${template}". Available: ${Object.keys(TEMPLATES).join(', ')}`);
  }

  const fullMarkup = template ? TEMPLATES[template] + '\n' + markup : markup;
  const id = randomBytes(8).toString('hex');
  const workDir = join(tmpdir(), `typst-${id}`);
  const inputPath = join(workDir, 'main.typ');
  const outputPath = join(workDir, 'output.pdf');

  try {
    await mkdir(workDir, { recursive: true });

    // Write companion files first so the main markup can reference them
    if (files) {
      for (const [relPath, b64] of Object.entries(files)) {
        const dest = safePath(workDir, relPath);
        await mkdir(join(dest, '..'), { recursive: true });
        await writeFile(dest, Buffer.from(b64, 'base64'));
      }
    }

    await writeFile(inputPath, fullMarkup, 'utf-8');
    await typstCompile(inputPath, outputPath);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Resolve a relative path inside workDir, rejecting traversal attempts. */
function safePath(workDir: string, relPath: string): string {
  const resolved = normalize(join(workDir, relPath));
  if (!resolved.startsWith(workDir + '/')) {
    throw new Error(`Invalid file path: ${relPath}`);
  }
  return resolved;
}

function typstCompile(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('typst', ['compile', input, output], (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}
