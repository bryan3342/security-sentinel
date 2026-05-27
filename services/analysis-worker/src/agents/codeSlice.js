/**
 * Pull a numbered code slice around a finding's line for use as model context.
 * @module agents/codeSlice
 */

const fs = require('fs/promises');
const { safeJoin } = require('./tools/paths');

const DEFAULT_RADIUS = 12;

async function codeSliceAround(workdir, filePath, line, radius = DEFAULT_RADIUS) {
  try {
    const abs = safeJoin(workdir, filePath);
    const content = await fs.readFile(abs, 'utf8');
    const lines = content.split('\n');
    const target = Math.max(1, line || 1);
    const start = Math.max(1, target - radius);
    const end = Math.min(lines.length, target + radius);
    const slice = lines.slice(start - 1, end);
    return slice
      .map((l, i) => `${String(start + i).padStart(5)}: ${l}`)
      .join('\n');
  } catch (err) {
    return `(could not read ${filePath}: ${err.message})`;
  }
}

module.exports = { codeSliceAround };
