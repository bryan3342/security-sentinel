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
        logger.warn('Missing signature or secret for webhook verification');
        return res.status(401).send('Unauthorized : Missing signature or secret');
    }

    const signatureHash = signature.split('=')[1];

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(req.body));
    const computedHash = hmac.digest('hex');

    // Timing-safe comparison to prevent timing attacks (see ADR-003)
    const isValid = crypto.timingSafeEqual(
        Buffer.from(signatureHash, 'hex'),
        Buffer.from(computedHash, 'hex')
    );

    if (!isValid) {
        logger.warn('Invalid webhook signature', {
            received: signatureHash.substring(0, 10) + '...',
            sourceIP: req.ip
        });
        return res.status(401).send('Unauthorized : Invalid signature');
    }

    logger.debug('Webhook signature verified successfully', { sourceIP: req.ip });
    next();
}

module.exports = { verifyGitHubSignature };
