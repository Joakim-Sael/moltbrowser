/**
 * Login / Logout / Whoami Commands
 *
 * Three login flows:
 *   `moltbrowser login --github`   — use existing GitHub token (best for agents)
 *   `moltbrowser login --api-key=` — paste a hub API key directly (CI/manual)
 *   `moltbrowser login`            — interactive prompt
 */

const { execFileSync } = require('child_process');
const readline = require('readline');
const { saveAuth, clearAuth, loadAuth, resolveApiKey } = require('./auth.js');

const HUB_BASE = process.env.HUB_URL || 'https://www.webmcp-hub.com';

/**
 * Handle `moltbrowser login`.
 */
async function handleLogin(args) {
  const hasGithub = args.includes('--github');
  const flagKey = args.find(a => a.startsWith('--api-key='));

  // Flow 1: --github — use existing gh CLI token
  if (hasGithub) {
    return await loginWithGitHub();
  }

  // Flow 2: --api-key= — direct key
  if (flagKey) {
    const apiKey = flagKey.split('=').slice(1).join('=');
    return await verifyAndSave(apiKey);
  }

  // Flow 3: Interactive — offer choices
  return await loginInteractive();
}

/**
 * GitHub token login flow.
 *
 * Uses `gh auth token` to get the user's existing GitHub token,
 * then exchanges it for a hub API key via POST /api/auth/github.
 */
async function loginWithGitHub() {
  // Step 1: Get GitHub token from gh CLI
  let ghToken;
  try {
    ghToken = execFileSync('gh', ['auth', 'token'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    }).toString().trim();
  } catch {
    console.error('Could not get GitHub token. Make sure the GitHub CLI is installed and authenticated:');
    console.error('  brew install gh');
    console.error('  gh auth login');
    process.exit(1);
  }

  if (!ghToken) {
    console.error('GitHub CLI returned an empty token. Run `gh auth login` first.');
    process.exit(1);
  }

  console.log('Authenticating with WebMCP Hub via GitHub...');

  // Step 2: Exchange GitHub token for hub API key via POST /api/auth/exchange-token
  try {
    const res = await fetch(`${HUB_BASE}/api/auth/exchange-token`, {
      method: 'POST',
      headers: { 'Authorization': `GitHub ${ghToken}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 404) {
        console.error('GitHub login is not supported by this hub.');
        console.error('Use `moltbrowser login --api-key=<key>` instead.');
        console.error('Get a free API key at: ' + HUB_BASE);
        process.exit(1);
      }
      console.error(`GitHub auth failed: ${body.error || body.message || res.statusText}`);
      process.exit(1);
    }

    const data = await res.json();
    const apiKey = data.apiKey;
    const username = data.login;

    if (!apiKey) {
      console.error('Hub did not return an API key.');
      process.exit(1);
    }

    saveAuth({
      apiKey,
      username: username || null,
      method: 'github',
      loginAt: new Date().toISOString(),
    });

    console.log(`Logged in as ${username || 'unknown'} via GitHub.`);
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ENOTFOUND') {
      console.error('Hub unreachable. Check your internet connection.');
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Interactive login — presents options to the user.
 */
async function loginInteractive() {
  console.log('MoltBrowser Login');
  console.log('');

  // Check if gh is available
  let hasGh = false;
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore', timeout: 5_000 });
    hasGh = true;
  } catch {}

  if (hasGh) {
    console.log('Options:');
    console.log('  1. Login with GitHub (recommended)');
    console.log('  2. Paste an API key');
    console.log('');

    const choice = await prompt('Choice [1]: ');
    if (!choice || choice.trim() === '1') {
      return await loginWithGitHub();
    }
  }

  console.log('Get your free API key at: ' + HUB_BASE);
  console.log('');

  const apiKey = await prompt('Paste your API key: ');
  if (!apiKey || !apiKey.trim()) {
    console.error('No API key provided.');
    process.exit(1);
  }

  return await verifyAndSave(apiKey.trim());
}

/**
 * Verify a hub API key and save if valid.
 */
async function verifyAndSave(apiKey) {
  process.env.HUB_API_KEY = apiKey;

  const hubClient = require('moltbrowser-mcp-server/hub-client');

  console.log('Verifying API key...');
  const result = await hubClient.verifyApiKey();

  if (result.unreachable) {
    console.log('Warning: Hub unreachable. Saving key anyway — it will be verified on next use.');
    saveAuth({ apiKey, method: 'api-key', loginAt: new Date().toISOString() });
    console.log('Logged in (unverified). Key saved.');
    return;
  }

  if (!result.valid) {
    console.error(`Invalid API key: ${result.error || 'unknown error'}`);
    console.error('Check your key at ' + HUB_BASE);
    process.exit(1);
  }

  saveAuth({
    apiKey,
    username: result.username || null,
    method: 'api-key',
    loginAt: new Date().toISOString(),
  });

  console.log(`Logged in as ${result.username || 'unknown'}.`);
}

/**
 * Handle `moltbrowser logout`.
 */
function handleLogout() {
  clearAuth();
  console.log('Logged out. Stored credentials removed.');
}

/**
 * Handle `moltbrowser whoami`.
 */
async function handleWhoami(_args, globalFlags) {
  const apiKey = resolveApiKey(globalFlags);

  if (!apiKey) {
    console.log('Not logged in.');
    console.log('Run `moltbrowser login` to authenticate.');
    return;
  }

  const auth = loadAuth();
  const source = globalFlags?.hubApiKey
    ? 'flag (--hub-api-key)'
    : process.env.HUB_API_KEY && (!auth || process.env.HUB_API_KEY !== auth.apiKey)
      ? 'environment (HUB_API_KEY)'
      : 'stored (~/.moltbrowser/auth.json)';

  process.env.HUB_API_KEY = apiKey;
  const hubClient = require('moltbrowser-mcp-server/hub-client');
  const result = await hubClient.verifyApiKey();

  if (result.unreachable) {
    console.log(`Authenticated via ${source}`);
    console.log('Hub unreachable — could not verify.');
    return;
  }

  if (!result.valid) {
    console.log(`Key source: ${source}`);
    console.log(`Status: invalid (${result.error || 'unknown error'})`);
    console.log('Run `moltbrowser login` to re-authenticate.');
    return;
  }

  console.log(`Logged in as: ${result.username || 'unknown'}`);
  console.log(`Key source: ${source}`);
  if (auth?.method)
    console.log(`Auth method: ${auth.method}`);
  if (auth?.loginAt)
    console.log(`Logged in at: ${auth.loginAt}`);
}

/**
 * Prompt for user input.
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

module.exports = { handleLogin, handleLogout, handleWhoami };
