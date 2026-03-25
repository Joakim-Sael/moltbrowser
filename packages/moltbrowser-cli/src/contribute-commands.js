/**
 * Contribute Commands
 *
 * CLI wrappers around hub-client write operations for contributing
 * configs and tools back to the WebMCP Hub.
 */

const minimist = require('minimist');
const hubClient = require('moltbrowser-mcp-server/hub-client');

// Auth is now enforced globally by the dispatcher via requireAuth().
// No per-command key check needed.

/**
 * contribute-create: Create a new hub config.
 *
 * Usage: moltbrowser contribute-create --domain=<domain> --url-pattern=<pattern> --title=<title> [--description=<desc>]
 */
async function handleContributeCreate(args) {
  // Auth enforced by dispatcher
  const parsed = minimist(args);

  const domain = parsed.domain;
  const urlPattern = parsed['url-pattern'] || parsed.urlPattern;
  const title = parsed.title || parsed._[0];
  const description = parsed.description || '';

  if (!domain || !urlPattern || !title) {
    console.error('Usage: moltbrowser contribute-create --domain=<domain> --url-pattern=<pattern> --title=<title> [--description=<desc>]');
    process.exit(1);
  }

  try {
    const result = await hubClient.uploadConfig({ domain, urlPattern, title, description });
    console.log(`Config created successfully.`);
    console.log(`Config ID: ${result._id || result.id}`);
    console.log(`Use this ID with contribute-add-tool to add tools.`);
  } catch (err) {
    console.error(`Failed to create config: ${err.message}`);
    process.exit(1);
  }
}

/**
 * contribute-add-tool: Add a tool to a hub config.
 *
 * Usage: moltbrowser contribute-add-tool --config-id=<id> --name=<name> --description=<desc>
 *        [--selector=<sel>] [--result-selector=<sel>] [--fields=<json>] [--steps=<json>]
 */
async function handleContributeAddTool(args) {
  // Auth enforced by dispatcher
  const parsed = minimist(args);

  const configId = parsed['config-id'] || parsed.configId;
  const name = parsed.name || parsed._[0];
  const description = parsed.description || '';

  if (!configId || !name) {
    console.error('Usage: moltbrowser contribute-add-tool --config-id=<id> --name=<name> --description=<desc>');
    console.error('  [--selector=<sel>] [--result-selector=<sel>] [--fields=<json>] [--steps=<json>]');
    process.exit(1);
  }

  const tool = { name, description };

  // Execution-related fields go under the `execution` key
  const execution = {};
  if (parsed.selector) execution.selector = parsed.selector;
  if (parsed['result-selector'] || parsed.resultSelector)
    execution.resultSelector = parsed['result-selector'] || parsed.resultSelector;
  if (parsed.fields) {
    try { execution.fields = JSON.parse(parsed.fields); } catch {
      console.error('--fields must be valid JSON');
      process.exit(1);
    }
  }
  if (parsed.steps) {
    try { execution.steps = JSON.parse(parsed.steps); } catch {
      console.error('--steps must be valid JSON');
      process.exit(1);
    }
  }
  if (Object.keys(execution).length > 0)
    tool.execution = execution;

  try {
    const result = await hubClient.addTool(configId, tool);
    console.log(`Tool "${name}" added to config ${configId}.`);
  } catch (err) {
    console.error(`Failed to add tool: ${err.message}`);
    process.exit(1);
  }
}

/**
 * contribute-update-tool: Update an existing hub tool.
 *
 * Usage: moltbrowser contribute-update-tool --config-id=<id> --name=<name> [--description=<desc>] [--selector=<sel>] ...
 */
async function handleContributeUpdateTool(args) {
  // Auth enforced by dispatcher
  const parsed = minimist(args);

  const configId = parsed['config-id'] || parsed.configId;
  const name = parsed.name || parsed._[0];

  if (!configId || !name) {
    console.error('Usage: moltbrowser contribute-update-tool --config-id=<id> --name=<name> [updates...]');
    process.exit(1);
  }

  const updates = {};
  if (parsed.description) updates.description = parsed.description;

  // Execution-related fields go under the `execution` key
  const execution = {};
  if (parsed.selector) execution.selector = parsed.selector;
  if (parsed['result-selector'] || parsed.resultSelector)
    execution.resultSelector = parsed['result-selector'] || parsed.resultSelector;
  if (parsed.fields) {
    try { execution.fields = JSON.parse(parsed.fields); } catch {
      console.error('--fields must be valid JSON');
      process.exit(1);
    }
  }
  if (parsed.steps) {
    try { execution.steps = JSON.parse(parsed.steps); } catch {
      console.error('--steps must be valid JSON');
      process.exit(1);
    }
  }
  if (Object.keys(execution).length > 0)
    updates.execution = execution;

  try {
    await hubClient.updateTool(configId, name, updates);
    console.log(`Tool "${name}" updated.`);
  } catch (err) {
    console.error(`Failed to update tool: ${err.message}`);
    process.exit(1);
  }
}

/**
 * contribute-delete-tool: Delete a tool from a hub config.
 *
 * Usage: moltbrowser contribute-delete-tool --config-id=<id> --name=<name>
 */
async function handleContributeDeleteTool(args) {
  // Auth enforced by dispatcher
  const parsed = minimist(args);

  const configId = parsed['config-id'] || parsed.configId;
  const name = parsed.name || parsed._[0];

  if (!configId || !name) {
    console.error('Usage: moltbrowser contribute-delete-tool --config-id=<id> --name=<name>');
    process.exit(1);
  }

  try {
    await hubClient.deleteTool(configId, name);
    console.log(`Tool "${name}" deleted from config ${configId}.`);
  } catch (err) {
    console.error(`Failed to delete tool: ${err.message}`);
    process.exit(1);
  }
}

/**
 * contribute-vote: Vote on a hub tool.
 *
 * Usage: moltbrowser contribute-vote --config-id=<id> --name=<name> --vote=<up|down>
 */
async function handleContributeVote(args) {
  // Auth enforced by dispatcher
  const parsed = minimist(args);

  const configId = parsed['config-id'] || parsed.configId;
  const name = parsed.name || parsed._[0];
  const vote = parsed.vote || parsed._[1];

  if (!configId || !name || !vote) {
    console.error('Usage: moltbrowser contribute-vote --config-id=<id> --name=<name> --vote=<up|down>');
    process.exit(1);
  }

  if (vote !== 'up' && vote !== 'down') {
    console.error('Vote must be "up" or "down".');
    process.exit(1);
  }

  try {
    await hubClient.voteOnTool(configId, name, vote === 'up' ? 1 : -1);
    console.log(`Voted ${vote} on "${name}".`);
  } catch (err) {
    console.error(`Failed to vote: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  handleContributeCreate,
  handleContributeAddTool,
  handleContributeUpdateTool,
  handleContributeDeleteTool,
  handleContributeVote,
};
