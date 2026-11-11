# context-guard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Status: Experimental](https://img.shields.io/badge/Status-Experimental-orange.svg)

A Claude Code mod that warns you before your context fills up, and on one click writes a work log, compacts, then hands the log's resume prompt back to the session, so a long task survives compaction.

> **這是 [axtonliu/context-guard](https://github.com/axtonliu/context-guard) 的 fork。** 和原版的差異：
>
> - 介面、prompt、skill 全部改為繁體中文（台灣用語）。
> - 日誌固定存在 `~/.claude/worklogs/<session_id>.md`（Windows 為 `%USERPROFILE%\.claude\worklogs\`），不寫進專案目錄，避免含主機、帳號、客戶資料的日誌跟著 git 進 repo。路徑由 mod 自己決定，不再從模型回報的 `log:` 讀取。
> - 日誌固定段落：`## 目標`、`## 進度`、`## 決策`、`## 刻意不做的事`、`## 死路`、`## 剩餘事項`、`## 恢復會話`。
> - 修正 Windows：原版只接受 `/` 開頭的絕對路徑，`C:\...` 會被判定找不到日誌而永遠不壓縮；日誌連結改為 `file:///C:/...`。

## Status

> **Status: Experimental**
>
> - A small prototype I use every day. It works for my sessions, but it has not been tested across every Claude Code version and setup.
> - The quality of the log depends on the model writing it.
> - Low-maintenance project. If something breaks, please open an issue with a reproducible case (steps, Claude Code version, CLI or Desktop, and the output of `/context-guard`). That output includes local file paths and the first words of prompts sent while a log was being written, so remove anything private before posting.

## Why

On a long task, automatic compaction keeps a summary but loses the details you need to keep going: what was decided, why, which ideas were dropped, and what is left. context-guard makes the order explicit: write the log first, check it is on disk, then compact, then resume from the log.

## What it does

When the context passes a threshold (75% by default), a band appears above the prompt:

> 上下文已用 X%，做完目前的任務後建議寫日誌並壓縮　（按 Ctrl+X 再按 Tab 聚焦這一列，然後按括號內的鍵）［寫日誌並壓縮 (w)］［稍後 (l)］

Where the terminal does not pass mouse clicks through, press Ctrl+X then Tab to focus the band, then the key in brackets: `w` writes the log and compacts, `l` is Later, `k` dismisses a message, `c` cancels a running flow.

The band's text is in Chinese (it says "Context is X% used; when you finish the current task, consider writing a log and compacting", with the buttons "Write log and compact" and "Later"). The prompts it sends into the session and the bundled skill are in Chinese too, so the log comes out in Chinese unless you ask for another language.

It only reminds. Nothing happens until you press the button. Each tier (the threshold, then every 10% above it below 100, e.g. 65 / 75 / 85 / 95) is announced once, and 「稍後」 (Later) hides the band until the next tier.

The one exception is a marker the model writes itself. When an answer's last non-empty line is exactly `<<<CONTEXT-GUARD-COMPACT>>>` and the fill is at or above the threshold, the guard runs the same flow as the button: log, compact, resume. Below the threshold, or with the guard off, the marker is ignored. This is meant for long unattended work, where the model writes the marker at a safe point (a finished step, no background agent still running) and the guard decides on the fill, which the model cannot see. Put the rule for when to write it in that work's own instructions. Sessions that never write the marker keep the remind-only behavior.

The percentage is measured against the auto-compact window when you set one smaller than the model's window (for example 400k on a 1M model), which is the same figure Desktop's context popover shows. Otherwise it is measured against the model's window.

Pressing 「寫日誌並壓縮」 (Write log and compact):

1. Submits a prompt asking Claude to write a work log with the bundled `work-log-share` skill, to `~/.claude/worklogs/<session_id>.md` (the mod decides the path from the session id and the home folder). The log ends with a `## 恢復會話` (Resume session) section that can be pasted into a fresh session, and the answer ends with a `CONTEXT-GUARD` block naming the goal and what is left.
2. When that turn ends, checks the block and checks that the log file exists and was written after you pressed the button. If either check fails, it stops and tells you why. It does not compact.
3. Compacts, telling the summarizer the log's absolute path, the goal and the open items, so the summary keeps a pointer to the log.
4. After compaction, sends the log's `## 恢復會話` section as your next message, ending with "confirm the state, then carry on with the plan; stop for me only when the plan is done or a decision is mine". Work picks up by itself, and the session waits only when there is nothing left to do. The band shows the log path as a clickable link. Turn this off with `/context-guard resume off`.

In the CLI it compacts through the mod API. In Claude Desktop, where that call is not available, it queues `/compact` with the same instructions instead, and the compaction runs when the session is idle.

## The bundled log skill

The button is only a trigger. Whether you can pick the work back up depends on what the log keeps, so context-guard ships with `work-log-share`, a plain Markdown skill with no scripts or external services. Every log uses these sections, in order:

- `## 目標` (goal) and `## 進度` (progress, with how each claim was verified),
- `## 決策` (decisions and why) and `## 刻意不做的事` (deliberately not done, so the next session does not "fix" it),
- `## 死路` (dead ends: overturned judgments and failed attempts),
- `## 剩餘事項` (what is left) and `## 恢復會話` (resume section to paste into a new session).

You can also use it on its own: ask Claude to "use work-log-share to write a work log" at any point.

## Privacy and safety

- No network calls of its own and no hidden model calls. It only sends messages into your current session (the log prompt when you press the button, and the resume prompt after compaction) and uses Claude Code's own compaction.
- The only files it touches are the log it asked for: it checks that the file exists and reads its `## 恢復會話` section. It writes no files itself.
- `claude plugin validate .` lists every API call the mod makes, so you can check this yourself before installing.
- Settings are stored locally by Claude Code's plugin store.

## Installation

### Prerequisites

- Claude Code with plugin mods support (developed against Claude Code 2.1.296)

### Install from GitHub

```bash
claude plugin marketplace add jammy912/context-guard
claude plugin install context-guard@jammy912-mods --scope user
```

New sessions pick it up.

### Install from a local clone

```bash
git clone https://github.com/jammy912/context-guard.git
claude plugin marketplace add ./context-guard
claude plugin install context-guard@jammy912-mods --scope user
```

## Usage

```
/context-guard                    Status, threshold, current flow and its last 20 steps
/context-guard threshold <1-99>   Change the threshold (default 75)
/context-guard off | on           Turn reminders off / on (the command always works)
/context-guard intercept on|off   Skip the first automatic compaction of each session, to leave time for a log (default off)
/context-guard resume on|off      Send the log's resume prompt after compaction (default on)
/context-guard reset              Clear a stuck flow
```

Settings persist across sessions.

## Turn off or uninstall

- Pause reminders: `/context-guard off`
- Disable the mod: `claude plugin disable context-guard@jammy912-mods`
- Uninstall: `claude plugin uninstall context-guard@jammy912-mods --scope user`, then optionally `claude plugin marketplace remove jammy912-mods`

## File structure

```
context-guard/
├── .claude-plugin/
│   ├── plugin.json        Plugin manifest
│   ├── icon.png           Plugin icon
│   └── marketplace.json   Single-plugin marketplace, for installing from GitHub
├── skills/
│   └── work-log-share/    Bundled log skill (SKILL.md, README)
├── hooks/
│   ├── hooks.json         Registers the module
│   ├── logic.ts           Pure parts: tiers, report parsing, prompts, commands
│   └── register.tsx       Hooks and the band above the prompt
├── types/
│   └── index.d.ts         State types
└── tests/
    ├── logic.test.ts
    └── flow.test.ts
```

## Develop

```bash
claude plugin validate .
claude plugin test .
```

## Contributing

Contributions are welcome, within a low-maintenance scope:

- Reproducible bug reports (steps, Claude Code version, CLI or Desktop, `/context-guard` output with private paths removed)
- Documentation fixes
- Small PRs (fixes and docs)

Feature requests may not be acted on.

## License

MIT License. See [LICENSE](LICENSE).

---

## Author

**Axton Liu** - AI Educator & Creator

- Website: [axtonliu.ai](https://www.axtonliu.ai)
- YouTube: [@AxtonLiu](https://youtube.com/@AxtonLiu)
- Twitter/X: [@axtonliu](https://x.com/axtonliu)

### Learn More

- [MAPS™ AI Agent Course](https://www.axtonliu.ai/aiagent) - Systematic AI agent skills training
- [AI Elite Weekly Newsletter](https://www.axtonliu.ai/newsletters/ai-2) - Weekly AI insights
- [Free AI Course](https://www.axtonliu.ai/axton-free-course) - Get started with AI

---

© AXTONLIU™ & AI 精英学院™ 版权所有
