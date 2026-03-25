/**
 * Navigate Handler
 *
 * Wraps `open` and `goto` commands: delegates to playwright-cli for the
 * actual navigation, then performs a hub lookup and appends discovered
 * tools to the output.
 */

const { passthrough } = require('./playwright-passthrough.js');
const { lookupConfig } = require('moltbrowser-mcp-server/hub-client');
const { saveState, formatHubTools } = require('./hub-state.js');

/**
 * Extract domain from a URL string.
 * @param {string} url
 * @returns {string|null}
 */
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    // Try adding protocol
    try {
      return new URL('https://' + url).hostname;
    } catch {
      return null;
    }
  }
}

/**
 * Find the URL in the command args.
 * For `open`, URL is optional (first non-flag arg).
 * For `goto`, URL is required (first non-flag arg).
 *
 * @param {string} command
 * @param {string[]} args
 * @returns {string|null}
 */
function findUrl(command, args) {
  for (const arg of args) {
    if (!arg.startsWith('-'))
      return arg;
  }
  return null;
}

/**
 * Try to extract the final URL from playwright-cli output.
 * The output usually contains "Page URL: <url>".
 *
 * @param {string} output
 * @returns {string|null}
 */
function extractUrlFromOutput(output) {
  const match = output.match(/Page URL:\s*(\S+)/);
  return match ? match[1] : null;
}

/**
 * Handle open/goto with hub integration.
 *
 * @param {string} command - 'open' or 'goto'
 * @param {string[]} args - command arguments
 * @param {object} globalFlags
 */
async function handleNavigate(command, args, globalFlags) {
  // 1. Run the actual navigation via playwright-cli
  const fullArgs = [command, ...args];
  const output = passthrough(fullArgs, globalFlags);

  // 2. Determine the URL to look up
  const requestedUrl = findUrl(command, args);
  const finalUrl = extractUrlFromOutput(output) || requestedUrl;

  if (!finalUrl) {
    // open without URL — just opened a blank browser, no hub lookup needed
    return;
  }

  const domain = extractDomain(finalUrl);
  if (!domain)
    return;

  // 3. Hub lookup
  try {
    const result = await lookupConfig(domain, finalUrl);
    const configs = result.configs || [];

    // 4. Persist state
    const allTools = [];
    for (const config of configs) {
      for (const tool of (config.tools || [])) {
        allTools.push({
          ...tool,
          _configId: config._id || config.id,
          _configName: config.name,
        });
      }
    }

    saveState({
      url: finalUrl,
      domain,
      configs,
      tools: allTools,
      timestamp: Date.now(),
    });

    // 5. Print discovered tools
    console.log('');
    console.log(formatHubTools(configs));
  } catch (err) {
    // Hub unavailable — degrade gracefully
    process.stderr.write(`[moltbrowser] Hub lookup failed: ${err.message}\n`);
    saveState({ url: finalUrl, domain, configs: [], tools: [], timestamp: Date.now() });
  }
}

module.exports = { handleNavigate };
