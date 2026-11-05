import type { GuardSettings, GuardView } from '../types'

export const DEFAULT_SETTINGS: GuardSettings = {
  isEnabled: true,
  threshold: 75,
  interceptAuto: false,
  autoResume: true,
}

export const EMPTY_VIEW: GuardView = {
  percent: null,
  tier: null,
  notifiedTier: null,
  dismissedTier: null,
  phase: 'idle',
  logTurnId: null,
  nonce: null,
  pressedAt: null,
  message: null,
  isError: false,
  logPath: null,
  instructions: null,
  isQueued: false,
  trace: [],
}

export type Reading = { percent?: number; tokens?: number; window: number; isCompactWindow: boolean }

/**
 * The fill measured against the window that matters: the compaction window when the
 * breakdown names one (an autoCompactWindow setting smaller than the model's), else the
 * model's own window as the status line counts it.
 */
export function readingOf(context: {
  tokens?: number
  window: number
  percent?: number
  breakdown?: { rawMaxTokens: number }
}): Reading {
  const compactWindow = context.breakdown?.rawMaxTokens
  if (compactWindow === undefined || compactWindow <= 0 || compactWindow >= context.window) {
    return { percent: context.percent, tokens: context.tokens, window: context.window, isCompactWindow: false }
  }
  const percent = context.tokens === undefined ? undefined : Math.round((context.tokens / compactWindow) * 100)
  return { percent, tokens: context.tokens, window: compactWindow, isCompactWindow: true }
}

const FIXED_TIERS = [85, 90, 95]

/** The tiers a threshold announces: the threshold itself, then 85, 90 and 95 above it. */
export function tiersFor(threshold: number): number[] {
  const all = [threshold, ...FIXED_TIERS.filter(t => t > threshold)]
  return [...new Set(all)].sort((a, b) => a - b)
}

/** The highest tier `percent` has reached, or null below the threshold. */
export function tierOf(percent: number, threshold: number): number | null {
  let reached: number | null = null
  for (const t of tiersFor(threshold)) {
    if (percent >= t) reached = t
  }
  return reached
}

/** Folds a new reading into the view; `isNewTier` says a toast is due. */
export function applyReading(
  view: GuardView,
  percent: number | undefined,
  threshold: number,
): { view: GuardView; isNewTier: boolean } {
  if (percent === undefined) {
    return { view: { ...view, percent: null, tier: null }, isNewTier: false }
  }
  const tier = tierOf(percent, threshold)
  if (tier === null) {
    // Back under the threshold (a compaction, a raised threshold): the tiers start over.
    return {
      view: { ...view, percent, tier: null, notifiedTier: null, dismissedTier: null },
      isNewTier: false,
    }
  }
  const isNewTier = view.notifiedTier === null || tier > view.notifiedTier
  return {
    view: { ...view, percent, tier, notifiedTier: isNewTier ? tier : view.notifiedTier },
    isNewTier,
  }
}

/** Whether the band shows the reminder (not counting a progress or outcome line). */
export function isReminderShown(view: GuardView, settings: GuardSettings): boolean {
  return (
    settings.isEnabled &&
    view.phase === 'idle' &&
    view.tier !== null &&
    (view.dismissedTier === null || view.tier > view.dismissedTier)
  )
}

export type LogReport = { goal: string; pending: string }

const BLOCK = /<<<CONTEXT-GUARD\s*([\s\S]*?)CONTEXT-GUARD>>>/g

/**
 * Where this session's work log lives: ~/.claude/worklogs/<session id>.md, outside every
 * project, so a log that names hosts or customers never lands in a repository. The separator
 * follows the home path, so Windows gets C:\Users\…\.claude\worklogs\….md.
 */
export function worklogPath(home: string, sessionId: string): string {
  const sep = home.includes('\\') ? '\\' : '/'
  const root = home.replace(/[\\/]+$/, '')
  return [root, '.claude', 'worklogs', `${sessionId}.md`].join(sep)
}

/** Reads the last CONTEXT-GUARD block from the model's answer; the log path is the guard's own. */
export function parseReport(answer: string): LogReport | null {
  const blocks = [...answer.matchAll(BLOCK)]
  const body = blocks.at(-1)?.[1]
  if (body === undefined) return null
  const field = (name: string): string => {
    const m = body.match(new RegExp(`^\\s*[-*]?\\s*${name}\\s*[:：]\\s*(.*)$`, 'm'))
    return (m?.[1] ?? '').trim().replace(/^`(.*)`$/, '$1').trim()
  }
  return { goal: field('goal') || '（未給出）', pending: field('pending') || '（未給出）' }
}

/** The sections every log carries, in this order; 恢復會話 comes last so the resume reads to the end. */
export const LOG_SECTIONS = ['目標', '進度', '決策', '刻意不做的事', '死路', '剩餘事項', '恢復會話'] as const

export function logPrompt(nonce: string, percent: number | null, logPath: string): string {
  const used = percent === null ? '' : `上下文已用 ${percent}%。`
  return [
    `[context-guard:${nonce}] ${used}請呼叫 work-log-share skill，用交接模式為目前的 session 寫工作日誌：`,
    `1. 存到這個路徑（整份覆寫）：${logPath}`,
    '   檔案已存在時（同一個 session 先前寫過），先讀舊內容，合併成一份完整日誌再覆寫；全檔只能有一個「## 恢復會話」。',
    `2. 用這些二級標題，依序：${LOG_SECTIONS.map(s => `## ${s}`).join('、')}；沒有內容的段寫「無」，不要省略標題。`,
    '3. 存檔後重新讀一次，確認檔案確實寫入磁碟。',
    '4. 不要自己執行 /compact，本輪結束後 context-guard 會自動壓縮。',
    '',
    '回覆的最後，原樣輸出下面這個區塊（不放進程式碼區塊，尖括號保留），context-guard 用它告訴壓縮摘要目前的目標：',
    '<<<CONTEXT-GUARD',
    'goal: <目前目標，一句話>',
    'pending: <剩餘事項，用「；」分隔，沒有就寫「無」>',
    'CONTEXT-GUARD>>>',
  ].join('\n')
}

export function compactInstructions(report: LogReport, logPath: string): string {
  return [
    `壓縮前已寫好工作日誌，完整記錄與恢復 prompt 都在：${logPath}`,
    `目前目標：${report.goal}`,
    `剩餘事項：${report.pending}`,
    '摘要裡必須原樣保留上面這個日誌的絕對路徑，並寫明：需要細節或恢復上下文時，先讀該日誌的「## 恢復會話」段。',
  ].join('\n')
}

/**
 * Whether a refused $.session.compact will never succeed in this session, as in Desktop Code,
 * which the engine runs as an SDK session: then /compact is the only way, so fall back at once.
 */
export function isCompactUnavailable(error: string): boolean {
  return /not available/i.test(error)
}

const RESUME_TAIL =
  '（context-guard 在壓縮後自動發出）恢復上下文後，先用幾句話確認你掌握的當前狀態和下一步，然後直接按原計畫繼續執行剩餘事項，不要停下來等我。只有原計畫已經全部完成、或下一步必須由我拍板時，才停下等我的指令。'

const PASTE_NOTE = /貼上|粘贴|\/clear/

/**
 * The prompt sent after a compaction: the log's own 恢復會話 section as written (without the
 * "paste this after /clear" note that opens it), or a pointer to it when the section is missing.
 * Quotes elsewhere in the section are the log's own words and stay, and a heading inside a
 * code block does not end the section.
 */
export function resumePrompt(logText: string | null, logPath: string): string {
  const lines = (logText ?? '').split('\n')
  const start = lines.findIndex(l => /^#{2,3}\s*(恢復會話|恢复会话)/.test(l))
  let body = ''
  if (start !== -1) {
    const rest = lines.slice(start + 1)
    let isFenced = false
    const end = rest.findIndex(l => {
      if (/^\s*(```|~~~)/.test(l)) isFenced = !isFenced
      return !isFenced && /^#{1,2}\s/.test(l)
    })
    const section = end === -1 ? rest : rest.slice(0, end)
    const first = section.findIndex(l => l.trim() !== '')
    const isNote = first !== -1 && section[first]!.startsWith('>') && PASTE_NOTE.test(section[first]!)
    body = section
      .filter((_, i) => !(isNote && i === first))
      .join('\n')
      .trim()
  }
  if (body === '') body = `請閱讀工作日誌 ${logPath} 末尾的「恢復會話」節，照它恢復上下文。`
  return `${body}\n\n${RESUME_TAIL}`
}

/**
 * A file:// link for the band, the path's spaces and brackets escaped for markdown. A Windows
 * drive path (C:\…) becomes file:///C:/….
 */
export function fileLink(path: string): string {
  const name = (path.split(/[\\/]/).at(-1) ?? path).replace(/[[\]]/g, '\\$&')
  const url = /^[A-Za-z]:[\\/]/.test(path) ? `file:///${path.replace(/\\/g, '/')}` : `file://${path}`
  const href = encodeURI(url).replace(/\(/g, '%28').replace(/\)/g, '%29')
  return `[${name}](${href})`
}

export type Command =
  | { kind: 'status' }
  | { kind: 'threshold'; value: number }
  | { kind: 'enable'; isEnabled: boolean }
  | { kind: 'intercept'; isOn: boolean }
  | { kind: 'resume'; isOn: boolean }
  | { kind: 'reset' }
  | { kind: 'error'; text: string }

export const USAGE =
  '用法：/context-guard [status] | threshold <1-99> | on | off | intercept on|off | resume on|off | reset'

export function parseCommand(args: string): Command {
  const [verb = 'status', arg, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (rest.length > 0) return { kind: 'error', text: USAGE }
  switch (verb) {
    case 'status':
      return arg === undefined ? { kind: 'status' } : { kind: 'error', text: USAGE }
    case 'on':
    case 'off':
      return arg === undefined ? { kind: 'enable', isEnabled: verb === 'on' } : { kind: 'error', text: USAGE }
    case 'reset':
      return arg === undefined ? { kind: 'reset' } : { kind: 'error', text: USAGE }
    case 'threshold': {
      const value = Number(arg)
      if (!Number.isInteger(value) || value < 1 || value > 99) {
        return { kind: 'error', text: '門檻要是 1 到 99 之間的整數，例如 /context-guard threshold 75' }
      }
      return { kind: 'threshold', value }
    }
    case 'intercept':
    case 'resume':
      if (arg === 'on' || arg === 'off') return { kind: verb, isOn: arg === 'on' }
      return { kind: 'error', text: USAGE }
    default:
      return { kind: 'error', text: USAGE }
  }
}
