/**
 * BullMQ Producer for Webhook Service
 * This module sets up a BullMQ producer to enqueue webhook processing jobs.
 * It connects to a Redis instance specified by environment variables.
 * @module queue/producer
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../utils/logger');

// Creating Redis connection

const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null
});

// Creating BullMQ Queue
const securitySentinelQueue = new Queue('security-analysis', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
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