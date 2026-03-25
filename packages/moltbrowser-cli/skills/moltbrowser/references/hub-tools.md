# Hub Tools Reference

Hub tools are pre-configured, community-tested browser automation actions discovered automatically when you navigate to a website.

## How It Works

1. `moltbrowser open <url>` or `moltbrowser goto <url>` triggers a hub lookup
2. The WebMCP Hub returns tools matching the domain and URL pattern
3. Tools are cached locally in `.moltbrowser/hub-state.json`
4. Use `moltbrowser hub-execute <tool>` to run them

## Hub Tool Lifecycle

```bash
# 1. Navigate — tools are discovered automatically
moltbrowser goto https://github.com
# Output includes:
# ### Hub Tools (3 available)
# - search-repos (query): Search for repositories
# - get-trending: Get trending repositories
# - get-repo-info (owner, repo): Get repository details

# 2. List tools (in case you need to see them again)
moltbrowser hub-list

# 3. Inspect a tool's arguments and details
moltbrowser hub-info search-repos

# 4. Execute
moltbrowser hub-execute search-repos --query="react testing"

# 5. Vote on quality
moltbrowser contribute-vote --config-id=<id> --name=search-repos --vote=up
```

## Why Prefer Hub Tools

- **Pre-tested selectors**: No need to inspect the DOM or guess at selectors
- **Community maintained**: Tools are updated as sites change
- **Token efficient**: One command vs. multiple snapshot/click/fill cycles
- **Reliable**: Execution is translated to proper Playwright code with framework-compatible interactions

## When Hub Tools Aren't Available

If no hub tools exist for a page:
1. Use standard Playwright commands: `snapshot`, `click`, `fill`, `type`, etc.
2. After completing your task, contribute tools so the next person benefits:
   ```bash
   moltbrowser contribute-create --domain=example.com --url-pattern="example.com/page" --title="Page Title"
   moltbrowser contribute-add-tool --config-id=<id> --name=action-name --description="What it does" ...
   ```

## Passing Arguments

Hub tools accept arguments via `--key=value` flags:

```bash
# Single argument
moltbrowser hub-execute search --query="test"

# Multiple arguments
moltbrowser hub-execute create-issue --title="Bug report" --body="Description here" --label="bug"

# Boolean flags
moltbrowser hub-execute toggle-setting --enabled=true
```
