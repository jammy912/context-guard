import { describe, expect, test } from 'claude-code/testing'

import {
  EMPTY_VIEW,
  DEFAULT_SETTINGS,
  applyReading,
  compactInstructions,
  fileLink,
  resumePrompt,
  isCompactUnavailable,
  isReminderShown,
  parseCommand,
  parseReport,
  readingOf,
  tiersFor,
  worklogPath,
  logPrompt,
  hasCompactMarker,
  LOG_SECTIONS,
} from '../hooks/logic'

describe('tiers', () => {
  test('75 announces 75, 85, 95', () => {
    expect(tiersFor(75)).toEqual([75, 85, 95])
  })
  test('65 announces every 10% from the threshold', () => {
    expect(tiersFor(65)).toEqual([65, 75, 85, 95])
  })
  test('a low test threshold steps by 10 up to 99', () => {
    expect(tiersFor(10)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90])
  })
  test('a threshold above 90 is its own only tier', () => {
    expect(tiersFor(97)).toEqual([97])
  })
})

describe('readings', () => {
  test('each tier is announced once', () => {
    let v = EMPTY_VIEW
    const steps: [number, boolean][] = [
      [60, false],
      [76, true],
      [80, false],
      [86, true],
      [88, false],
      [91, false],
      [96, true],
      [97, false],
    ]
    for (const [percent, isDue] of steps) {
      const r = applyReading(v, percent, 75)
      expect(r.isNewTier).toBe(isDue)
      v = r.view
    }
    expect(v.notifiedTier).toBe(95)
  })

  test('dropping under the threshold starts the tiers over', () => {
    let v = applyReading(EMPTY_VIEW, 80, 75).view
    v = { ...v, dismissedTier: 75 }
    v = applyReading(v, 20, 75).view
    expect(v.notifiedTier).toBe(null)
    expect(v.dismissedTier).toBe(null)
    expect(applyReading(v, 77, 75).isNewTier).toBe(true)
  })

  test('「稍後」 hides the band until the next tier', () => {
    let v = applyReading(EMPTY_VIEW, 78, 75).view
    expect(isReminderShown(v, DEFAULT_SETTINGS)).toBe(true)
    v = { ...v, dismissedTier: v.tier }
    expect(isReminderShown(v, DEFAULT_SETTINGS)).toBe(false)
    v = applyReading(v, 86, 75).view
    expect(isReminderShown(v, DEFAULT_SETTINGS)).toBe(true)
  })

  test('off hides the band', () => {
    const v = applyReading(EMPTY_VIEW, 90, 75).view
    expect(isReminderShown(v, { ...DEFAULT_SETTINGS, isEnabled: false })).toBe(false)
  })
})

describe('report', () => {
  const answer = [
    '日誌寫好了。',
    '<<<CONTEXT-GUARD',
    'log: /home/user/project/logs/2026-10-09-a.md',
    'goal：做完 context-guard',
    'pending: 裝到 user scope；終端實測',
    'CONTEXT-GUARD>>>',
  ].join('\n')

  test('reads the block', () => {
    expect(parseReport(answer)).toEqual({
      goal: '做完 context-guard',
      pending: '裝到 user scope；終端實測',
    })
  })

  test('takes the last block and strips backticks', () => {
    const two = `${answer}\n<<<CONTEXT-GUARD\ngoal: \`第二塊\`\nCONTEXT-GUARD>>>`
    expect(parseReport(two)?.goal).toBe('第二塊')
  })

  test('no block is no report; a missing field reads 未給出', () => {
    expect(parseReport('寫好了')).toBe(null)
    expect(parseReport('<<<CONTEXT-GUARD\nCONTEXT-GUARD>>>')).toEqual({ goal: '（未給出）', pending: '（未給出）' })
  })

  test('the compaction names the log path the guard chose', () => {
    const r = parseReport(answer)
    expect(r).not.toBe(null)
    if (r) expect(compactInstructions(r, '/home/user/.claude/worklogs/s1.md')).toContain('/home/user/.claude/worklogs/s1.md')
  })
})

describe('worklog path', () => {
  test('POSIX home', () => {
    expect(worklogPath('/home/user', 's1')).toBe('/home/user/.claude/worklogs/s1.md')
    expect(worklogPath('/home/user/', 's1')).toBe('/home/user/.claude/worklogs/s1.md')
  })

  test('Windows home keeps backslashes', () => {
    expect(worklogPath(String.raw`C:\Users\me`, 's1')).toBe(String.raw`C:\Users\me\.claude\worklogs\s1.md`)
    expect(worklogPath('C:\\Users\\me\\', 's1')).toBe(String.raw`C:\Users\me\.claude\worklogs\s1.md`)
  })

  test('the log prompt names the path and every section in order', () => {
    const text = logPrompt('n1', 80, '/home/user/.claude/worklogs/s1.md')
    expect(text).toContain('/home/user/.claude/worklogs/s1.md')
    expect(text).toContain(LOG_SECTIONS.map(s => `## ${s}`).join('、'))
    expect(text).not.toContain('log:')
    expect(text).toContain('背景執行的 agent')
  })

  test('the compact marker counts only as the last non-empty line', () => {
    expect(hasCompactMarker('節點結案。\n<<<CONTEXT-GUARD-COMPACT>>>\n\n')).toBe(true)
    expect(hasCompactMarker('  <<<CONTEXT-GUARD-COMPACT>>>  ')).toBe(true)
    expect(hasCompactMarker('<<<CONTEXT-GUARD-COMPACT>>>\n後面還有字')).toBe(false)
    expect(hasCompactMarker('輸出 <<<CONTEXT-GUARD-COMPACT>>> 就會壓縮')).toBe(false)
    expect(hasCompactMarker('')).toBe(false)
  })

  test('a Windows drive path links as file:///C:/…, named after the last separator', () => {
    expect(fileLink(String.raw`C:\Users\me\.claude\worklogs\s1.md`)).toBe('[s1.md](file:///C:/Users/me/.claude/worklogs/s1.md)')
  })
})


describe('command', () => {
  test('parses each form', () => {
    expect(parseCommand('')).toEqual({ kind: 'status' })
    expect(parseCommand('threshold 10')).toEqual({ kind: 'threshold', value: 10 })
    expect(parseCommand('off')).toEqual({ kind: 'enable', isEnabled: false })
    expect(parseCommand('on')).toEqual({ kind: 'enable', isEnabled: true })
    expect(parseCommand('intercept on')).toEqual({ kind: 'intercept', isOn: true })
    expect(parseCommand('reset')).toEqual({ kind: 'reset' })
    expect(parseCommand('resume off')).toEqual({ kind: 'resume', isOn: false })
  })
  test('refuses bad thresholds', () => {
    expect(parseCommand('threshold 0').kind).toBe('error')
    expect(parseCommand('threshold 100').kind).toBe('error')
    expect(parseCommand('threshold abc').kind).toBe('error')
    expect(parseCommand('bogus').kind).toBe('error')
  })
})

describe('compaction refusals', () => {
  test('an SDK session refusal falls back at once, a busy turn does not', () => {
    const sdk =
      'HooksError: context-guard: $.session.compact: not available in a headless (-p / SDK) session yet: compaction here runs inside a turn (a /compact prompt); catch it and carry on'
    expect(isCompactUnavailable(sdk)).toBe(true)
    expect(isCompactUnavailable('HooksError: a turn is running')).toBe(false)
  })
})

describe('resume', () => {
  const log = [
    '# 日誌',
    '## 總結',
    '做完了一半',
    '## 恢復會話',
    '',
    '> 下次 `/clear` 後貼上以下內容繼續工作：',
    '',
    '請閱讀工作日誌 /a/b.md 繼續工作。',
    '下一步任務：',
    '- 寫 README',
  ].join('\n')

  test('sends the recovery section as written, without the paste note', () => {
    const text = resumePrompt(log, '/a/b.md')
    expect(text.startsWith('請閱讀工作日誌 /a/b.md 繼續工作。\n下一步任務：\n- 寫 README')).toBe(true)
    expect(text).not.toContain('貼上以下內容')
    expect(text).not.toContain('做完了一半')
    expect(text).toContain('按原計畫繼續執行剩餘事項')
    expect(text).not.toContain('等我的下一條指令')
  })

  test('keeps the quoted lines that are the log\'s own words', () => {
    const text = resumePrompt(`${log}\n> 約束：不要動 main 分支，只在 dev 上提交`, '/a/b.md')
    expect(text).toContain('> 約束：不要動 main 分支，只在 dev 上提交')
    expect(text).not.toContain('貼上以下內容')
  })

  test('a heading inside a code block does not end the section', () => {
    const text = resumePrompt(`${log}\n\`\`\`bash\n# 先跑測試\nnpm test\n\`\`\`\n- 再提交`, '/a/b.md')
    expect(text).toContain('# 先跑測試')
    expect(text).toContain('- 再提交')
  })

  test('stops at the next section', () => {
    expect(resumePrompt(`${log}\n## 附錄\n別帶上我`, '/a/b.md')).not.toContain('別帶上我')
  })

  test('points at the log when the section is missing or unreadable', () => {
    expect(resumePrompt('# 只有標題', '/a/b.md')).toContain('/a/b.md')
    expect(resumePrompt(null, '/a/b.md')).toContain('「恢復會話」')
  })

  test('the band link escapes spaces and brackets', () => {
    expect(fileLink('/x/2026 日誌 (a).md')).toBe('[2026 日誌 (a).md](file:///x/2026%20%E6%97%A5%E8%AA%8C%20%28a%29.md)')
  })
})

describe('reading', () => {
  test('measures against a smaller compaction window', () => {
    const r = readingOf({ tokens: 359863, window: 1000000, percent: 36, breakdown: { rawMaxTokens: 400000 } })
    expect(r).toEqual({ percent: 90, tokens: 359863, window: 400000, isCompactWindow: true })
  })
  test('falls back to the model window without a breakdown or a smaller window', () => {
    expect(readingOf({ tokens: 300, window: 1000, percent: 30 }).percent).toBe(30)
    expect(readingOf({ tokens: 300, window: 1000, percent: 30, breakdown: { rawMaxTokens: 1000 } }).isCompactWindow).toBe(false)
  })
  test('no tokens yet is no reading', () => {
    expect(readingOf({ window: 1000, breakdown: { rawMaxTokens: 400 } }).percent).toBe(undefined)
  })
})
