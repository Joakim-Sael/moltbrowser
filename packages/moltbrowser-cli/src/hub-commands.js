/**
 * Hub Commands
 *
 * hub-list     — Show discovered hub tools for the current page
 * hub-execute  — Execute a hub tool by name
 * hub-info     — Show detailed info about a hub tool
 */

const minimist = require('minimist');
const { passthroughCapture } = require('./playwright-passthrough.js');
const { translate } = require('moltbrowser-mcp-server/execution-translator');
const { loadState, buildToolMap, formatHubTools } = require('./hub-state.js');

/**
 * hub-list: Show all discovered hub tools.
 */
function handleHubList(_args, _globalFlags) {
  const state = loadState();

  if (!state.url) {
    console.log('No page loaded yet. Use `moltbrowser open <url>` or `moltbrowser goto <url>` first.');
    return;
  }

  console.log(`Page: ${state.url}`);
  console.log(formatHubTools(state.configs));
}

/**
 * hub-execute: Run a hub tool.
 *
 * Usage: moltbrowser hub-execute <toolName> [--arg=value ...]
 */
async function handleHubExecute(args, globalFlags) {
  const parsed = minimist(args);
  const toolName = parsed._[0];

  if (!toolName) {
    console.error('Usage: moltbrowser hub-execute <toolName> [--arg=value ...]');
    process.exit(1);
  }

  const state = loadState();
  if (!state.url) {
    console.error('No page loaded yet. Use `moltbrowser open <url>` or `moltbrowser goto <url>` first.');
    process.exit(1);
  }

  const toolMap = buildToolMap(state.configs);
  const entry = toolMap.get(toolName);

  if (!entry) {
    console.error(`Hub tool "${toolName}" not found.`);
    console.error('Available tools:');
    for (const [name] of toolMap) {
      console.error(`  - ${name}`);
    }
    process.exit(1);
  }

  const { tool, config } = entry;

  // Build arguments from --key=value flags (exclude minimist internals)
  const toolArgs = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key !== '_')
      toolArgs[key] = value;
  }

  // Translate to Playwright code
  const execution = tool.execution;
  if (!execution) {
    console.error(`Hub tool "${toolName}" has no execution metadata. It may be a documentation-only tool.`);
    process.exit(1);
  }

  try {
    const code = translate(execution, toolArgs);

    // Execute via playwright-cli run-code
    const output = passthroughCapture(['run-code', code], globalFlags);
    if (output)
      console.log(output);
  } catch (err) {
    console.error(`Failed to execute hub tool "${toolName}": ${err.message}`);
    process.exit(1);
  }
}

/**
 * hub-info: Show detailed info about a hub tool.
 */
function handleHubInfo(args, _globalFlags) {
  const toolName = args[0];

  if (!toolName) {
    console.error('Usage: moltbrowser hub-info <toolName>');
    process.exit(1);
  }

  const state = loadState();
  if (!state.url) {
    console.error('No page loaded yet. Use `moltbrowser open <url>` or `moltbrowser goto <url>` first.');
    process.exit(1);
  }

  const toolMap = buildToolMap(state.configs);
  const entry = toolMap.get(toolName);

  if (!entry) {
    console.error(`Hub tool "${toolName}" not found.`);
    process.exit(1);
  }

  const { tool, config } = entry;

  console.log(`### ${tool.name}`);
  console.log(`Description: ${tool.description || 'No description'}`);
  console.log(`Config: ${config.name || config._id || 'unknown'}`);

  if (tool.inputSchema?.properties) {
    console.log('\nArguments:');
    const required = new Set(tool.inputSchema.required || []);
    for (const [name, schema] of Object.entries(tool.inputSchema.properties)) {
      const req = required.has(name) ? ' (required)' : ' (optional)';
      const type = schema.type || 'string';
      const desc = schema.description || '';
      console.log(`  --${name}  <${type}>${req}  ${desc}`);
    }
  }

  if (tool.execution) {
    const exec = tool.execution;
    if (exec.fields?.length) {
      console.log(`\nForm fields: ${exec.fields.length}`);
    }
    if (exec.steps?.length) {
      console.log(`Steps: ${exec.steps.length}`);
    }
    if (exec.resultSelector) {
      console.log(`Extracts results: yes`);
    }
  }
}

module.exports = { handleHubList, handleHubExecute, handleHubInfo };
