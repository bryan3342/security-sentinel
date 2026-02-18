/**
 * BullMQ Producer for Webhook Service
 * This module sets up a BullMQ producer to enqueue webhook processing jobs.
 * It connects to a Redis instance specified by environment variables.
 * @module queue/producer
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../utils/logger');

const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    // Required by BullMQ — prevents ioredis from throwing on long-running commands
    maxRetriesPerRequest: null
});

const securitySentinelQueue = new Queue('security-analysis', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 }
    },

});


/**
 * Enqueue a job to the security analysis queue
 * @param {Object} jobData - The job payload
 * @param {string} jobData.repository - Full repo name (owner/repo)
 * @param {string} jobData.commitSha - Git commit SHA
 * @param {Array} jobData.changedFiles - List of modified files
 * @param {number} jobData.priority - Job priority (1-10, lower = higher priority)
 * @returns {Promise<Object>} Job instance
 */

async function enqueueSecurityAnalysisJob(jobData) {
    try {
        const job = await securitySentinelQueue.add(
            'analyze-commit',
            jobData,
            {
                priority: jobData.priority || 5,
                // Deduplication: same repo + commit won't be enqueued twice
                jobId: `${jobData.repository}-${jobData.commitSha}`
            }
        );

        logger.info('Job enqueued successfully', {
            jobId: job.id,
            repository: jobData.repository,
            commitSha: jobData.commitSha.substring(0, 7)
        });

        return job;
    } catch (error) {
        logger.error('Failed to Enqueue Job', { 
            error: error.message,
            repository: jobData.repository
         });
        throw error;
    }
}


/**
 * Fetch current queue health metrics.
 * @returns {Promise<{waiting: number, active: number, completed: number, failed: number}>}
 */
async function getQueueMetrics() {
    const [waiting, active, completed, failed] = await Promise.all([
        securitySentinelQueue.getWaitingCount(),
        securitySentinelQueue.getActiveCount(),
        securitySentinelQueue.getCompletedCount(),
        securitySentinelQueue.getFailedCount()
    ]);
    
    return {
        waiting,
        active,
        completed,
        failed
    };
}

module.exports = {
    enqueueSecurityAnalysisJob,
    getQueueMetrics,
    queue: securitySentinelQueue
};