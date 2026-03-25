/**
 * CLI Dispatcher
 *
 * Parses arguments, extracts global flags (-s, --no-hub, --hub-url, etc.),
 * identifies the command, and routes to the correct handler.
 *
 * Authentication is required for all commands except login, logout, whoami,
 * help, and install.
 */

const { passthrough } = require('./playwright-passthrough.js');
const { handleNavigate } = require('./navigate-handler.js');
const { handleHubList, handleHubExecute, handleHubInfo } = require('./hub-commands.js');
const {
  handleContributeCreate,
  handleContributeAddTool,
  handleContributeUpdateTool,
  handleContributeDeleteTool,
  handleContributeVote,
} = require('./contribute-commands.js');
const { handleInstall } = require('./install-command.js');
const { handleLogin, handleLogout, handleWhoami } = require('./login-command.js');
const { requireAuth } = require('./auth.js');

// Commands that trigger hub lookup after navigation
const NAVIGATE_COMMANDS = new Set(['open', 'goto']);

/**
 * @param {string[]} argv - process.argv.slice(2)
 */
async function dispatch(argv) {
  // Extract global flags before parsing
  const globalFlags = extractGlobalFlags(argv);
  const remaining = globalFlags.remaining;

  // Apply hub env overrides
  if (globalFlags.hubUrl)
    process.env.HUB_URL = globalFlags.hubUrl;

  // Find the command (first non-flag arg)
  const command = remaining[0] || 'help';
  const commandArgs = remaining.slice(1);

  // Auth gate — require login for all commands except public ones
  requireAuth(command, globalFlags);

  // Route to handler
  if (command === 'login') {
    return handleLogin(commandArgs, globalFlags);
  }

  if (command === 'logout') {
    return handleLogout();
  }

  if (command === 'whoami') {
    return handleWhoami(commandArgs, globalFlags);
  }

  if (command === 'install') {
    return handleInstall(commandArgs, globalFlags);
  }

  if (command === 'help' || remaining.includes('--help') || remaining.includes('-h')) {
    return printHelp();
  }

  if (NAVIGATE_COMMANDS.has(command) && !globalFlags.noHub) {
    return handleNavigate(command, commandArgs, globalFlags);
  }

  if (command === 'hub-list') {
    return handleHubList(commandArgs, globalFlags);
  }

  if (command === 'hub-execute') {
    return handleHubExecute(commandArgs, globalFlags);
  }

  if (command === 'hub-info') {
    return handleHubInfo(commandArgs, globalFlags);
  }

  if (command === 'contribute-create') {
    return handleContributeCreate(commandArgs, globalFlags);
  }

  if (command === 'contribute-add-tool') {
    return handleContributeAddTool(commandArgs, globalFlags);
  }

  if (command === 'contribute-update-tool') {
    return handleContributeUpdateTool(commandArgs, globalFlags);
  }

  if (command === 'contribute-delete-tool') {
    return handleContributeDeleteTool(commandArgs, globalFlags);
  }

  if (command === 'contribute-vote') {
    return handleContributeVote(commandArgs, globalFlags);
  }

  // Everything else → passthrough to playwright-cli
  return passthrough(remaining, globalFlags);
}

/**
 * Extract our global flags from argv, return them separately from the rest.
 */
function extractGlobalFlags(argv) {
  const flags = {
    session: null,
    noHub: false,
    hubUrl: null,
    hubApiKey: null,
    remaining: [],
  };

  for (const arg of argv) {
    if (arg === '--no-hub') {
      flags.noHub = true;
    } else if (arg.startsWith('--hub-url=')) {
      flags.hubUrl = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--hub-api-key=')) {
      flags.hubApiKey = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('-s=')) {
      flags.session = arg.slice(3);
      flags.remaining.push(arg); // also pass to playwright-cli
    } else {
      flags.remaining.push(arg);
    }
  }

  // Also check env for session
  if (!flags.session && process.env.MOLTBROWSER_SESSION) {
    flags.session = process.env.MOLTBROWSER_SESSION;
  }

  return flags;
}

function printHelp() {
  console.log(`MoltBrowser CLI — Browser automation with WebMCP Hub integration

Usage: moltbrowser [options] <command> [args]

Auth:
  login                Log in to WebMCP Hub (required before first use)
  login --github       Log in using your GitHub account (best for agents)
  login --api-key=<k>  Log in with a hub API key directly
  logout               Clear stored credentials
  whoami               Show current auth status

Global options:
  -s=<name>            Use named browser session
  --no-hub             Disable hub integration (plain playwright-cli)
  --hub-url=<url>      Override hub URL
  --hub-api-key=<key>  API key override (also HUB_API_KEY env)

Navigation (with hub tool discovery):
  open [url]           Open browser, optionally navigate and discover hub tools
  goto <url>           Navigate to URL and discover hub tools

Hub tools:
  hub-list             List discovered hub tools for current page
  hub-execute <tool>   Execute a hub tool (--arg=value for arguments)
  hub-info <tool>      Show detailed info about a hub tool

Contribute:
  contribute-create      Create a new hub config
  contribute-add-tool    Add a tool to a hub config
  contribute-update-tool Update a hub tool
  contribute-delete-tool Delete a hub tool
  contribute-vote        Vote on a hub tool

Setup:
  install --skills     Install skill files for coding agents

All other commands are passed through to playwright-cli:
  click, type, fill, press, snapshot, screenshot, close, ...
  Run 'moltbrowser --no-hub --help' for full playwright-cli help.`);
}

module.exports = { dispatch };
