/**
 * Correlation ID middleware.
 *
 * Attaches `req.correlationId`, used for tracing a single request through
 * webhook → queue → worker → logs. Precedence:
 *   1. `x-request-id` header (caller-provided, e.g. an upstream LB)
 *   2. `x-github-delivery` header (GitHub's per-delivery UUID)
 *   3. Locally generated UUID
 *
 * The chosen ID is echoed back in the `x-request-id` response header.
 *
 * @module middleware/correlationId
 */

const { randomUUID } = require('crypto');

function correlationId(req, res, next) {
  const incoming = req.headers['x-request-id'] || req.headers['x-github-delivery'];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

  req.correlationId = id;
  res.setHeader('x-request-id', id);
  next();
}

module.exports = { correlationId };
