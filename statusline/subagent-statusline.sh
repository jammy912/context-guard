#!/usr/bin/env bash
# ~/.claude/subagent-statusline.sh — 自訂 agent panel 每一列（settings.json 的 subagentStatusLine）
# stdin：{ columns, tasks:[{id,name?,agentType,status,label,startTime,model?,contextWindowSize?,tokenCount,...}] }
# stdout：每列一行 {"id":..., "content":...}；不輸出的列維持預設顯示（jq 不在或出錯 = 全部預設）
# 顯示：⚙ tddworker Opus 5.5 [high] ██░░░░░░░░ 30% 303.5k/1M · 12m24s · 正在編輯 TWS005Tests.cs …
#   model/effort 欄位沒給就不顯示（effort 只有 agent 定義或派工時有指定才會有）
#   context% 顏色：<70 綠、70–89 黃、≥90 紅（同主 status line）；字串截斷在 jq 內做（以字元為單位，不切壞中文）

command -v jq >/dev/null 2>&1 || exit 0

jq -c '
  def esc(c): "\u001b[" + c + "m";
  def rst: esc("0");
  def ktok: if . >= 1000 then ((. / 100 | floor) / 10 | tostring) + "k" else tostring end;
  def wlabel: if . >= 1000000 then ((. / 1000000 | floor) | tostring) + "M" else ((. / 1000 | floor) | tostring) + "k" end;
  def dur: (. | floor) as $s | if $s >= 3600 then "\($s / 3600 | floor)h\(($s % 3600) / 60 | floor)m"
           else "\($s / 60 | floor)m\($s % 60)s" end;
  # 模型 ID 縮寫：claude-opus-5-5 → Opus 5.5；去掉 [1m] 之類後綴與日期版號
  def mshort: sub("^claude-"; "") | sub("\\[.*$"; "") | split("-") as $p
              | ($p[0] | (.[0:1] | ascii_upcase) + .[1:])
                + ([$p[1:][] | select(test("^[0-9]{1,2}$"))] | .[0:2] | if length > 0 then " " + join(".") else "" end);
  # effort：字串（low/medium/high/xhigh/max）或數字 token 預算
  def eff: if type == "number" then ktok else tostring end;

  (.columns // 120) as $cols
  | .tasks[]?
  | (.tokenCount // 0) as $t
  | (.contextWindowSize // 0) as $w
  | (if $w > 0 then ($t * 100 / $w | floor) else -1 end) as $p
  | (if $p >= 90 then esc("31") elif $p >= 70 then esc("33") else esc("32") end) as $pc
  | (if $p >= 0 then ([$p / 10 | floor, 10] | min) else 0 end) as $fill
  | (if $p >= 0
       then $pc + ("█" * $fill // "") + esc("90") + ("░" * (10 - $fill) // "") + rst
            + " " + $pc + "\($p)%" + rst + esc("90") + " " + ($t | ktok) + "/" + ($w | wlabel) + rst
       else esc("90") + ($t | ktok) + " tokens" + rst end) as $ctx
  | (if .status == "running" then "" elif .status == "completed" then esc("32") + "✓ " + rst
     else esc("31") + "✗ " + rst end) as $st
  | ((now - ((.startTime // (now * 1000)) / 1000)) | if . < 0 then 0 else . end | dur) as $el
  | (.label // .description // "") as $lb
  | ((if .model then " " + esc("36") + (.model | mshort) + rst else "" end)
     + (if .effort != null then " " + esc("90") + "[" + (.effort | eff) + "]" + rst else "" end)) as $me
  | ((($cols - 75) / 2 | floor) | if . < 8 then 8 else . end) as $max
  | (if ($lb | length) > $max then $lb[0:$max] + "…" else $lb end) as $lbt
  | {id: .id,
     content: ($st + esc("93") + "⚙ " + (.name // .agentType // "agent") + rst + $me
               + " " + $ctx + esc("90") + " · " + $el + " · " + rst + $lbt)}
' 2>/dev/null | tr -d '\r'
