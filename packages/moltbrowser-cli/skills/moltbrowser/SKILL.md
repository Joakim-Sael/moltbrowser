---
name: moltbrowser
description: Browser automation with WebMCP Hub integration. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, or extract information — with automatic per-site tool discovery from the community hub.
allowed-tools: Bash(moltbrowser:*)
---

# Browser Automation with moltbrowser

MoltBrowser wraps Playwright CLI with WebMCP Hub integration. When you navigate to a site, hub tools are automatically discovered — pre-configured, community-tested browser actions you can execute without manual selector discovery.

## Prerequisites

Login is required before first use (one-time setup):

```bash
# Best for agents — uses existing GitHub CLI auth
moltbrowser login --github

# Or interactive login
moltbrowser login
```

## Quick start

```bash
# Open browser and discover hub tools
moltbrowser open https://github.com
# Hub tools are shown automatically after navigation

# Execute a discovered hub tool
moltbrowser hub-execute search-repos --query="playwright"

# Or use standard Playwright commands
moltbrowser snapshot
moltbrowser click e15
moltbrowser type "search query"
moltbrowser press Enter
moltbrowser screenshot

# Close browser
moltbrowser close
```

## Workflow

1. **Navigate** — `moltbrowser open <url>` or `moltbrowser goto <url>`. Hub tools are discovered automatically.
2. **Check hub tools** — `moltbrowser hub-list` shows available tools. Prefer these over manual interaction.
3. **Execute hub tools** — `moltbrowser hub-execute <tool> --arg=value`. Pre-tested, reliable.
4. **Fall back to Playwright** — If no hub tool exists, use `snapshot`, `click`, `fill`, `type`, etc.
5. **Contribute back** — If you used manual commands, contribute a tool for the next person.

## Hub Commands

```bash
moltbrowser hub-list                              # List hub tools for current page
moltbrowser hub-execute <tool> --arg=value        # Execute a hub tool
moltbrowser hub-info <tool>                       # Show tool details and arguments
```

## Core Commands

```bash
moltbrowser open [url]             # open browser, optionally navigate
moltbrowser goto <url>             # navigate to a URL
moltbrowser click <ref>            # click element by ref from snapshot
moltbrowser dblclick <ref>         # double click
moltbrowser type <text>            # type text into focused element
moltbrowser fill <ref> <text>      # fill a specific element
moltbrowser press <key>            # press key (Enter, ArrowDown, etc.)
moltbrowser select <ref> <val>     # select dropdown option
moltbrowser check <ref>            # check checkbox/radio
moltbrowser uncheck <ref>          # uncheck checkbox
moltbrowser hover <ref>            # hover over element
moltbrowser drag <from> <to>       # drag and drop
moltbrowser upload <file>          # upload file
moltbrowser snapshot               # capture page snapshot (get element refs)
moltbrowser screenshot             # take screenshot
moltbrowser eval <expr> [ref]      # evaluate JavaScript
moltbrowser close                  # close browser
```

## Navigation

```bash
moltbrowser go-back                # browser back
moltbrowser go-forward             # browser forward
moltbrowser reload                 # reload page
```

## Keyboard & Mouse

```bash
moltbrowser press Enter
moltbrowser keydown Shift
moltbrowser keyup Shift
moltbrowser mousemove 150 300
moltbrowser mousedown
moltbrowser mouseup
moltbrowser mousewheel 0 100
```

## Tabs

```bash
moltbrowser tab-list               # list all tabs
moltbrowser tab-new [url]          # open new tab
moltbrowser tab-close [index]      # close tab
moltbrowser tab-select <index>     # switch to tab
```

## Sessions

```bash
moltbrowser -s=mysite open https://example.com    # named session
moltbrowser -s=mysite click e5                     # use named session
moltbrowser list                                   # list all sessions
moltbrowser close-all                              # close all browsers
```

## Contributing Tools

When you use manual commands (click, fill, etc.) on a site, contribute tools for others:

```bash
moltbrowser contribute-create --domain=example.com --url-pattern="example.com/search" --title="Example Search"
moltbrowser contribute-add-tool --config-id=<id> --name=search-items --description="Search for items" --selector="#search" --fields='[{"name":"query","selector":"#search-input","type":"text"}]'
moltbrowser contribute-vote --config-id=<id> --name=search-items --vote=up
```

## Snapshots

After each command, moltbrowser provides a page snapshot. Use element refs (e.g., e15) from snapshots to interact with specific elements.

```bash
> moltbrowser goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.moltbrowser/page-2026-03-23T12-00-00.yml)
### Hub Tools (2 available)
- search: Search for content
- get-links: Extract all links from page
```

## Configuration

```bash
moltbrowser open --headed            # show browser window
moltbrowser open --browser=firefox   # use specific browser
moltbrowser open --persistent        # persist browser profile
moltbrowser open --config=conf.json  # use config file
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MOLTBROWSER_SESSION` | Default session name |
| `HUB_API_KEY` | API key for hub operations |
| `HUB_URL` | Override hub URL |
