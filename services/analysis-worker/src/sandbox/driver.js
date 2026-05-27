/**
 * Docker sandbox driver.
 *
 * Runs a single command inside a one-shot container with a hardened
 * policy:
 *   - NetworkMode: 'none' (no outbound network)
 *   - CapDrop: ['ALL']
 *   - SecurityOpt: ['no-new-privileges']
 *   - Runs as the `sandbox` user defined in sandbox/Dockerfile
 *   - Memory + CPU caps
 *   - Wall-clock timeout (kills + records on overrun)
 *   - One container per call; teardown in finally regardless of outcome
 *
 * The workdir is bind-mounted at `/workspace` (read-write, so tests can
 * touch the scratch copy the caller provides). Callers MUST pass a
 * scratch directory they own — never the original analysis workdir.
 *
 * @module sandbox/driver
 */

const Docker = require('dockerode');
const logger = require('../utils/logger');

const docker = new Docker(); // honors DOCKER_HOST / default socket

const DEFAULT_IMAGE = process.env.SANDBOX_IMAGE || 'sentinel-sandbox:latest';
const DEFAULT_MEM_BYTES = Number(process.env.SANDBOX_MEMORY_BYTES) || 1024 * 1024 * 1024; // 1 GiB
const DEFAULT_CPUS = Number(process.env.SANDBOX_CPUS) || 1;
const DEFAULT_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 120_000;
const OUTPUT_TAIL_BYTES = 16 * 1024; // capture last 16 KB of each stream

function tailBytes(buf) {
  const txt = buf.toString('utf8');
  if (txt.length <= OUTPUT_TAIL_BYTES) return txt;
  return '... (truncated) ...\n' + txt.slice(-OUTPUT_TAIL_BYTES);
}

/**
 * Run a command inside a fresh sandbox container.
 *
 * @param {object} params
 * @param {string} params.scratchDir - Host directory bind-mounted at /workspace.
 * @param {string[]} params.cmd - Argv. The first element is the binary.
 * @param {number} [params.timeoutMs]
 * @param {string} [params.image]
 * @param {object} [params.ctx]
 * @returns {Promise<{exitCode, stdout, stderr, timedOut, durationMs}>}
 */
async function runInSandbox({
  scratchDir,
  cmd,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  image = DEFAULT_IMAGE,
  ctx = {}
}) {
  if (!Array.isArray(cmd) || cmd.length === 0) {
    throw new Error('cmd must be a non-empty array');
  }

  const started = Date.now();

  const container = await docker.createContainer({
    Image: image,
    Cmd: cmd,
    WorkingDir: '/workspace',
    User: 'sandbox',
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    NetworkDisabled: true,
    HostConfig: {
      NetworkMode: 'none',
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Memory: DEFAULT_MEM_BYTES,
      MemorySwap: DEFAULT_MEM_BYTES,
      PidsLimit: 256,
      NanoCpus: Math.floor(DEFAULT_CPUS * 1e9),
      AutoRemove: false,
      Binds: [`${scratchDir}:/workspace:rw`],
      ReadonlyRootfs: false, // toolchains write to /tmp; jail via tmpfs below
      Tmpfs: { '/tmp': 'rw,size=128m,mode=1777' }
    }
  });

  logger.info('Sandbox container created', {
    ...ctx,
    containerId: container.id.slice(0, 12),
    cmd: cmd.join(' '),
    timeoutMs
  });

  let timedOut = false;
  let timer;
  try {
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    const stdoutBufs = [];
    const stderrBufs = [];
    container.modem.demuxStream(
      stream,
      { write: (b) => stdoutBufs.push(b) },
      { write: (b) => stderrBufs.push(b) }
    );

    await container.start();

    timer = setTimeout(async () => {
      timedOut = true;
      try {
        await container.stop({ t: 0 });
      } catch (err) {
        logger.warn('Failed to stop sandbox on timeout', { error: err.message });
      }
    }, timeoutMs);

    const result = await container.wait();
    clearTimeout(timer);

    const exitCode = timedOut ? 124 : result.StatusCode;
    return {
      exitCode,
      stdout: tailBytes(Buffer.concat(stdoutBufs)),
      stderr: tailBytes(Buffer.concat(stderrBufs)),
      timedOut,
      durationMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
    try {
      await container.remove({ force: true });
    } catch (err) {
      logger.warn('Failed to remove sandbox container', {
        error: err.message,
        containerId: container.id.slice(0, 12)
      });
    }
  }
}

module.exports = { runInSandbox, DEFAULT_IMAGE };
