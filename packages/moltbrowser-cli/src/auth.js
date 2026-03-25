/**
 * Auth Module
 *
 * Manages API key storage in ~/.moltbrowser/auth.json.
 *
 * Resolution order:
 *   1. --hub-api-key= flag (per-command)
 *   2. HUB_API_KEY env var
 *   3. ~/.moltbrowser/auth.json (persistent, from `moltbrowser login`)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const AUTH_DIR = path.join(os.homedir(), '.moltbrowser');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');

// Commands that don't require authentication
const PUBLIC_COMMANDS = new Set([
  'login', 'logout', 'help', 'install', 'whoami',
]);

/**
 * Load stored auth from ~/.moltbrowser/auth.json.
 * @returns {{ apiKey?: string, username?: string, loginAt?: string } | null}
 */
function loadAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save auth to ~/.moltbrowser/auth.json.
 * @param {{ apiKey: string, username?: string, loginAt: string }} auth
 */
function saveAuth(auth) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

/**
 * Remove stored auth.
 */
function clearAuth() {
  try {
    fs.unlinkSync(AUTH_FILE);
  } catch {}
}

/**
 * Resolve the API key from all sources.
 * @param {object} globalFlags - parsed global flags
 * @returns {string|null}
 */
function resolveApiKey(globalFlags) {
  // 1. Explicit flag
  if (globalFlags?.hubApiKey)
    return globalFlags.hubApiKey;

  // 2. Env var
  if (process.env.HUB_API_KEY)
    return process.env.HUB_API_KEY;

  // 3. Stored auth
  const auth = loadAuth();
  if (auth?.apiKey)
    return auth.apiKey;

  return null;
}

/**
 * Ensure the user is authenticated. If not, print an error and exit.
 * Call this before any command that requires auth.
 *
 * @param {string} command
 * @param {object} globalFlags
 */
function requireAuth(command, globalFlags) {
  if (PUBLIC_COMMANDS.has(command))
    return;

  // Also allow --help on any command
  if (globalFlags?.remaining?.includes('--help') || globalFlags?.remaining?.includes('-h'))
    return;

  const apiKey = resolveApiKey(globalFlags);
  if (!apiKey) {
    console.error('Authentication required. Run `moltbrowser login` to get started.');
    console.error('');
    console.error('Get a free API key at https://www.webmcp-hub.com');
    console.error('');
    console.error('Or set HUB_API_KEY environment variable for CI/automation.');
    process.exit(1);
  }

  // Set it in env so hub-client.js picks it up
  process.env.HUB_API_KEY = apiKey;

  // Show auth status so the user knows who they're running as
  const auth = loadAuth();
  if (auth?.username) {
    process.stderr.write(`[moltbrowser] Authenticated as ${auth.username}\n`);
  }
}

/**
 * Check if the user is currently authenticated.
 * @param {object} globalFlags
 * @returns {boolean}
 */
function isAuthenticated(globalFlags) {
  return !!resolveApiKey(globalFlags);
}

module.exports = {
  loadAuth,
  saveAuth,
  clearAuth,
  resolveApiKey,
  requireAuth,
  isAuthenticated,
  PUBLIC_COMMANDS,
  AUTH_FILE,
};
