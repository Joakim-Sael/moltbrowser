/**
 * Playwright CLI Passthrough
 *
 * Delegates commands to the Playwright CLI. Tries multiple resolution
 * strategies in order:
 *
 * 1. playwright/lib/mcp/terminal/cli (Playwright 1.59+ internal CLI)
 * 2. playwright-cli binary (@playwright/cli package)
 * 3. npx playwright-cli (fallback)
 */

const { execFileSync } = require('child_process');
const { execSync } = require('child_process');

/**
 * Find the best available way to run playwright-cli commands.
 * Returns { cmd, prefixArgs } where the command is run as:
 *   execFileSync(cmd, [...prefixArgs, ...args])
 */
function resolvePlaywrightCli() {
  // Strategy 1: Playwright 1.59+ internal terminal CLI module
  try {
    const cliPath = require.resolve('playwright/lib/mcp/terminal/cli');
    return { cmd: process.execPath, prefixArgs: [cliPath] };
  } catch {}

  // Strategy 2: playwright-cli binary (from @playwright/cli)
  try {
    execFileSync('playwright-cli', ['--version'], { stdio: 'ignore', timeout: 5_000 });
    return { cmd: 'playwright-cli', prefixArgs: [] };
  } catch {}

  // Strategy 3: npx playwright-cli
  try {
    execSync('npx --no-install playwright-cli --version', { stdio: 'ignore', timeout: 10_000 });
    return { cmd: 'npx', prefixArgs: ['--no-install', 'playwright-cli'] };
  } catch {}

  return null;
}

// Cache the resolution
let _resolved = undefined;
function getPlaywrightCli() {
  if (_resolved === undefined)
    _resolved = resolvePlaywrightCli();
  return _resolved;
}

/**
 * Build env object for subprocess.
 */
function buildEnv(globalFlags) {
  return {
    ...process.env,
    ...(globalFlags?.session ? { PLAYWRIGHT_CLI_SESSION: globalFlags.session } : {}),
  };
}

/**
 * Run a command through playwright-cli and print output.
 * @param {string[]} args - command + args to pass
 * @param {object} globalFlags - parsed global flags
 * @returns {string} stdout
 */
function passthrough(args, globalFlags) {
  const cli = getPlaywrightCli();

  if (!cli) {
    throw new Error(
      'Playwright CLI not found. Install it with one of:\n' +
      '  npm install -g @playwright/cli@latest\n' +
      '  npm install playwright@next   (for built-in CLI)\n'
    );
  }

  try {
    const result = execFileSync(cli.cmd, [...cli.prefixArgs, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: buildEnv(globalFlags),
      timeout: 120_000,
    });
    const output = result.toString();
    if (output)
      console.log(output);
    return output;
  } catch (err) {
    // execFileSync throws on non-zero exit but still has stdout/stderr
    if (err.stderr) {
      const stderr = err.stderr.toString();
      if (stderr)
        process.stderr.write(stderr);
    }
    if (err.stdout) {
      const output = err.stdout.toString();
      if (output)
        console.log(output);
      return output;
    }
    throw err;
  }
}

/**
 * Run a passthrough command and capture the output (no print).
 * @param {string[]} args
 * @param {object} globalFlags
 * @returns {string} stdout
 */
function passthroughCapture(args, globalFlags) {
  const cli = getPlaywrightCli();
  if (!cli)
    throw new Error('Playwright CLI not found.');

  try {
    const result = execFileSync(cli.cmd, [...cli.prefixArgs, ...args], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: buildEnv(globalFlags),
      timeout: 120_000,
    });
    return result.toString();
  } catch (err) {
    if (err.stdout)
      return err.stdout.toString();
    throw err;
  }
}

module.exports = { passthrough, passthroughCapture };
