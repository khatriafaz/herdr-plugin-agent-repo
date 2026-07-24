# Agent Repo Header for Herdr

Shows each coding agent pane as:

```text
pi - repo-name - branch-name
```

The plugin uses Herdr's pane metadata API, so the title appears directly in the
pane's top border. It refreshes existing agents when Herdr starts and updates
titles when agents are detected, change status, or receive focus.

## Requirements

- Herdr 0.7.5 or newer
- Node.js 18 or newer
- Git (branch details are omitted outside a Git repository)

## Install

```sh
herdr plugin install khatriafaz/herdr-plugin-agent-repo
herdr plugin action invoke refresh --plugin afaz.agent-repo-header
```

## Install for local development

```sh
herdr plugin link "$PWD"
```

Linking does not run the startup hook immediately. Refresh all existing agent
panes once after linking:

```sh
herdr plugin action invoke refresh --plugin afaz.agent-repo-header
```

Restarting Herdr also applies the titles through the plugin's startup hook.

## Optional agent-list layout

The plugin also reports `$header`, `$repo`, and `$branch` metadata tokens. To
show the exact formatted title in Herdr's agent sidebar, add this to
`~/.config/herdr/config.toml`:

```toml
[ui.sidebar.agents]
rows = [["state_icon", "workspace", "tab"], ["$header"]]
```

This preserves Herdr's original workspace row and changes the original agent
row from `agent` to `agent - repo - branch`.

## Development

```sh
npm test
herdr config check
```
