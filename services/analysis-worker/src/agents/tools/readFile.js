/**
 * `read_file` tool implementation: reads a workdir-relative file, optionally
 * slicing to a line range, and returns text with line numbers so the model
 * can reference them in patches.
 * @module agents/tools/readFile
 */

const fs = require('fs/promises');
const { safeJoin } = require('./paths');

const MAX_BYTES = 256 * 1024; // 256 KB cap per read

async function readFile(workdir, { path: requested, start_line, end_line }) {
  const abs = safeJoin(workdir, requested);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${requested}`);
  }
  if (stat.size > MAX_BYTES) {
    throw new Error(`File too large (${stat.size} bytes > ${MAX_BYTES}); request a line range`);
  }

  const content = await fs.readFile(abs, 'utf8');
  const lines = content.split('\n');
  const startIdx = Math.max(0, (start_line || 1) - 1);
  const endIdx = end_line ? Math.min(lines.length, end_line) : lines.length;

  const numbered = lines
    .slice(startIdx, endIdx)
    .map((line, i) => `${String(startIdx + i + 1).padStart(5)}: ${line}`)
    .join('\n');

  return numbered;
}

module.exports = { readFile };
