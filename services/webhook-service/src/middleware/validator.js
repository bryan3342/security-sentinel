/**
 * Webhook payload validation middleware.
 * @module middleware/validator
 */

const logger = require('../utils/logger');

/**
 * Validate that a GitHub webhook payload contains the fields required for
 * security analysis. Unsupported event types receive a 200 (not 4xx) to
 * prevent GitHub from retrying (see ADR-002).
 *
 * Side effect: sets `req.githubEvent` to the validated event type.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function validatePayload(req, res, next) {
    const event = req.headers['x-github-event'];
    const payload = req.body;

    const validEvents = ['push', 'pull_request'];

    if (!validEvents.includes(event)) {
        logger.debug('Ignoring unsupported event type', { event });
        return res.status(200).json({ message: 'Event type ignored' });
    }

    if (event === 'push') {
        if (!payload.repository || !payload.after || !payload.commits) {
            logger.warn('Invalid push event payload', { payload });
            return res.status(200).json({ message: 'Invalid push payload' });
        }
    }

    if (event === 'pull_request') {
        if (!payload.pull_request || !payload.repository) {
            logger.warn("Invalid pull_request event payload", { payload });
            return res.status(200).json({ message: 'Invalid pull_request payload' });
        }
    }

    req.githubEvent = event;
    next();
}

module.exports = { validatePayload };
