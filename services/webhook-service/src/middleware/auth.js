
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Authentication Middleware
 * This middleware verifies the HMAC signature of incoming webhook requests.
 * It ensures that the request is from a trusted source by comparing the
 * computed HMAC with the signature provided in the request headers.
 * @module middleware/auth
 */

function verifyGitHubSignature(req, res, next) {
    const signature = req.headers['x-hub-signature-256'];
    const secret = process.env.GITHUB_WEBHOOK_SECRET;   

    if (!signature || !secret) {
        logger.warn('Missing signature or secret for webhook verification');
        return res.status(401).send('Unauthorized : Missing signature or secret');
    }

    /* Github sends signature as "sha256=..." */
    const signatureHash = signature.split('=')[1];

    /* Recompute signature using our secret */
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(req.body));
    const computedHash = hmac.digest('hex');

    // Timing safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
        Buffer.from(signatureHash, 'hex'),
        Buffer.from(computedHash, 'hex')
    );

    if (!isValid) {
        logger.warn('Invalid webhook signature', {
            received : signatureHash.substring(0, 10) + '...',
            sourceIP : req.ip
        });
        return res.status(401).send('Unauthorized : Invalid signature');
    }

    logger.debug('Webhook signature verified successfully', { sourceIP : req.ip });
    next();
}

module.exports = {verifyGitHubSignature}