/**
 * Workdir-scoped path validation. Resolves a requested path against the
 * job's working directory and ensures the result stays inside it — guards
 * against `../` traversal or absolute paths from the model.
 * @module agents/tools/paths
 */

const path = require('path');

function safeJoin(workdir, requested) {
  if (typeof requested !== 'string' || requested.length === 0) {
    throw new Error('Path must be a non-empty string');
  }
  const resolved = path.resolve(workdir, requested);
  const workdirResolved = path.resolve(workdir) + path.sep;
  if (resolved !== path.resolve(workdir) && !resolved.startsWith(workdirResolved)) {
    throw new Error(`Path escapes workdir: ${requested}`);
  }
  return resolved;
}

module.exports = { safeJoin };
