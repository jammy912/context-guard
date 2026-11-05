# Work Log Share

把一次 AI 協作儲存成下次能接著用的工作日誌：除了“做了什麼”，還留下“為什麼”“試過什麼”“哪些事是故意沒做”。

這是一個獨立的 Markdown skill，不依賴 Obsidian、Tana、MCP、API key 或額外指令碼。適用於具備本地檔案讀寫能力的 AI agent。Experimental / best-effort，歡迎按自己的日誌習慣調整。

## 安裝

隨 context-guard 外掛安裝時，這個 skill 已經內建，不用再複製。下面的步驟只用於單獨使用它。

下載並解壓後，把整個 `work-log-share` 資料夾放進你所使用宿主的 skill 目錄。選擇一個宿主即可：

- Codex：`~/.agents/skills/work-log-share/SKILL.md`
- Claude Code：`~/.claude/skills/work-log-share/SKILL.md`

上面顯示的是**安裝後 SKILL.md 的位置**，不是日誌儲存目錄。若你的團隊已有統一的原始碼與掛載方式，沿用其規範。這裡指本機 Codex 或 Claude Code 的檔案目錄，不是 Cowork 雲端安裝位置。重新開啟會話，確認宿主能找到 `work-log-share`。Codex 可顯式輸入 `$work-log-share`，Claude Code 可輸入 `/work-log-share`。

## 使用

在完成一段實際工作後說：

> 使用 work-log-share，把這次會話寫成工作日誌，儲存到當前專案的 logs 目錄。

要換會話繼續工作時說：

> 使用 work-log-share，生成交接日誌，把恢復會話的提示詞也寫進檔案。下次我要從這裡繼續。

不需要先填一套表格。Skill 會用當前對話理解任務，儲存必要的過程、取捨、證據及未完成事項。可以指定更詳細的日誌、語言、格式和路徑。

## 輸入和輸出

**輸入**：當前會話，以及這次工作明確關聯的筆記、檔案或驗證結果。它不能恢復從未提供、也沒有留存的歷史上下文。

**輸出**：一份普通 `.md` 檔案。預設寫入工作專案的已有日誌目錄，沒有約定則用 `logs/`。交接模式把恢復提示詞放在同一檔案末尾；複製到能訪問這些引用檔案的新會話即可繼續；換電腦時也需要帶上相關檔案。

這個 skill 只負責日誌，不要求額外 Git commit、記憶更新、任務狀態修改或對外發送；宿主的獨立規則仍可能執行其他動作。個人資訊可能本來就在工作材料裡；日誌寫入本地不等於已經適合公開分享。

## 接到你自己的系統上

這版只負責把一篇日誌寫準確。作者的私用版本在寫完日誌之後還會做幾件收尾，每件防一種具體的返工；分享版把它們去掉，是因為它們綁死了作者自己的工具，不是因為這些事不該做。有對應返工的再補，沒有就別補。

| 去掉的段 | 它防的返工 | 你的等價物 |
|---|---|---|
| 檔案回鏈 | 日誌寫了沒人找得到，幾個月後同一個問題重查一遍 | 專案 README 或 wiki 首頁加一行連結；或在日誌目錄維護索引 |
| 任務系統寫回 | 日誌說做完了、任務板還開著 | Linear、Jira、GitHub Issue、Notion 的更新，作為一個單獨的明確動作；不放心自動寫就先生成候選 |
| 狀態對賬 | 新會話冷啟動，先花十分鐘重新解釋背景 | CLAUDE.md 或 AGENTS.md 裡一個「當前焦點」塊，或一條置頂筆記 |
| 操作性結論進 SOP | 方法埋在日期日誌裡，日後花同樣的成本重查 | 一個 runbook 或團隊 wiki 頁；判據：這輪有沒有「以後照這麼做」的結論？ |
| 系統改造寫 Changelog | 系統用法變了，沒人知道從哪天起變的 | 倉庫的 CHANGELOG.md |
| 壓縮前自動快照 | 上下文被壓掉了，證據比日誌先沒 | Claude Code 或 Codex 的 PreCompact hook；或壓縮前先寫一次日誌 |
| 宿主專屬命令塊 | 無 | 換成你宿主的對應命令 |
| 固定 frontmatter | 跨專案回看要一篇篇翻 | 任何你的工具能查詢的一致後設資料 |

## 關於模型適配

這版把日誌的核心目標和證據邊界留在主檔案，讓模型根據任務決定篇幅與章節；不要求每個會話填滿空欄目，也不把個人工作流的額外動作作為通用規則。可在 GPT-6 Astra 等支援 skills 的模型上使用；它沒有要求模型專屬 API，也不承諾換模型後一定更快或更好。

安裝路徑參考：[Codex skills](https://developers.openai.com/codex/skills#where-to-save-skills)、[Claude Code skills](https://code.claude.com/docs/en/skills#choose-where-skills-load)。
