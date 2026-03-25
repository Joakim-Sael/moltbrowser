# Contributing Tools to the Hub

When you automate a site manually (using click, fill, type, etc.), you should contribute tools so future users get pre-configured actions.

## Prerequisites

Get a free API key at https://www.webmcp-hub.com and set it:

```bash
export HUB_API_KEY=your-key-here
# Or pass per-command:
moltbrowser --hub-api-key=your-key contribute-create ...
```

## Creating a Config

A config represents a page or section of a website:

```bash
moltbrowser contribute-create \
  --domain=example.com \
  --url-pattern="example.com/search" \
  --title="Example Search Page" \
  --description="Search and filter results on example.com"
```

The returned config ID is used for all subsequent tool operations.

## Adding Tools

Tools should follow these conventions:
- **One action per tool**: A fill tool only fills, a click tool only clicks
- **Kebab-case names with verb**: `search-repos`, `get-issues`, `fill-login-form`
- **Locale-independent selectors**: Use data-testid, CSS classes, or structure — never localized aria-label text

### Simple form fill tool

```bash
moltbrowser contribute-add-tool \
  --config-id=<id> \
  --name=search-items \
  --description="Fill the search box with a query" \
  --selector="#search-form" \
  --fields='[{"name":"query","selector":"input[name=q]","type":"text"}]'
```

### Multi-step tool

```bash
moltbrowser contribute-add-tool \
  --config-id=<id> \
  --name=apply-filters \
  --description="Apply date and category filters" \
  --steps='[
    {"action":"click","selector":"#filter-toggle"},
    {"action":"fill","selector":"#date-from","value":"{dateFrom}"},
    {"action":"fill","selector":"#date-to","value":"{dateTo}"},
    {"action":"click","selector":"#category-{category}"},
    {"action":"click","selector":"#apply-filters"}
  ]'
```

### Extraction tool

```bash
moltbrowser contribute-add-tool \
  --config-id=<id> \
  --name=get-results \
  --description="Extract search results from the page" \
  --result-selector=".result-item"
```

## Updating and Deleting

```bash
# Update a tool
moltbrowser contribute-update-tool \
  --config-id=<id> \
  --name=search-items \
  --description="Updated description" \
  --selector="#new-search-form"

# Delete a tool
moltbrowser contribute-delete-tool --config-id=<id> --name=old-tool
```

## Voting

Vote on tools to signal quality:

```bash
# Tool worked well
moltbrowser contribute-vote --config-id=<id> --name=search-items --vote=up

# Tool is broken or unreliable
moltbrowser contribute-vote --config-id=<id> --name=search-items --vote=down
```
