/**
 * HMAC signature verification middleware for GitHub webhooks.
 * @module middleware/auth
 */

const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Express middleware that verifies GitHub's `x-hub-signature-256` header.
 * Uses timing-safe comparison to prevent timing attacks (see ADR-003).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function verifyGitHubSignature(req, res, next) {
    const signature = req.headers['x-hub-signature-256'];
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!signature || !secret) {
        logger.warn('Missing signature or secret for webhook verification', {
            correlationId: req.correlationId
        });
        return res.status(401).send('Unauthorized : Missing signature or secret');
    }

    // HMAC must be computed against the exact raw bytes GitHub signed.
    // The Express JSON parser captures these into req.rawBody — see index.js.
    if (!req.rawBody) {
        logger.error('Raw body unavailable for HMAC verification', {
            correlationId: req.correlationId
        });
        return res.status(500).send('Server misconfigured: rawBody not captured');
    }

    const signatureHash = signature.split('=')[1];

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.rawBody);
    const computedHash = hmac.digest('hex');

    // Lengths must match before timingSafeEqual (it throws on mismatch).
    if (signatureHash.length !== computedHash.length) {
        logger.warn('Signature length mismatch', {
            correlationId: req.correlationId,
            sourceIP: req.ip
        });
        return res.status(401).send('Unauthorized : Invalid signature');
    }

    // Timing-safe comparison to prevent timing attacks (see ADR-003)
    const isValid = crypto.timingSafeEqual(
        Buffer.from(signatureHash, 'hex'),
        Buffer.from(computedHash, 'hex')
    );

    if (!isValid) {
        logger.warn('Invalid webhook signature', {
            received: signatureHash.substring(0, 10) + '...',
            sourceIP: req.ip,
            correlationId: req.correlationId
        });
        return res.status(401).send('Unauthorized : Invalid signature');
    }

    logger.debug('Webhook signature verified successfully', {
        sourceIP: req.ip,
        correlationId: req.correlationId
    });
    next();
}

module.exports = { verifyGitHubSignature };
