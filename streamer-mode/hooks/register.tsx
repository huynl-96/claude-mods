import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Hide, SeenPane } from '../types'

const PANE = 'streamer-mode'
const ALL: Hide = { panes: true, bands: true, status: true, history: true, paths: true, shortcut: false }
// Hidden until the person picks their own: Filetree and Terminal Browser show file names and pages.
const DEFAULT_PRIVATE = ['filetree', 'browser']
// An engine action unbound by default and unhandled outside the old diff panel; bound to a key
// in keybindings.json, it presses the streamer button from the prompt. (app:toggleReplTab
// opens the diff panel on 2.1.296, so the button never got it.)
const SHORTCUT_ACTION = 'app:toggleDiffNoiseFilter'
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

// The shortcut as keybindings.json binds it, and the last save's result.
const shortcutKey = atom({ plugin: 'streamer-mode', key: 'shortcutKey' } as const, '')
const shortcutNote = atom({ plugin: 'streamer-mode', key: 'shortcutNote' } as const, '')
const RESERVED = ['ctrl+c', 'ctrl+d', 'ctrl+m', 'ctrl+i', 'ctrl+h', 'ctrl+[']
// Claude Code's default chat and app shortcuts (code.claude.com/docs/en/keybindings), so a saved
// shortcut never silently takes one over. Chords on ctrl+x are listed by their full sequence.
const DEFAULTS: Record<string, string> = {
  'ctrl+t': 'app:toggleTodos', 'ctrl+o': 'app:toggleTranscript', 'ctrl+r': 'history:search',
  'ctrl+l': 'chat:clearInput', 'ctrl+j': 'chat:newline', 'ctrl+_': 'chat:undo', 'ctrl+g': 'chat:externalEditor',
  'ctrl+s': 'chat:stash', 'ctrl+v': 'chat:imagePaste', 'ctrl+b': 'task:background', 'ctrl+enter': 'chat:sendNow',
  'meta+p': 'chat:modelPicker', 'meta+o': 'chat:fastMode', 'meta+t': 'chat:thinkingToggle',
  'ctrl+x ctrl+k': 'chat:killAgents', 'ctrl+x ctrl+e': 'chat:externalEditor', 'ctrl+x enter': 'chat:queueSubmit',
  'ctrl+x ctrl+a': 'abovePrompt:toggle', 'ctrl+x ctrl+s': 'chat:sendNow', 'ctrl+x tab': 'abovePrompt:focus',
  'ctrl+x ctrl+b': 'task:background', 'ctrl+x b': 'app:cycleDiffBase', 'ctrl+x x': 'pane:close',
  'ctrl+x left': 'pane:grow', 'ctrl+x right': 'pane:shrink', 'ctrl+x up': 'pane:grow', 'ctrl+x down': 'pane:shrink',
}

const LABELS: Record<keyof Hide, string> = {
  panes: 'Panes ticked below',
  bands: 'Bands above the prompt (Reflect, Replay, …)',
  status: 'Status line (folder, branch, cost)',
  history: 'Conversation from before streamer mode',
  paths: 'Home folder in paths (shown as ~)',
  shortcut: 'Keyboard shortcut (set it below)',
}

async function home($: EngineInterface) {
  return (await $.env.get('HOME')) ?? ''
}

// The status line script reads this file: non-empty means streamer mode is on.
async function flagPath($: EngineInterface) {
  return `${await home($)}/.claude/streamer-mode`
}

// One switch for the whole machine: every session follows this file, so turning streamer mode on
// in one session covers every other session, including ones started later.
async function statePath($: EngineInterface) {
  return `${await home($)}/.claude/streamer-mode.state`
}

async function isOnEverywhere($: EngineInterface) {
  try {
    return (await $.fs.read(await statePath($))).trim() === 'on'
  } catch {
    return false
  }
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

type Bindings = { bindings?: { context?: string; bindings?: Record<string, string | null> }[] } & Record<string, unknown>

async function keybindingsPath($: EngineInterface) {
  return `${await home($)}/.claude/keybindings.json`
}

async function readBindings($: EngineInterface): Promise<Bindings> {
  try {
    return JSON.parse(await $.fs.read(await keybindingsPath($))) as Bindings
  } catch {
    return { $schema: 'https://www.schemastore.org/claude-code-keybindings.json', bindings: [] }
  }
}

function boundKey(file: Bindings) {
  for (const block of file.bindings ?? []) {
    for (const [key, action] of Object.entries(block.bindings ?? {})) if (action === SHORTCUT_ACTION) return key
  }
  return ''
}

// One key or a two-key chord that starts with ctrl or meta, so it never types into the prompt.
export function checkKey(keys: string): string | null {
  const parts = keys.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 2) return 'Use one key or a two-key chord, like ctrl+x s.'
  if (RESERVED.includes(parts[0])) return `${parts[0]} is reserved by Claude Code.`
  const taken = DEFAULTS[parts.join(' ')]
  if (taken) return `${parts.join(' ')} is Claude Code's ${taken} shortcut. Pick another, such as ctrl+x s.`
  if (!/^(ctrl|meta)\+./.test(parts[0])) return 'Start with ctrl or meta (Option), so the key never types into the prompt.'
  return null
}

// Writes the shortcut into ~/.claude/keybindings.json, keeping every other binding.
async function saveShortcut($: EngineInterface, raw: string) {
  const keys = raw.trim().split(/\s+/).join(' ')
  const problem = checkKey(keys)
  if (problem) return problem
  const file = await readBindings($)
  const blocks = (file.bindings = Array.isArray(file.bindings) ? file.bindings : [])
  for (const block of blocks) {
    const taken = block.bindings?.[keys]
    if (taken && taken !== SHORTCUT_ACTION) return `${keys} is already bound to ${taken} in keybindings.json.`
  }
  for (const block of blocks) {
    for (const [key, action] of Object.entries(block.bindings ?? {})) if (action === SHORTCUT_ACTION) delete block.bindings![key]
  }
  let chat = blocks.find(b => b.context === 'Chat')
  if (!chat) blocks.push((chat = { context: 'Chat', bindings: {} }))
  chat.bindings = { ...(chat.bindings ?? {}), [keys]: SHORTCUT_ACTION }
  await $.fs.write(await keybindingsPath($), JSON.stringify(file, null, 2) + '\n')
  await update($, shortcutKey, () => keys)
  const cur = await read($, hide)
  if (!cur.shortcut) {
    await update($, hide, () => ({ ...cur, shortcut: true }))
    await $.store.set('hide', { ...cur, shortcut: true })
  }
  return `Shortcut saved: ${keys}`
}

async function isHidden($: EngineInterface, id: string) {
  return (await read($, isOn)) && (await read($, hide)).panes && (await read($, privatePanes)).includes(id)
}

// This session only: what it hides follows on/off.
async function applyHere($: EngineInterface, on: boolean) {
  if (on && !(await read($, isOn))) {
    await update($, freshRows, () => [])
    await update($, freshToolIds, () => [])
  }
  await update($, isOn, () => on)
  $.ui.status(on && !(await read($, hide)).bands ? '● streamer mode' : undefined)
  $.ui.invalidate('ui.render')
}

// Every session: write the shared switch and the status line flag, then follow it here.
async function apply($: EngineInterface, on: boolean) {
  try {
    await $.fs.write(await statePath($), on ? 'on\n' : '')
    await $.fs.write(await flagPath($), on && (await read($, hide)).status ? 'on\n' : '')
  } catch { /* the files are best effort; this session still follows */ }
  await applyHere($, on)
}

async function follow($: EngineInterface) {
  const on = await isOnEverywhere($)
  if (on !== (await read($, isOn))) await applyHere($, on)
}

// Whether this mod draws first (see the order check at session start): only then can it cover a
// private pane, so otherwise a private pane is refused instead of covered.
let canCover = true

// ponytail: polls the switch file every 1.5s; a file watch would react sooner if the host offers one.
let ticker: Timer | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'streamer',
      description: 'Streamer mode: hide private panes, bands, the status line and earlier conversation while you share your screen',
      argumentHint: '[on|off|settings|key <keys>]',
      immediate: true,
    })
    const saved = (await $.store.get('hide')) as Partial<Hide> | undefined
    if (saved) await update($, hide, () => ({ ...ALL, ...saved }))
    const savedPanes = (await $.store.get('privatePanes')) as string[] | undefined
    if (savedPanes) await update($, privatePanes, () => savedPanes)
    const savedSeen = (await $.store.get('seen')) as SeenPane[] | undefined
    if (savedSeen) await update($, seen, () => savedSeen)
    // Installed mods run in enabledPlugins order, first outermost: a mod listed ahead of this
    // one draws before it, so its pane or band can't be covered.
    try {
      const settings = JSON.parse(await $.fs.read(`${await home($)}/.claude/settings.json`)) as { enabledPlugins?: Record<string, boolean> }
      // Only an enabled install is ordered by this list; --plugin-dir and dev loads aren't.
      const enabled = Object.entries(settings.enabledPlugins ?? {}).filter(([, isEnabled]) => isEnabled).map(([key]) => key)
      const first = enabled[0]
      canCover = !enabled.slice(1).some(key => key.startsWith('streamer-mode@'))
      if (!canCover) {
        $.ui.toast(`streamer-mode can't cover mods listed before it: move "streamer-mode@…" to the top of enabledPlugins in ~/.claude/settings.json (first now: ${first})`)
      }
    } catch { /* no readable user settings */ }
    const bound = boundKey(await readBindings($))
    await update($, shortcutKey, () => bound)
    await follow($)
    if (await read($, isOn)) $.ui.toast('Streamer mode is on. /streamer off turns it off in every session.')
    ticker?.cancel()
    ticker = $.clock.every(1500, () => follow($))

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
    if (arg === 'key' || arg.startsWith('key ')) {
      const keys = arg.slice(3).trim()
      if (!keys) return { text: `Streamer mode shortcut: ${(await read($, shortcutKey)) || 'none'}` }
      return { text: await saveShortcut($, keys) }
    }
    const next = arg === 'on' ? true : arg === 'off' ? false : !(await read($, isOn))
    await apply($, next)

    return { text: next ? 'Streamer mode on: private panes, bands, status line and earlier conversation hidden.' : 'Streamer mode off.' }
  })

  // Learn every pane that opens, and refuse a private one in streamer mode when it can't be covered.
  on('ui.open', async ($, e, next) => {
    // Keep each pane's latest title: a title can name the folder it was opened on.
    const title = e.title ?? e.id
    const known = await read($, seen)
    if (e.id !== PANE && !known.some(p => p.id === e.id && p.title === title)) {
      const list = [...known.filter(p => p.id !== e.id), { id: e.id, title }]
      await update($, seen, () => list)
      await $.store.set('seen', list)
    }
    // Drawn first, it opens and gets covered, so it's back as it was when streamer mode turns off.
    if (!canCover && (await isHidden($, e.id))) {
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
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    const cur = await read($, hide)
    const ids = await read($, privatePanes)
    const isStreaming = await read($, isOn)
    const known = [...(await read($, seen))]
    for (const id of ids) if (!known.some(p => p.id === id)) known.push({ id, title: id })
    const current = await read($, shortcutKey)
    const note = await read($, shortcutNote)
    const save = async (value: string) => {
      const message = await saveShortcut($, value)
      await update($, shortcutNote, () => message)
    }

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
        <Input
          key="shortcut"
          label={`Shortcut (now ${current || 'none'})`}
          placeholder="ctrl+x s, meta+s, …"
          submitLabel="Save"
          onSubmit={save}
        />
        {note !== '' ? <Text dimColor>{note}</Text> : null}
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
