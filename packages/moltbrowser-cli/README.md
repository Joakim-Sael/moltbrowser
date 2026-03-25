# moltbrowser-cli

Browser automation CLI with **WebMCP Hub** integration — per-site tools for coding agents.

### MoltBrowser CLI vs MoltBrowser MCP

This package provides the **CLI interface** into MoltBrowser. If you are using **coding agents** (Claude Code, GitHub Copilot), this is the best fit.

- **CLI**: Token-efficient, concise commands exposed as SKILLs. Avoids loading large tool schemas and verbose accessibility trees into the model context. Best suited for coding agents that balance browser automation with large codebases.

- **MCP**: Best for specialized agentic loops with persistent state, rich introspection, and iterative reasoning. See [moltbrowser-mcp](../moltbrowser-mcp/).

Both share the same WebMCP Hub — tools contributed via CLI are available in MCP and vice versa.

### Key Features

- **Hub tool discovery** — Navigate to a site and get pre-configured, community-tested browser tools automatically
- **Token-efficient** — Concise CLI commands, no large schemas in context
- **Session management** — Named browser sessions with state persistence (via Playwright CLI)
- **Skill files** — Install agent skills for Claude Code, Copilot, etc.
- **Full Playwright CLI** — All standard commands available as passthrough

## Getting Started

### Installation

```bash
npm install -g moltbrowser-cli
npm install -g @playwright/cli@latest

# Login (required, one-time setup — get a free key at https://www.webmcp-hub.com)
moltbrowser login
```

### Installing skills

Skills teach coding agents how to use the CLI effectively:

```bash
moltbrowser install --skills
```

### Quick demo

```bash
moltbrowser open https://github.com --headed
# Hub tools are discovered automatically

moltbrowser hub-execute search-repos --query="playwright"
moltbrowser snapshot
moltbrowser screenshot
moltbrowser close
```

## Hub Integration

When you navigate to a site, MoltBrowser queries the [WebMCP Hub](https://webmcp-hub.com) for pre-configured tools matching that domain. These tools have tested selectors and execution logic contributed by the community.

```bash
> moltbrowser goto https://github.com
### Page
- Page URL: https://github.com/
- Page Title: GitHub
### Snapshot
[Snapshot](.moltbrowser/page-2026-03-23T12-00-00.yml)
### Hub Tools (3 available)
- **search-repos** (query): Search for repositories by name
- **get-trending**: Get trending repositories
- **create-repo** (name, description): Create a new repository

Use `moltbrowser hub-execute <tool> --arg=value` to run a hub tool.
```

### Hub commands

```bash
moltbrowser hub-list                              # List hub tools for current page
moltbrowser hub-execute <tool> --arg=value        # Execute a hub tool
moltbrowser hub-info <tool>                       # Show tool details and arguments
```

## Commands

### Navigation (with hub lookup)

```bash
moltbrowser open [url]             # open browser, optionally navigate
moltbrowser goto <url>             # navigate to URL
```

### Core

```bash
moltbrowser click <ref>            # click element by ref from snapshot
moltbrowser type <text>            # type text into focused element
moltbrowser fill <ref> <text>      # fill a specific element
moltbrowser press <key>            # press key (Enter, ArrowDown, etc.)
moltbrowser snapshot               # capture page snapshot
moltbrowser screenshot             # take screenshot
moltbrowser close                  # close browser
```

### All Playwright CLI commands

All other commands are passed through to the Playwright CLI:

```bash
moltbrowser dblclick <ref>         moltbrowser drag <from> <to>
moltbrowser hover <ref>            moltbrowser select <ref> <val>
moltbrowser check <ref>            moltbrowser uncheck <ref>
moltbrowser upload <file>          moltbrowser eval <expr>
moltbrowser go-back                moltbrowser go-forward
moltbrowser reload                 moltbrowser resize <w> <h>
moltbrowser tab-list               moltbrowser tab-new [url]
moltbrowser tab-close              moltbrowser tab-select <idx>
moltbrowser console                moltbrowser network
moltbrowser pdf                    moltbrowser run-code <code>
```

## Sessions

```bash
moltbrowser -s=mysite open https://example.com    # named session
moltbrowser -s=mysite click e5                     # use named session
moltbrowser list                                   # list all sessions
moltbrowser close-all                              # close all browsers
```

Or via environment variable:

```bash
MOLTBROWSER_SESSION=mysite claude .
```

## Contributing Tools

When you automate a site manually, contribute tools for others:

```bash
# Get a free API key at https://www.webmcp-hub.com
export HUB_API_KEY=your-key

moltbrowser contribute-create --domain=example.com --url-pattern="example.com/search" --title="Example Search"
moltbrowser contribute-add-tool --config-id=<id> --name=search-items --description="Search" --selector="#search" --fields='[{"name":"query","selector":"#q","type":"text"}]'
moltbrowser contribute-vote --config-id=<id> --name=search-items --vote=up
```

## Configuration

### Global options

```bash
-s=<name>              Named browser session
--no-hub               Disable hub integration
--hub-url=<url>        Override hub URL
--hub-api-key=<key>    API key for hub operations
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `MOLTBROWSER_SESSION` | Default session name |
| `HUB_API_KEY` | API key for hub operations |
| `HUB_URL` | Override hub URL |

### Playwright CLI options

Passed through to playwright-cli on `open`:

```bash
moltbrowser open --headed            # show browser window
moltbrowser open --browser=firefox   # use specific browser
moltbrowser open --persistent        # persist browser profile
moltbrowser open --config=conf.json  # use config file
```

## Requirements

- Node.js 18 or newer
- [@playwright/cli](https://github.com/microsoft/playwright-cli) or Playwright 1.59+

## License

Apache-2.0
