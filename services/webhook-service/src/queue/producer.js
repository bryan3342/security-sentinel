/**
 * BullMQ Producer for Webhook Service
 * This module sets up a BullMQ producer to enqueue webhook processing jobs.
 * It connects to a Redis instance specified by environment variables.
 * @module queue/producer
 */

// Using BullMQ for job queueing
const { Queue } = require('bullmq');
const Redis = require('ioredis');
// Constantly called this for using our winston logger
const logger = require('../utils/logger');

// Creating Redis connection
// We use Redis for BullMQ backend, BullMQ stores all job data
// in Redis. Redis is an in-memory database that's extremely fast,
// perfect for job queues.
const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null
});

// Creating BullMQ Queue
const securitySentinelQueue = new Queue('security-analysis', {
    connection,
    // Settings applied to all jobs added to this queue
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            // Each retry will wait longer (exponential backoff)
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: {
            count : 100 // Keep last 100 completed jobs
        },
        removeOnFail: {
            count : 100 // Keep last 100 failed jobs
        }
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
                // 1 - Highest, 10 - Lowest, default is 5
                priority: jobData.priority || 5,
                // Custom job ID to prevent duplicates
                // Ex: Creates jobId like "owner/repo-commitSha"
                jobId: `${jobData.repository}-${jobData.commitSha}`
            }
        );

        logger.info('Job Enqueued Successfully', {
            // Winston logs job details are JSON data
            // Needed for filtering and searching logs
            jobId: job.id,
            repository: jobData.repository,
            // Shorten commit SHA for readability
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


/* Getting Queue Health Metrics */

async function getQueueMetrics() {
    // Assigns multiple awaited promises to variables
    // Result is array of their individual results, in order
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