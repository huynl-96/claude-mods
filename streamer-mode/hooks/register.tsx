import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hide, SeenPane } from '../types'

const PANE = 'streamer-mode'
const ALL: Hide = { panes: true, bands: true, status: true, history: true, paths: true, shortcut: false }
// Hidden until the person picks their own: Filetree and Terminal Browser show file names and pages.
const DEFAULT_PRIVATE = ['filetree', 'browser']
// An engine action unbound by default and unhandled while the built-in /diff mod is on;
// bound to a key in keybindings.json, it presses the streamer button from the prompt.
const SHORTCUT_ACTION = 'app:toggleReplTab'
const ROWS = ['UserMessage', 'AssistantMessage', 'ToolUse', 'ToolResult', 'ToolGroup', 'CommandOutput'] as const

const isOn = atom({ plugin: 'streamer-mode', key: 'isOn' } as const, false)
const hide = atom({ plugin: 'streamer-mode', key: 'hide' } as const, ALL)
const privatePanes = atom({ plugin: 'streamer-mode', key: 'privatePanes' } as const, DEFAULT_PRIVATE)
// Every pane opened while this mod was loaded, so the settings can offer it.
const seen = atom({ plugin: 'streamer-mode', key: 'seen' } as const, [] as SeenPane[])

// Rows added since streamer mode turned on: everything else in the transcript is hidden.
// A message row is drawn under its uuid with the last group zeroed; a tool row under its tool_use_id.
const freshRows = atom({ plugin: 'streamer-mode', key: 'freshRows' } as const, [] as string[])
const freshToolIds = atom({ plugin: 'streamer-mode', key: 'freshToolIds' } as const, [] as string[])
const rowKey = (id: string) => id.split('-').slice(0, 4).join('-')

const LABELS: Record<keyof Hide, string> = {
  panes: 'Panes ticked below',
  bands: 'Bands above the prompt (Reflect, Replay, …)',
  status: 'Status line (folder, branch, cost)',
  history: 'Conversation from before streamer mode',
  paths: 'Home folder in paths (shown as ~)',
  shortcut: `Keyboard shortcut (bind a key to ${SHORTCUT_ACTION})`,
}

async function home($: EngineInterface) {
  return (await $.env.get('HOME')) ?? ''
}

// The status line script reads this file: non-empty means streamer mode is on.
async function flagPath($: EngineInterface) {
  return `${await home($)}/.claude/streamer-mode`
}

function shorten<T>(value: T, from: string): T {
  if (from.length < 2) return value
  if (typeof value === 'string') return value.split(from).join('~') as T
  if (Array.isArray(value)) return value.map(v => shorten(v, from)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shorten(v, from)])) as T
  }
  return value
}

// Only the fields a row draws as content; read-only props must pass unchanged.
const CONTENT: Record<(typeof ROWS)[number], string[]> = {
  UserMessage: ['text'],
  AssistantMessage: ['text'],
  ToolUse: ['input', 'output'],
  ToolResult: ['output'],
  ToolGroup: ['calls'],
  CommandOutput: ['text'],
}

// Sets built once per write, rebuilt when the value's version moves.
const ROWS_REF = { plugin: 'streamer-mode', key: 'freshRows' } as const
const TOOL_IDS_REF = { plugin: 'streamer-mode', key: 'freshToolIds' } as const
const lookups = new Map<string, { version: number; set: Set<string> }>()
function cached(key: string, value: string[] | undefined, version: number) {
  const hit = lookups.get(key)
  if (hit && hit.version === version) return hit.set
  const set = new Set<string>(value ?? [])
  lookups.set(key, { version, set })
  return set
}
async function lookup($: EngineInterface, key: 'freshRows' | 'freshToolIds') {
  if (key === 'freshRows') {
    const { value, version } = await $.state.get(ROWS_REF)
    return cached(key, value, version)
  }
  const { value, version } = await $.state.get(TOOL_IDS_REF)
  return cached(key, value, version)
}

// Fail closed: a row is earlier unless it was added after streamer mode turned on.
async function isEarlier($: EngineInterface, component: (typeof ROWS)[number], id: string, props: Record<string, unknown>) {
  if (component === 'UserMessage' || component === 'AssistantMessage') {
    // A prompt just sent is drawn as a placeholder until its row is kept.
    return id !== 'placeholder' && !(await lookup($, 'freshRows')).has(rowKey(id))
  }
  if (component === 'ToolUse' || component === 'ToolResult') return !(await lookup($, 'freshToolIds')).has(id)
  if (component === 'ToolGroup') {
    const ids = await lookup($, 'freshToolIds')
    return ((props.calls ?? []) as { tool_use_id?: string }[]).some(c => !c.tool_use_id || !ids.has(c.tool_use_id))
  }
  // Slash command output: hide all of it but /streamer's own.
  return props.command !== 'streamer'
}

async function isHidden($: EngineInterface, id: string) {
  return (await read($, isOn)) && (await read($, hide)).panes && (await read($, privatePanes)).includes(id)
}

async function apply($: EngineInterface, on: boolean) {
  if (on && !(await read($, isOn))) {
    await update($, freshRows, () => [])
    await update($, freshToolIds, () => [])
  }
  await update($, isOn, () => on)
  const cur = await read($, hide)
  try {
    await $.fs.write(await flagPath($), on && cur.status ? 'on\n' : '')
  } catch { /* status line flag is best effort */ }
  $.ui.status(on && !cur.bands ? '● streamer mode' : undefined)
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'streamer',
      description: 'Streamer mode: hide private panes, bands, the status line and earlier conversation while you share your screen',
      argumentHint: '[on|off|settings]',
      immediate: true,
    })
    const saved = (await $.store.get('hide')) as Partial<Hide> | undefined
    if (saved) await update($, hide, () => ({ ...ALL, ...saved }))
    const savedPanes = (await $.store.get('privatePanes')) as string[] | undefined
    if (savedPanes) await update($, privatePanes, () => savedPanes)
    const savedSeen = (await $.store.get('seen')) as SeenPane[] | undefined
    if (savedSeen) await update($, seen, () => savedSeen)
    try {
      if ((await $.fs.read(await flagPath($))).trim()) {
        $.ui.toast('Streamer mode status line flag is still on from an earlier session: /streamer off to clear it')
      }
    } catch { /* no flag file */ }

    return next(e)
  })

  // Note each row added while streamer mode is on, so it shows; anything not noted stays hidden.
  on('session.append', async ($, e, next) => {
    if (!e.agentId && (await read($, isOn))) {
      await update($, freshRows, rows => [...rows, rowKey(e.uuid)])
      const blocks = Array.isArray(e.message.content) ? (e.message.content as { type?: string; id?: string; tool_use_id?: string }[]) : []
      const ids = blocks.flatMap(b => (b.type === 'tool_use' && b.id ? [b.id] : b.type === 'tool_result' && b.tool_use_id ? [b.tool_use_id] : []))
      if (ids.length) await update($, freshToolIds, list => [...list, ...ids])
    }
    return next(e)
  })

  on('command.run', { command: 'streamer' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'settings') {
      await $.ui.open({ id: PANE, title: 'Streamer mode', focus: true, closeOnEscape: true })
      return { text: 'Streamer mode settings opened.' }
    }
    const next = arg === 'on' ? true : arg === 'off' ? false : !(await read($, isOn))
    await apply($, next)

    return { text: next ? 'Streamer mode on: private panes, bands, status line and earlier conversation hidden.' : 'Streamer mode off.' }
  })

  // Learn every pane that opens, and refuse a private one in streamer mode.
  on('ui.open', async ($, e, next) => {
    // Keep each pane's latest title: a title can name the folder it was opened on.
    const title = e.title ?? e.id
    const known = await read($, seen)
    if (e.id !== PANE && !known.some(p => p.id === e.id && p.title === title)) {
      const list = [...known.filter(p => p.id !== e.id), { id: e.id, title }]
      await update($, seen, () => list)
      await $.store.set('seen', list)
    }
    if (await isHidden($, e.id)) {
      return { deny: 'hidden in streamer mode (/streamer off to show it)' }
    }
    return next(e)
  })

  // Cover an open private pane rather than close it: another mod's pane can't be reopened
  // from here, and covering lets it come back as it was when streamer mode turns off.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!(await isHidden($, e.requestId))) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>Hidden in streamer mode.</Text>
  })

  // Transcript rows: hide what was drawn before streamer mode, shorten paths in the rest.
  for (const component of ROWS) {
    on('ui.render', { component }, async ($, e, next) => {
      if (!(await read($, isOn))) return next(e)
      const cur = await read($, hide)
      if (cur.history && (await isEarlier($, component, e.requestId, e.props as Record<string, unknown>))) {
        const { Text } = $.ui.resolve(e)
        return <Text dimColor>· hidden in streamer mode</Text>
      }
      if (!cur.paths) return next(e)
      const from = await home($)
      const props: Record<string, unknown> = { ...e.props }
      for (const key of CONTENT[component]) if (key in props) props[key] = shorten(props[key], from)
      return next({ ...e, props } as typeof e)
    })
  }

  // Answering without next() keeps the bands beneath this one from drawing.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const streaming = await read($, isOn)
    const cur = await read($, hide)
    const { Box, Button, Text } = $.ui.resolve(e)
    const shortcut = cur.shortcut
      ? <Button key="streamer-shortcut" label={streaming ? '◉' : '○'} action={SHORTCUT_ACTION} plain dimColor onPress={() => apply($, !streaming)} />
      : null
    if (e.props.hasSurvey || !streaming || !cur.bands) {
      if (!shortcut) return next(e)
      const below = await next(e)
      return <Box flexDirection="column">{below}{shortcut}</Box>
    }
    return (
      <Box flexDirection="row" gap={1}>
        {shortcut}
        <Text dimColor>● streamer mode · /streamer off to stop</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const cur = await read($, hide)
    const ids = await read($, privatePanes)
    const isStreaming = await read($, isOn)
    const known = [...(await read($, seen))]
    for (const id of ids) if (!known.some(p => p.id === id)) known.push({ id, title: id })

    const flip = async (k: keyof Hide) => {
      const nextHide = { ...cur, [k]: !cur[k] }
      await update($, hide, () => nextHide)
      await $.store.set('hide', nextHide)
      if (isStreaming) await apply($, true)
    }
    const flipPane = async (id: string) => {
      const nextIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
      await update($, privatePanes, () => nextIds)
      await $.store.set('privatePanes', nextIds)
      if (isStreaming) await apply($, true)
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Button key="toggle" hotkey="s" label={isStreaming ? 'Turn off' : 'Turn on'} onPress={() => apply($, !isStreaming)} />
        <Text dimColor>In streamer mode, hide:</Text>
        {(Object.keys(LABELS) as (keyof Hide)[]).map((k, i) => (
          <Button key={k} hotkey={String(i + 1)} label={`${cur[k] ? '[x]' : '[ ]'} ${LABELS[k]}`} onPress={() => flip(k)} />
        ))}
        <Text dimColor>Panes (any pane opened while this mod is loaded shows up here):</Text>
        {known.map(p => (
          <Button
            key={`pane-${p.id}`}
            label={`${ids.includes(p.id) ? '[x]' : '[ ]'} ${p.title}${p.title === p.id ? '' : ` (${p.id})`}`}
            onPress={() => flipPane(p.id)}
          />
        ))}
      </Box>
    )
  })
}
