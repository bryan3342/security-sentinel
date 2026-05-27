/**
 * GitHub client + auth.
 *
 * Two modes:
 *   - GitHub App: `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` (PEM) +
 *     `GITHUB_APP_INSTALLATION_ID`. Mints an installation access token per
 *     repo on demand.
 *   - PAT (dev): `GITHUB_TOKEN`. Used directly.
 *
 * App auth is preferred for production (least-privilege, per-install
 * scoping, automatic 1h token rotation). PAT is supported for fast
 * bootstrapping on personal repos.
 *
 * @module github/client
 */

const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');
const logger = require('../utils/logger');

function hasAppCreds() {
  return Boolean(
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_APP_PRIVATE_KEY &&
    process.env.GITHUB_APP_INSTALLATION_ID
  );
}

function hasPat() {
  return Boolean(process.env.GITHUB_TOKEN);
}

/**
 * Build an Octokit client. For App auth, this returns a per-installation
 * client; the same client can be used across repos that the installation
 * has access to.
 */
function getOctokit() {
  if (hasAppCreds()) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: Number(process.env.GITHUB_APP_ID),
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
        installationId: Number(process.env.GITHUB_APP_INSTALLATION_ID)
      }
    });
  }
  if (hasPat()) {
    return new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  throw new Error('No GitHub credentials configured (set GITHUB_APP_* or GITHUB_TOKEN)');
}

/**
 * Get a token suitable for `git push`. With a PAT, that's the PAT. With
 * App auth, we mint an installation token via the app-auth strategy.
 */
async function getPushToken() {
  if (hasPat()) {
    return process.env.GITHUB_TOKEN;
  }
  if (hasAppCreds()) {
    const auth = createAppAuth({
      appId: Number(process.env.GITHUB_APP_ID),
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
      installationId: Number(process.env.GITHUB_APP_INSTALLATION_ID)
    });
    const { token } = await auth({ type: 'installation' });
    return token;
  }
  throw new Error('No GitHub credentials configured for push');
}

function isConfigured() {
  return hasAppCreds() || hasPat();
}

function authMode() {
  if (hasAppCreds()) return 'github-app';
  if (hasPat()) return 'pat';
  return 'none';
}

module.exports = { getOctokit, getPushToken, isConfigured, authMode };
