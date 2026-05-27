/**
 * Webhook router for Webhook Service
 * This module defines the Express router for handling incoming webhook events.
 * It processes GitHub webhook payloads and enqueues jobs for security analysis.
 * Handles authentication and validation of incoming requests.
 * Route handler (handles business logic)
 * Responds to incoming webhook events from GitHub, processes the payload, and enqueues jobs for security analysis.
 * @module routes/webhook*/
 
 /* All of the modules we need to import */

 const express = require('express');
 const router = express.Router();
 const { enqueueSecurityAnalysisJob }= require('../queue/producer');
 const { verifyGitHubSignature } = require('../middleware/auth');
 const { validatePayload } = require('../middleware/validator');
 const logger = require('../utils/logger');

 /** Extract changed files from webhook payload 
 */

 function extractChangedFiles(payload, event ) {
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


 /* Determining job priority based on context of the event */

 function determineJobPriority(payload, event, changedFiles) {
    let priority = 5; // Default priority

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


/** POST webhook
 * Main Webhook Endpoint
 * This endpoint receives GitHub webhook events, verifies their authenticity, validates the payload, and enqueues jobs for security analysis.
 * It handles both push and pull request events, extracting relevant information and determining job priority based on the context of the changes.
 */

router.post(
    '/',
    verifyGitHubSignature,
    validatePayload,
    async (req, res) => {
        try {
            const event = req.githubEvent;
            const payload = req.body;

            // Extracting metadata
            const changedFiles = extractChangedFiles(payload, event);
            const repository = payload.repository.full_name;
            const commitSha = event === 'push' 
            ? payload.after 
            : payload.pull_request.head.sha;

            // Building job data
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
                correlationId: req.correlationId,
                /* Addtional context can be added here */
                pullRequestUrl: payload.pull_request ? payload.pull_request.html_url : null
            };

            // Enqueueing job
            const job = await enqueueSecurityAnalysisJob(jobData);

            // Respond immediately to GitHub
            res.status(200).json({
                message: 'Webhook received and job enqueued',
                jobId: job.id,
                priority: jobData.priority,
                correlationId: req.correlationId
            });

            logger.info('Webhook processed successfully', {
                event,
                repository,
                jobId: job.id,
                priority: jobData.priority,
                correlationId: req.correlationId
             });
        } catch (error) {
            logger.error('Error processing webhook', {
                error: error.message,
                stack: error.stack,
                correlationId: req.correlationId
             });

             // Still return 200 to Github to avoid retries
             // Logged error for investigation
             res.status(200).json({
                message: 'Webhook received but failed to process',
                error: error.message,
                correlationId: req.correlationId
             });
        }
    }
);

// GET
// Health Check Endpoint

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