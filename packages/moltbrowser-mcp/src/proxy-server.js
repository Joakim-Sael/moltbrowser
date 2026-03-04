/**
 * Proxy MCP Server for Playwright + WebMCP Hub
 *
 * Sits between the agent and the upstream Playwright MCP server.
 * - Starts the upstream as a child process, connects as an MCP client
 * - Exposes itself as an MCP server to the agent (via stdio)
 * - Exposes a MINIMAL tool set: browser_navigate, hub_execute, browser_fallback, contribute_*
 * - On browser_navigate, queries the WebMCP Hub for configs (in parallel with navigation)
 * - browser_fallback provides access to all upstream Playwright tools on demand
 */

const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const hubClient = require('./hub-client.js');
const { getHubExecuteToolDefinition, handleHubExecute, getHubWriteToolDefinitions, handleHubWriteTool, isHubWriteTool } = require('./hub-tools.js');

/**
 * Start the proxy MCP server.
 *
 * @param {object} options
 * @param {string[]} options.upstreamArgs - CLI args to pass to the upstream Playwright MCP
 * @param {boolean} [options.noHub] - Disable hub integration entirely
 */
async function startProxy(options) {
  const { upstreamArgs = [], noHub = false, keyWarning = null } = options;

  // --- 1. Connect to the upstream Playwright MCP as a client ---
  const upstreamCliPath = path.join(__dirname, '..', 'cli.js');
  const clientTransport = new StdioClientTransport({
    command: 'node',
    args: [upstreamCliPath, ...upstreamArgs],
    stderr: 'pipe',
  });

  const upstreamClient = new Client({ name: 'moltbrowser-mcp-proxy', version: '1.0.0' });

  // Pipe upstream stderr to our stderr for debugging
  if (clientTransport.stderr) {
    clientTransport.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  }

  await upstreamClient.connect(clientTransport);

  // --- 2. State ---
  const hubToolMap = new Map();
  let cachedUpstreamTools = null;
  let lastLookedUpUrl = null;       // tracks the URL we last ran a hub lookup against
  let fallbackNudgePending = false; // true after any real fallback action, until the next snapshot
  let extractionHintShown = false;  // one-shot: true after we've nudged about extraction tools
  let fallbackEverUsed = false;     // true if browser_fallback was called with any tool this page

  /** Fetch upstream tools (cached after first call). */
  async function getUpstreamTools() {
    if (!cachedUpstreamTools) {
      const result = await upstreamClient.listTools();
      cachedUpstreamTools = result.tools || [];
    }
    return cachedUpstreamTools;
  }

  // --- 3. Create our proxy MCP server ---
  const proxyServer = new Server(
    { name: 'moltbrowser-mcp', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: [
        'You are a browser agent with WebMCP Hub integration.',
        '',
        '<workflow>',
        '1. Navigate with browser_navigate. Hub tools are discovered automatically.',
        '2. If hub tools are listed in the response, use hub_execute to run them. ALWAYS prefer hub tools.',
        '3. After a hub fill tool, use browser_press_key({ key: "Enter" }) to submit. This is more reliable than clicking a submit button.',
        '4. If NO hub tools exist or they fail, use browser_fallback for generic Playwright tools (snapshot, click, fill, etc.). Call browser_fallback without arguments to list available tools.',
        '5. NEVER call browser tools in parallel — always sequentially, one at a time.',
        '6. CONTRIBUTE before you are done: if you called browser_fallback even once — for any part of the task — you must contribute a config before considering the task complete. This is not optional. See <contribution> below.',
        '</workflow>',
        '',
        '<contribution>',
        'Contributing is STEP 5 of every task. It is not a bonus. It is not separate from the task.',
        'Any single call to browser_fallback — even one click or one fill in an otherwise hub-tool task — requires contribution.',
        '',
        'Contribute ONLY when ALL of these are true:',
        '1. You called browser_fallback at least once (even for a single step)',
        '2. You inspected the DOM to discover real CSS selectors (see <finding-selectors> below)',
        '3. You verified each selector by testing it on the page',
        '   If you used a condition step, verify the selector in EACH branch separately with',
        '   browser_snapshot — never assume two contexts (e.g. dialog vs. inline) share the same test IDs.',
        '',
        'NEVER contribute if you have not explored the page. A config without real CSS selectors is useless.',
        '',
        '<finding-selectors>',
        'browser_snapshot returns an accessibility tree with refs (e.g. "e12"), NOT CSS selectors.',
        'You MUST inspect the actual DOM to find real CSS selectors. Do NOT guess selectors from the snapshot.',
        '',
        'To find a CSS selector for an element you interacted with:',
        '1. Use browser_evaluate to inspect the element:',
        '   browser_fallback({ tool: "browser_evaluate", arguments: {',
        '     expression: "document.querySelector(\'input[name=search_query]\')?.tagName"',
        '   }})',
        '2. Or inspect multiple attributes at once:',
        '   browser_fallback({ tool: "browser_evaluate", arguments: {',
        '     expression: "JSON.stringify([...document.querySelectorAll(\'input\')].map(e => ({ tag: e.tagName, id: e.id, name: e.name, type: e.type, placeholder: e.placeholder })))"',
        '   }})',
        '3. Verify your chosen selector returns the right element BEFORE contributing.',
        '',
        'NEVER fabricate selectors like "input#search" without verifying. On YouTube, #search is a <div>,',
        'not an <input>. The actual input is input[name="search_query"]. Always check the DOM.',
        '</finding-selectors>',
        '',
        'How to contribute:',
        '- No hub config exists yet → contribute_create-config(...) then contribute_add-tool(...) for each tool',
        '- Hub config already exists → contribute_add-tool(...) with the config ID shown in the navigation response. Do NOT create a new config.',
        '',
        'contribute_create-config({ domain, urlPattern, title, description }) → returns config ID',
        '   urlPattern must match the page you explored. Use the path from browser_navigate:',
        '   - "example.com/products" for an exact page',
        '   - "example.com/products/:id" for dynamic pages (matches /products/123, /products/abc)',
        '   - "example.com/dashboard/**" for a section (matches /dashboard and everything under it)',
        '   - "example.com" ONLY for truly site-wide tools (navigation, global search)',
        'contribute_add-tool({ configId, name, description, selector, ... }) → adds one tool',
        '   Always add read-only extraction tools first (get-posts, get-content, list-items).',
        '   ONE ACTION PER TOOL. Each tool does exactly ONE thing:',
        '     - A fill tool ONLY fills a field (no submit, no autosubmit)',
        '     - A click tool ONLY clicks a button',
        '     - For search/submit: create a fill tool, then the agent uses browser_press_key({ key: "Enter" }) to submit',
        '   NEVER combine fill + submit in one tool. NEVER create click-search/click-submit tools — use browser_press_key instead.',
        '   WRONG: "search-videos" that fills AND submits. WRONG: "click-search" (fragile button selector).',
        '   RIGHT: "fill-search" (fill only) → agent calls browser_press_key({ key: "Enter" }) to submit.',
        '   Shadow DOM is fully supported — selectors targeting web components work transparently.',
        '',
        '   SELECTOR RULES — configs are shared globally, selectors must work for ALL users:',
        '   - Prefer: data-testid, id, name, type, role, or structural selectors (e.g. form input[type="search"])',
        '   - NEVER use aria-label with localized/translated text (e.g. aria-label="Søk", aria-label="Suche")',
        '   - If aria-label is the only option, use the English value only',
        '   - WRONG: input[aria-label="Søk"] — this only works in Norwegian',
        '   - RIGHT: input[name="search_query"], input#search, input[type="search"]',
        '',
        'BEFORE SAYING YOU ARE DONE — run this checklist:',
        '  [ ] Did I call browser_fallback at any point? → If yes:',
        '  [ ] Did I contribute_create-config or identify the existing config ID?',
        '  [ ] Did I call contribute_add-tool for every action I performed manually?',
        '  If any box is unchecked, you are not done yet.',
        '</contribution>',
      ].join('\n'),
    },
  );

  // --- 4. browser_fallback tool definition ---
  function getBrowserFallbackDefinition() {
    return {
      name: 'browser_fallback',
      description: `Access generic Playwright browser tools as a fallback when hub tools are insufficient.
Works in three modes:
- No arguments: lists all available Playwright tools
- peek: true: inspects a tool's full input schema before calling it
- tool + arguments: executes a Playwright tool (e.g. browser_click, browser_snapshot)
<important>
All element-targeting tools use "ref" values from browser_snapshot (e.g., "e12", "e37"), NOT CSS selectors.
Always take a browser_snapshot first to get element refs, then use those refs in tool calls.
If you get a validation error, the correct schema will be included in the error response.
</important>
<tool-schemas>
Common tools — use EXACTLY these argument shapes:

browser_click:         { "ref": "e12" }                         — ref from snapshot, NOT a selector
browser_type:          { "ref": "e12", "text": "hello" }        — ref from snapshot + text to type
browser_press_key:     { "key": "Enter" }                       — key name
browser_hover:         { "ref": "e12" }                         — ref from snapshot
browser_select_option: { "ref": "e12", "values": ["opt1"] }     — ref + values array
browser_fill_form:     { "fields": [{"ref":"e12","value":"hi"},{"ref":"e15","value":"there"}] }  — array of {ref, value} objects

WRONG: { "selector": "...", "text": "..." }   — never use "selector", always use "ref"
WRONG: { "fields": {"search": "..."} }        — fields is an ARRAY of {ref, value}, not an object
</tool-schemas>`,
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description: 'The Playwright tool name to run (e.g. "browser_click", "browser_snapshot"). Omit to list available tools.',
          },
          peek: {
            type: 'boolean',
            description: 'Set to true to inspect the full input schema of the specified tool without executing it. Use this before calling an unfamiliar tool to avoid schema errors.',
          },
          arguments: {
            type: 'object',
            description: 'Arguments for the Playwright tool. Use ref values from browser_snapshot for element targeting.',
            additionalProperties: true,
          },
        },
      },
    };
  }

  // --- 5. Handle tools/list — minimal tool set ---
  // Expose browser_navigate and browser_press_key directly from upstream.
  // browser_press_key is first-class because it's essential for submitting
  // after hub fill tools (e.g. fill-search → press Enter) without needing
  // fragile CSS selectors for submit buttons.
  const FIRST_CLASS_UPSTREAM = ['browser_navigate', 'browser_press_key'];

  proxyServer.setRequestHandler(ListToolsRequestSchema, async () => {
    const upstreamTools = await getUpstreamTools();

    const firstClassTools = FIRST_CLASS_UPSTREAM
      .map(name => upstreamTools.find(t => t.name === name))
      .filter(Boolean);

    const hubExecute = noHub ? [] : [getHubExecuteToolDefinition()];
    const writeTools = noHub ? [] : getHubWriteToolDefinitions();

    return {
      tools: [
        ...firstClassTools,
        ...hubExecute,
        getBrowserFallbackDefinition(),
        ...writeTools,
      ],
    };
  });

  // --- 6. Handle tools/call ---
  proxyServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const toolArgs = request.params.arguments || {};

    // Hub write tools
    if (!noHub && isHubWriteTool(toolName)) {
      return await handleHubWriteTool(toolName, toolArgs);
    }

    // Hub execute
    if (!noHub && toolName === 'hub_execute') {
      return await handleHubExecute(toolArgs, hubToolMap, upstreamClient);
    }

    // Browser fallback — proxy to upstream Playwright tools
    if (toolName === 'browser_fallback') {
      return await handleBrowserFallback(toolArgs);
    }

    // browser_navigate — parallel hub lookup
    if (!noHub && toolName === 'browser_navigate' && toolArgs.url) {
      return await handleNavigate(toolArgs);
    }

    // All other tools — direct proxy (shouldn't normally happen with minimal tool set)
    return await upstreamClient.callTool({
      name: toolName,
      arguments: toolArgs,
    });
  });

  // --- handleBrowserFallback ---
  async function handleBrowserFallback(toolArgs) {
    const innerTool = toolArgs.tool;
    const innerArgs = toolArgs.arguments || {};

    // No tool specified — list available tools
    if (!innerTool) {
      const tools = await getUpstreamTools();
      const list = tools
        .filter(t => t.name !== 'browser_navigate') // already exposed directly
        .map(t => {
          const desc = (t.description || '').slice(0, 120);
          return `- ${t.name}: ${desc}`;
        })
        .join('\n');
      let contributionReminder = '';
      if (keyWarning) {
        contributionReminder = `\n\n<api-key-warning>⚠ ${keyWarning}</api-key-warning>`;
      } else if (hubToolMap.size === 0) {
        contributionReminder = '\n\n<reminder>No hub config exists for this page. Any use of browser_fallback — actions or data reading — requires contribution. After completing your task, call contribute_create-config then contribute_add-tool for each action AND each data extraction (e.g., reading posts/items → contribute a get-posts tool). This is not optional.</reminder>';
      } else {
        const configIds = [...new Set(Array.from(hubToolMap.values()).map(e => e.configId))];
        contributionReminder = `\n\n<reminder>Hub tools exist but don't cover your current task. Any use of browser_fallback — actions or data reading — requires contribution. After completing, call contribute_add-tool with configId: "${configIds[0]}" to add the missing tool. If you read/extracted data via snapshot, also contribute an extraction tool (e.g., get-posts, get-items). Do NOT call contribute_create-config.</reminder>`;
      }
      return {
        content: [{ type: 'text', text: `Available Playwright tools (use via browser_fallback):\n\n${list}${contributionReminder}` }],
      };
    }

    // Peek — return the full inputSchema for the named tool without executing it.
    if (toolArgs.peek === true) {
      const tools = await getUpstreamTools();
      const match = tools.find(t => t.name === innerTool);
      if (!match) {
        return { content: [{ type: 'text', text: `Unknown tool: "${innerTool}". Call browser_fallback without arguments to list available tools.` }] };
      }
      return {
        content: [{ type: 'text', text: `Schema for ${innerTool}:\n\n${JSON.stringify(match.inputSchema, null, 2)}\n\nDescription: ${match.description || '(none)'}` }],
      };
    }

    // Any real action tool (not list-tools, not snapshot) counts as "fallback was used".
    // This triggers the one-shot contribution nudge on the next browser_snapshot.
    if (innerTool !== 'browser_snapshot') {
      fallbackNudgePending = true;
    }
    fallbackEverUsed = true;

    // Proxy to upstream
    const result = await upstreamClient.callTool({ name: innerTool, arguments: innerArgs });

    // Auto-peek on validation error: if the upstream returned a schema validation error
    // (invalid_type, unrecognized_keys, etc.), automatically append the correct schema
    // so the agent can self-correct without an extra round-trip.
    if (result.isError || result.content?.some(c => c.type === 'text' && c.text && (
      c.text.includes('invalid_type') || c.text.includes('unrecognized_keys') || c.text.includes('invalid_union')
    ))) {
      const tools = await getUpstreamTools();
      const match = tools.find(t => t.name === innerTool);
      if (match) {
        result.content.push({
          type: 'text',
          text: `\n<correct-schema>\nThe call to ${innerTool} failed due to invalid arguments. Here is the correct schema:\n\n${JSON.stringify(match.inputSchema, null, 2)}\n\nDescription: ${match.description || '(none)'}\n\nRetry with the correct argument format.\n</correct-schema>`,
        });
      }
    }

    // After browser_snapshot, check whether the page URL has changed since our last hub lookup.
    // This catches SPA client-side redirects (e.g. x.com → x.com/home) that complete AFTER
    // page.goto() returns, so they are invisible to handleNavigate's redirect detection.
    if (innerTool === 'browser_snapshot' && hubToolMap.size === 0) {
      const currentUrl = extractFinalUrl(result);
      if (currentUrl && currentUrl !== lastLookedUpUrl) {
        process.stderr.write(`[hub-lookup] SPA navigation detected: ${lastLookedUpUrl} → ${currentUrl}\n`);
        lastLookedUpUrl = currentUrl;
        const newTools = await triggerHubLookup(currentUrl).catch(err => {
          process.stderr.write(`[hub-lookup] Error on SPA lookup: ${err.message}\n`);
          return new Map();
        });
        if (newTools.size > 0) {
          hubToolMap.clear();
          for (const [k, v] of newTools) hubToolMap.set(k, v);
          const entries = Array.from(hubToolMap.entries());
          const toolList = entries.map(([prefixedName, entry]) => {
            const name = prefixedName.replace(/^hub_/, '');
            const schema = entry.tool.inputSchema;
            let argsDesc = '(none)';
            if (schema?.properties && Object.keys(schema.properties).length > 0) {
              const required = new Set(schema.required || []);
              argsDesc = Object.entries(schema.properties).map(([k, v]) => {
                return `${k} (${v.type || 'string'}${required.has(k) ? ', required' : ''})`;
              }).join(', ');
            }
            return `  - toolName: "${name}"\n    description: ${entry.tool.description}\n    arguments: ${argsDesc}`;
          }).join('\n\n');
          const exampleName = entries[0][0].replace(/^hub_/, '');
          result.content.push({
            type: 'text',
            text: [
              '',
              '<hub-tools-discovered>',
              `Hub tools found for ${currentUrl} (page navigated here after the initial browser_navigate call).`,
              `Switch to hub_execute instead of browser_fallback. Example: hub_execute({ toolName: "${exampleName}", arguments: {} })`,
              '',
              toolList,
              '</hub-tools-discovered>',
            ].join('\n'),
          });
        } else {
          // No hub config for the new URL either — update the contribution hint URL
          const lines = keyWarning
            ? ['', '<api-key-warning>', `⚠ ${keyWarning}`, '</api-key-warning>']
            : [
                '',
                '<no-hub-config>',
                `No hub config exists for this page (${currentUrl}).`,
                'After completing the task, you are expected to contribute a config:',
                '  1. contribute_create-config({ domain, urlPattern, title, description })',
                '  2. contribute_add-tool(...) — once per action AND data extraction you performed',
                '     Actions: clicks, fills, form submissions. Extractions: reading posts, items, lists.',
                'Do not skip this step.',
                '</no-hub-config>',
              ];
          result.content.push({ type: 'text', text: lines.join('\n') });
        }
      }
    }

    // One-shot contribution nudge: fires on the first browser_snapshot after any real fallback
    // action (click, type, fill, etc.). This catches the "verified it works, about to wrap up"
    // moment — exactly when the agent needs the reminder before they say they're done.
    if (innerTool === 'browser_snapshot' && fallbackNudgePending) {
      fallbackNudgePending = false;
      let nudgeText;
      if (keyWarning) {
        nudgeText = ['', '<api-key-warning>', `⚠ ${keyWarning}`, '</api-key-warning>'].join('\n');
      } else {
        const nudgeLines = [
          '',
          '<contribute-reminder>',
          'You have used browser_fallback to interact with this page.',
          'You are NOT done yet. Before finishing, complete the contribution checklist:',
          '  [ ] Identify or create the config:',
        ];
        if (hubToolMap.size === 0) {
          nudgeLines.push('      → No hub config exists. Call contribute_create-config({ domain, urlPattern, title, description })');
        } else {
          const configIds = [...new Set(Array.from(hubToolMap.values()).map(e => e.configId))];
          nudgeLines.push(`      → Config already exists (ID: ${configIds[0]}). Use it — do NOT call contribute_create-config.`);
        }
        nudgeLines.push(
          '  [ ] Call contribute_add-tool once for every action you performed manually',
          '  [ ] If you read/extracted data via browser_snapshot (e.g., reading a feed, list, or page content),',
          '      also contribute an extraction tool (e.g., get-posts, get-items) with resultExtract: "list"',
          '  [ ] Only then is the task complete.',
          '</contribute-reminder>',
        );
        nudgeText = nudgeLines.join('\n');
      }
      result.content.push({ type: 'text', text: nudgeText });
    }

    // One-shot extraction hint: when hub tools exist but the agent still used
    // browser_snapshot to read page content, nudge them to contribute an extraction tool.
    // This covers the case where hub tools only have actions (click, fill) but no read tools.
    if (innerTool === 'browser_snapshot' && hubToolMap.size > 0 && fallbackEverUsed && !fallbackNudgePending && !extractionHintShown) {
      extractionHintShown = true;
      const configIds = [...new Set(Array.from(hubToolMap.values()).map(e => e.configId))];
      result.content.push({
        type: 'text',
        text: [
          '',
          '<extraction-hint>',
          'You used browser_snapshot to read page content. Hub tools exist for actions on this page,',
          'but no extraction tool covers what you just read.',
          'If you extracted data (posts, items, lists, etc.), contribute an extraction tool:',
          `  → contribute_add-tool with configId: "${configIds[0]}"`,
          '  → Use resultExtract: "list" and resultSelector to target the data elements',
          'Extraction tools are just as important as action tools — they save thousands of tokens on every future read.',
          '</extraction-hint>',
        ].join('\n'),
      });
    }

    return result;
  }

  // --- handleNavigate (with parallel hub lookup) ---
  async function handleNavigate(toolArgs) {
    // Fire navigation and hub lookup in parallel — hub only needs the URL
    const [result, newTools] = await Promise.all([
      upstreamClient.callTool({ name: 'browser_navigate', arguments: toolArgs }),
      triggerHubLookup(toolArgs.url).catch(err => {
        process.stderr.write(`[hub-lookup] Error: ${err.message}\n`);
        return new Map();
      }),
    ]);

    // Reset per-page state on every navigation
    hubToolMap.clear();
    fallbackNudgePending = false;
    extractionHintShown = false;
    fallbackEverUsed = false;
    for (const [key, value] of newTools) hubToolMap.set(key, value);

    // Track the URL we actually ended up on (may differ from toolArgs.url after a redirect).
    let resolvedUrl = toolArgs.url;

    // If no tools found, check whether the page redirected to a different URL.
    // e.g. x.com → x.com/home. Re-run the lookup against the final URL.
    if (hubToolMap.size === 0) {
      const finalUrl = extractFinalUrl(result);
      if (finalUrl && finalUrl !== toolArgs.url) {
        resolvedUrl = finalUrl;
        process.stderr.write(`[hub-lookup] Redirect detected: ${toolArgs.url} → ${finalUrl}\n`);
        const redirectTools = await triggerHubLookup(finalUrl).catch(err => {
          process.stderr.write(`[hub-lookup] Error on redirect lookup: ${err.message}\n`);
          return new Map();
        });
        for (const [key, value] of redirectTools) hubToolMap.set(key, value);
      }
    }

    // If still no tools, wait briefly for SPA client-side redirects to settle.
    // SPAs like x.com redirect via JavaScript routing AFTER page.goto() returns,
    // so the snapshot URL at navigate time is still the pre-redirect URL.
    // waitForURL returns immediately when the URL changes, with a 2s max timeout.
    if (hubToolMap.size === 0) {
      try {
        const urlCheckResult = await upstreamClient.callTool({
          name: 'browser_run_code',
          arguments: {
            code: [
              'async (page) => {',
              '  const startUrl = page.url();',
              '  try {',
              '    await page.waitForURL(url => url.toString() !== startUrl, { timeout: 2000 });',
              '  } catch {}',
              '  return page.url();',
              '}',
            ].join('\n'),
          },
        });
        const settledUrl = extractFinalUrl(urlCheckResult);
        if (settledUrl && settledUrl !== toolArgs.url && settledUrl !== resolvedUrl) {
          resolvedUrl = settledUrl;
          process.stderr.write(`[hub-lookup] SPA redirect detected: ${toolArgs.url} → ${settledUrl}\n`);
          const spaTools = await triggerHubLookup(settledUrl).catch(err => {
            process.stderr.write(`[hub-lookup] Error on SPA redirect lookup: ${err.message}\n`);
            return new Map();
          });
          for (const [key, value] of spaTools) hubToolMap.set(key, value);
        }
      } catch (err) {
        process.stderr.write(`[hub-lookup] Error during SPA URL check: ${err.message}\n`);
      }
    }

    if (hubToolMap.size > 0) {
      // Hub tools found — strip the full page snapshot (saves 1000-3000+ tokens).
      // The agent should use hub tools, not read the raw accessibility tree.
      const entries = Array.from(hubToolMap.entries());
      const toolList = entries.map(([prefixedName, entry]) => {
        const name = prefixedName.replace(/^hub_/, '');
        const desc = entry.tool.description;

        const schema = entry.tool.inputSchema;
        let argsDesc = '(none)';
        if (schema && schema.properties && Object.keys(schema.properties).length > 0) {
          const required = new Set(schema.required || []);
          argsDesc = Object.entries(schema.properties).map(([k, v]) => {
            const req = required.has(k) ? ', required' : '';
            return `${k} (${v.type || 'string'}${req})`;
          }).join(', ');
        }

        return `  - toolName: "${name}"\n    description: ${desc}\n    arguments: ${argsDesc}`;
      }).join('\n\n');

      const exampleName = entries[0][0].replace(/^hub_/, '');
      const configIds = [...new Set(entries.map(([, e]) => e.configId))];

      // Replace entire response — no snapshot, just what the agent needs
      result.content = [{
        type: 'text',
        text: [
          `Navigated to ${resolvedUrl}`,
          '',
          '<hub-tools-available>',
          `Found ${entries.length} pre-configured hub tool(s) for this site.`,
          `Use hub_execute to run these. Example: hub_execute({ toolName: "${exampleName}", arguments: {} })`,
          '',
          toolList,
          '',
          'Use hub tools for both reading data and performing actions. Only use browser_fallback if no hub tool covers your need.',
          '',
          `Config ID(s): ${configIds.join(', ')} — if these tools don't cover your task (including data reading/extraction), use browser_fallback to complete it, then call contribute_add-tool with the config ID above to add the missing tool. Do NOT call contribute_create-config.`,
          '</hub-tools-available>',
        ].join('\n'),
      }];
    }
    // Record the URL we ended up doing lookups for, so browser_snapshot can detect SPA navigation.
    lastLookedUpUrl = resolvedUrl;

    // No hub tools → return full Playwright response with snapshot (agent needs it for browser_fallback).
    // Append a contribution reminder so the agent knows to contribute after completing the task.
    if (hubToolMap.size === 0 && result.content && result.content.length > 0) {
      const noHubLines = keyWarning
        ? ['', '<api-key-warning>', `⚠ ${keyWarning}`, '</api-key-warning>']
        : [
            '',
            '<no-hub-config>',
            `No hub config exists for this page (${resolvedUrl}).`,
            'You will need to use browser_fallback to complete your task.',
            'Any use of browser_fallback — actions or data reading — requires contribution before you are done:',
            '  1. contribute_create-config({ domain, urlPattern, title, description })',
            '  2. contribute_add-tool(...) — once per action AND data extraction you performed',
            '     Actions: clicks, fills, form submissions. Extractions: reading posts, items, lists (use resultExtract: "list").',
            'Do not skip this step.',
            '</no-hub-config>',
          ];
      result.content.push({ type: 'text', text: noHubLines.join('\n') });
    }

    return result;
  }

  // --- 7. Proxy resource requests (pass-through) ---
  proxyServer.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      return await upstreamClient.listResources();
    } catch {
      return { resources: [] };
    }
  });

  proxyServer.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    try {
      return await upstreamClient.listResourceTemplates();
    } catch {
      return { resourceTemplates: [] };
    }
  });

  proxyServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return await upstreamClient.readResource({ uri: request.params.uri });
  });

  // --- 8. Proxy prompt requests (pass-through) ---
  proxyServer.setRequestHandler(ListPromptsRequestSchema, async () => {
    try {
      return await upstreamClient.listPrompts();
    } catch {
      return { prompts: [] };
    }
  });

  proxyServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return await upstreamClient.getPrompt({
      name: request.params.name,
      arguments: request.params.arguments,
    });
  });

  // --- 9. Connect the proxy server to stdio (agent-facing) ---
  const serverTransport = new StdioServerTransport();
  await proxyServer.connect(serverTransport);

  // Clean shutdown
  process.on('SIGINT', async () => {
    await upstreamClient.close();
    await proxyServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await upstreamClient.close();
    await proxyServer.close();
    process.exit(0);
  });
}

/**
 * Extract the final page URL from a Playwright navigate result.
 * The Playwright MCP includes "- Page URL: <url>" in the response text.
 *
 * @param {object} result - The callTool result from browser_navigate
 * @returns {string|null} The final URL, or null if not found
 */
function extractFinalUrl(result) {
  if (!result || !result.content) return null;
  for (const item of result.content) {
    if (item.type === 'text' && item.text) {
      const match = item.text.match(/[-*]\s*Page URL:\s*(https?:\/\/\S+)/);
      if (match) return match[1].replace(/\/+$/, ''); // strip trailing slashes
    }
  }
  return null;
}

/**
 * Query the WebMCP Hub for configs matching the navigated URL.
 * Returns a Map of prefixed tool name → tool entry (does not mutate shared state).
 *
 * @param {string} url - The full URL being navigated to
 * @returns {Promise<Map>} Map of prefixedName → { tool, execution, configId }
 */
async function triggerHubLookup(url) {
  const newTools = new Map();

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return newTools; // Invalid URL, skip
  }

  const domain = parsedUrl.hostname.replace(/^www\./, '');
  // URL for pattern matching: domain + path (no protocol, no www)
  const urlForLookup = domain + parsedUrl.pathname;

  const { configs } = await hubClient.lookupConfig(domain, urlForLookup);

  // Register new tools from all matching configs
  for (const config of configs) {
    if (!config.tools) continue;

    for (const tool of config.tools) {
      if (!tool.execution) continue; // Only register executable tools

      // Prefix hub tools to avoid name collisions with upstream
      const prefixedName = `hub_${tool.name}`;

      if (newTools.has(prefixedName)) {
        process.stderr.write(`[hub-lookup] Tool name collision: "${tool.name}" exists in multiple configs. Skipping duplicate from config ${config.id}.\n`);
        continue;
      }

      newTools.set(prefixedName, {
        tool: {
          name: prefixedName,
          description: `[${config.title}] ${tool.description}`,
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        },
        execution: tool.execution,
        configId: config.id,
      });
    }
  }

  if (newTools.size > 0) {
    process.stderr.write(`[hub-lookup] Found ${newTools.size} hub tool(s) for ${domain}\n`);
  }

  return newTools;
}

module.exports = { startProxy };
