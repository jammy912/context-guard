# statusline（Windows 修補版）

Claude Code 的 status line 腳本，改自 [kcchien/claude-code-statusline](https://github.com/kcchien/claude-code-statusline)（MIT，原授權見 `LICENSE-upstream`）。
這個資料夾跟 context-guard plugin 無關，安裝 plugin 不會套用它，要用請照下面手動設定。

```
◆ Opus 5.5 [high] │ ██░░░░░░░░ 21% 1M │ $3.20 │ 45m12s │ 5h 33%(18:30)  7d 28%(11/07 六 10:00)
⎇main* │ +120/-34 │ myproj │ 🤖 myproj-12
```

subagent 執行時，prompt 下方的 agent 列會顯示各自的 context 用量：

```
⚙ tddworker Opus 5.5 [high] ███░░░░░░░ 30% 303.5k/1M · 12m24s · 正在編輯 FooTests.cs
```

## 檔案

| 檔案 | 用途 | 對應設定 |
|---|---|---|
| `statusline.sh` | 主 status line（兩行） | `statusLine` |
| `subagent-statusline.sh` | agent panel 每個 subagent 一列 | `subagentStatusLine` |

## 安裝（Windows + Git Bash）

1. 需要 [jq](https://jqlang.org/download/)，放在 PATH 裡（例如 `%USERPROFILE%\.local\bin\jq.exe`）。
2. 把兩支腳本複製到 `%USERPROFILE%\.claude\`。
3. 在 `%USERPROFILE%\.claude\settings.json` 加入（路徑換成自己的；Windows 的 PATH 通常沒有 bash，所以寫 Git Bash 完整路徑，並且用正斜線）：

```json
"statusLine": {
  "type": "command",
  "command": "\"C:/Program Files/Git/bin/bash.exe\" C:/Users/<你>/.claude/statusline.sh"
},
"subagentStatusLine": {
  "type": "command",
  "command": "\"C:/Program Files/Git/bin/bash.exe\" C:/Users/<你>/.claude/subagent-statusline.sh"
}
```

macOS / Linux 直接寫 `~/.claude/statusline.sh` 即可（需 `chmod +x`）。

## 相對上游的修改

Windows 相容：
1. `jq.exe` 輸出 CRLF，`42\r` 會讓 bash 算術報 `invalid arithmetic operator` → jq 後面加 `tr -d '\r'`。
2. `stat -f %m` 是 BSD 語法 → 先試 GNU 的 `stat -c %Y`。
3. `workspace.current_dir` 是反斜線路徑 → 先把 `\` 換成 `/` 再取資料夾名。

顯示：

4. 沒有 `COLORTERM=truecolor` 時，進度條空格固定灰色（原版整條同色，低用量看起來像滿格）。
5. 模型名後顯示 effort，例如 `[high]`。
6. 5h／7d 用量加重置時間，7d 帶中文星期（不靠 locale）；用量 <50 綠、50–79 黃、≥80 紅。
7. 第二行尾顯示 session 名稱 `🤖 <name>`，就是其他 session 用 SendMessage 找你時用的名字。stdin JSON 沒有這個欄位，所以依 `session_id` 去查 `~/.claude/sessions/<pid>.json` 的 `name`。
8. `subagent-statusline.sh`：用官方 `subagentStatusLine` 的 `tokenCount` ÷ `contextWindowSize` 算出 context%；完成顯示 ✓、失敗 ✗；描述依終端寬度截斷，不會切壞中文。
   另顯示模型（`claude-opus-5-5` 縮成 `Opus 5.5`）與 effort（`[high]`，數字預算顯示成 `[8k]`）。
   effort 的來源：subagent 有指定（agent 定義或派工時）就用指定值；沒指定時 Claude Code 不會給這個欄位，但依官方文件，同模型的 subagent 會繼承 session 的 effort，所以主 status line 每次執行會把 session 的模型與 effort 記到 `/tmp/claude-statusline-sess-<session_id>`，subagent 列在「沒指定且同模型」時補上這個值。不同模型（例如 Haiku）不顯示。

## 已知問題

- git 快取 `/tmp/claude-statusline-git-cache` 沒有依目錄區分（上游就是這樣）。多個 session 在 5 秒內刷新時，可能短暫顯示別的目錄的 branch。
- resume 或 compact 之後，到下一次 API 回應前拿不到 context 用量，會顯示 0%。
- 狀態列只在有事件時刷新；session 閒置時（例如在等背景 subagent）畫面不會動，需要時可在 `statusLine` 加 `"refreshInterval": <秒>`。
