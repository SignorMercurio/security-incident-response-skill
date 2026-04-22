# security-incident-response

A Claude Code skill for security incident response. Runs read-only forensic commands on compromised hosts through the SIREN MCP server, reconstructs attack chains, and produces incident reports mapped to MITRE ATT&CK.

Reports and supporting materials are generated in Simplified Chinese by design (the skill targets Chinese-speaking SOC teams); this README is in English for discoverability.

## Features

- **Two investigation modes** — alarm-driven (UID + Event ID) or free-form (host anomaly only)
- **12 attack-type playbooks** + **6 tradecraft guides** + **MITRE ATT&CK mapping**
- **Parallel command orchestration** — independent remote commands are dispatched in a single round to cut investigation time
- **Strictly read-only** — only `cat / grep / find / ls / ps / netstat / lsof` and similar read-only commands are allowed; evidence integrity is preserved
- **Self-contained HTML report** — each incident produces a directory `IR-{YYYYMMDD}-{hostname}-{event_type}[-{event_id}]/` containing a standalone HTML report (plus its CSS/JS/fonts); open `index.html` in a browser to view, or use the built-in "⤓ 导出 PDF" button to generate a shareable PDF

## Prerequisites

- **Claude Code** — latest stable
- **SIREN MCP server** — the skill depends on the `mcp__siren__ls`, `mcp__siren__run`, and `mcp__siren__get_alarm_detail` tools for remote command execution and alarm detail fetching. Configure SIREN as an MCP server in Claude Code before using this skill.

## Install

### Option 1 — `npx skills` (recommended)

Uses the community CLI [vercel-labs/skills](https://github.com/vercel-labs/skills):

```bash
npx skills add SignorMercurio/security-incident-response-skill
```

### Option 2 — `npx openskills`

Uses [openskills](https://github.com/numman-ali/openskills), installing at user scope:

```bash
npx openskills install SignorMercurio/security-incident-response-skill --global
```

### Option 3 — `git clone`

```bash
git clone https://github.com/SignorMercurio/security-incident-response-skill.git \
  ~/.claude/skills/security-incident-response
```

### Option 4 — `rsync` (for internal servers or air-gapped environments)

```bash
rsync -avz --exclude '.git' ./security-incident-response-skill/ \
  <host>:~/.claude/skills/security-incident-response/
```

After install, run `/skills` inside Claude Code to confirm the skill is loaded. It activates automatically when the context matches and can also be invoked explicitly.

## Usage

### Alarm-driven mode

Provide:
- Aliyun tenant **UID**
- Alarm **Event ID**
- SIREN **Client ID** (if omitted, the skill lists available clients for you to pick)

The skill pulls the alarm detail and runs the matching playbook end to end.

### Free-form mode

When there is no alarm ID, provide the Client ID plus a short description of the anomaly (e.g. "process X at 100% CPU", "suspicious file at /tmp/x.sh"). The skill starts from broad triage and narrows down from there.

## Layout

```
.
├── SKILL.md                        # Skill definition and workflow
├── assets/
│   └── report-template/            # Self-contained HTML report template
│       ├── index.html              # The report page (fill its data slots)
│       ├── editor.css / editor.js  # In-browser editing + PDF export runtime
│       └── assets/                 # Logo + Noto Serif/Sans SC + JetBrains Mono fonts
└── references/
    ├── invest_*.md                 # 12 attack-type playbooks (loaded on demand)
    ├── tech_*.md                   # 6 tradecraft guides (loaded on demand)
    └── attack_framework.md         # ATT&CK tactic/technique reference
```

Files under `references/` are loaded on demand — the skill reads only the playbooks and tradecraft guides relevant to the current alarm or scenario, keeping the context window from being flooded on the first turn.

## Output examples

The skill writes a directory into the cwd:

- `IR-20260417-web01-webshell-123456/` — alarm-driven, Event ID `123456`
- `IR-20260417-db-prod-rce/` — free-form mode

Each directory is a self-contained copy of `assets/report-template/` with `index.html` edited to reflect the specific incident. Double-click `index.html` to view in a browser, or click **⤓ 导出 PDF** in the top-right toolbar to export a shareable PDF named `{客户}-安全事件应急响应报告-{YYYYMMDD}-{seq}.pdf`.

The full event-type slug table (`webshell` / `miner` / `revshell` / `brute` / `abnlogin` / `privesc` / `exfil` / `ransom` / `sqli` / `rce` / `backdoor` / `unknown`) is documented in `SKILL.md` §7.1.

## Contributing

Playbooks and tradecraft guides live in `references/`, the HTML report template in `assets/report-template/`. Playbooks and guides are plain Markdown — PRs adding new attack types or refining command snippets are welcome. Template changes should be made in the upstream `ir-report` source project and then synced into this skill.
