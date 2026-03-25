#!/usr/bin/env node
/**
 * MoltBrowser CLI — Browser automation with WebMCP Hub integration.
 *
 * Wraps the Playwright CLI with per-site hub tool discovery,
 * execution, and contribution commands.
 *
 * Usage:
 *   moltbrowser open <url>                   Navigate & discover hub tools
 *   moltbrowser goto <url>                   Navigate & discover hub tools
 *   moltbrowser hub-list                     List discovered hub tools
 *   moltbrowser hub-execute <tool> [args]    Execute a hub tool
 *   moltbrowser hub-info <tool>              Show hub tool details
 *   moltbrowser contribute-create ...        Create a hub config
 *   moltbrowser contribute-add-tool ...      Add tool to config
 *   moltbrowser install --skills             Install skill files
 *   moltbrowser <any playwright-cli cmd>     Passthrough to playwright-cli
 */

const { dispatch } = require('./src/dispatcher.js');

dispatch(process.argv.slice(2)).catch(err => {
  process.stderr.write(`[moltbrowser] Error: ${err.message}\n`);
  process.exit(1);
});
