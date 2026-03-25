/**
 * Hub State Manager
 *
 * Persists discovered hub tools between CLI invocations.
 * State is stored in .moltbrowser/hub-state.json in the working directory.
 */

const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(process.cwd(), '.moltbrowser');
const STATE_FILE = path.join(STATE_DIR, 'hub-state.json');

/**
 * Load the current hub state.
 * @returns {{ url: string|null, domain: string|null, configs: object[], tools: object[], timestamp: number|null }}
 */
function loadState() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    return data;
  } catch {
    return { url: null, domain: null, configs: [], tools: [], timestamp: null };
  }
}

/**
 * Save hub state after a navigation + hub lookup.
 * @param {object} state
 */
function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Build a flat tool map from hub configs for quick lookup.
 * @param {object[]} configs
 * @returns {Map<string, { tool: object, config: object }>}
 */
function buildToolMap(configs) {
  const map = new Map();
  for (const config of configs) {
    for (const tool of (config.tools || [])) {
      map.set(tool.name, { tool, config });
    }
  }
  return map;
}

/**
 * Format discovered tools for CLI output.
 * @param {object[]} configs
 * @returns {string}
 */
function formatHubTools(configs) {
  const allTools = [];
  for (const config of configs) {
    for (const tool of (config.tools || [])) {
      allTools.push(tool);
    }
  }

  if (allTools.length === 0) {
    return '### Hub Tools\nNo hub tools found for this page. You can contribute tools with `moltbrowser contribute-create`.';
  }

  const lines = [`### Hub Tools (${allTools.length} available)`];
  for (const tool of allTools) {
    const args = (tool.inputSchema?.properties)
      ? Object.keys(tool.inputSchema.properties).join(', ')
      : '';
    lines.push(`- **${tool.name}**${args ? ` (${args})` : ''}: ${tool.description || ''}`);
  }
  lines.push('');
  lines.push('Use `moltbrowser hub-execute <tool> --arg=value` to run a hub tool.');
  return lines.join('\n');
}

module.exports = { loadState, saveState, buildToolMap, formatHubTools };
