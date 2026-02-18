/**
 * Webhook route handler — the "glue" layer that wires authentication,
 * validation, and the BullMQ producer into an HTTP endpoint.
 * @module routes/webhook
 */

const express = require('express');
const router = express.Router();
const { enqueueSecurityAnalysisJob } = require('../queue/producer');
const { verifyGitHubSignature } = require('../middleware/auth');
const { validatePayload } = require('../middleware/validator');
const logger = require('../utils/logger');

/**
 * Extract the deduplicated set of files touched by a webhook event.
 * @param {Object} payload - The raw GitHub webhook payload
 * @param {string} event - GitHub event type (`push` | `pull_request`)
 * @returns {string[]} Unique file paths changed in this event
 */
function extractChangedFiles(payload, event) {
    if (event === 'push') {
        // Collect all changed files from commits
        const files = new Set();
        payload.commits.forEach(commit => {
            commit.added?.forEach(file => files.add(file));
            commit.modified?.forEach(file => files.add(file));
            commit.removed?.forEach(file => files.add(file));
        });
        return Array.from(files);
    }
    
    if (event === 'pull_request') {
        // For pull requests, we will fetch later using Github API
        return [];
    }

    return [];
 }


/**
 * Determine job priority based on branch criticality and file sensitivity.
 * Lower number = higher priority (1 = highest, 10 = lowest).
 * @param {Object} payload - The raw GitHub webhook payload
 * @param {string} event - GitHub event type
 * @param {string[]} changedFiles - Files changed in this event
 * @returns {number} Priority value between 1 and 10
 */
function determineJobPriority(payload, event, changedFiles) {
    let priority = 5;

    if (event === 'push') {
        const branch = payload.ref.replace('refs/heads/', '');
        if (["main", "master", "production"].includes(branch)) {
            priority = 2; // Highest priority for critical branches
        }
    }

    const criticalPatterns = [
    /auth/i,
    /security/i,
    /password/i,
    /secret/i,
    /\.env/,
  ];

  const hasCriticalChanges = changedFiles.some(file =>
    criticalPatterns.some(pattern => pattern.test(file))
  );

  if (hasCriticalChanges) {
    priority = Math.max(1, priority - 2); // Boost by 2 levels
  }

  return priority;
}


/**
 * POST /webhook — Receives GitHub webhook events, extracts metadata,
 * and enqueues a security analysis job via BullMQ.
 */

router.post(
    '/', 
    verifyGitHubSignature, 
    validatePayload,
    async (req, res) => {
        try {
            const event = req.githubEvent;
            const payload = req.body;

            const changedFiles = extractChangedFiles(payload, event);
            const repository = payload.repository.full_name;
            const commitSha = event === 'push' 
            ? payload.after 
            : payload.pull_request.head.sha;

            const jobData = {
                eventType : event,
                repository,
                commitSha,
                changedFiles,
                branch: event === 'push' 
                ? payload.ref.replace('refs/heads/', '')
                : payload.pull_request.head.ref,
                author: payload.sender.login,
                timestamp: new Date().toISOString(),
                priority: determineJobPriority(payload, event, changedFiles),
                pullRequestUrl: payload.pull_request ? payload.pull_request.html_url : null
            };

            const job = await enqueueSecurityAnalysisJob(jobData);

            res.status(200).json({
                message: 'Webhook received and job enqueued',
                jobId: job.id,
                priority: jobData.priority
            });

            logger.info('Webhook processed successfully', {
                event,
                repository,
                jobId: job.id,
                priority: jobData.priority
             });
        } catch (error) {
            logger.error('Error processing webhook', { 
                error: error.message,
                stack: error.stack
             });

             // Return 200 to prevent GitHub from retrying (see ADR-002)
             res.status(200).json({
                message: 'Webhook received but failed to process',
                error: error.message
             });
        }
    }
);

/** GET /webhook/health — Returns service status and queue metrics. */
router.get('/health', async (req, res) => {
   try {
        const { getQueueMetrics } = require('../queue/producer');
        const stats = await getQueueMetrics();

        res.json({
            status: 'healthy',
            service: 'Webhook Service',
            uptime: process.uptime(),
            queue: stats
        });
   } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message        
        });
   }    
});

module.exports = router;