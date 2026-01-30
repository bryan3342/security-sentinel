/**
 * WebHook Payload Validation Middleware
 * This middleware validates the payload of incoming webhook requests
 * to ensure they conform to expected formats and contain required fields.
 * @module middleware/validator
 */

const logger = require('../utils/logger');

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