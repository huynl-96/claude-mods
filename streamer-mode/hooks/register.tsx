import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hide, SeenPane } from '../types'

const PANE = 'streamer-mode'
const ALL: Hide = { panes: true, bands: true, status: true }
// Hidden until the person picks their own: Filetree and Terminal Browser show file names and pages.
const DEFAULT_PRIVATE = ['filetree', 'browser']

const isOn = atom({ plugin: 'streamer-mode', key: 'isOn' } as const, false)
const hide = atom({ plugin: 'streamer-mode', key: 'hide' } as const, ALL)
const privatePanes = atom({ plugin: 'streamer-mode', key: 'privatePanes' } as const, DEFAULT_PRIVATE)
// Every pane opened while this mod was loaded, so the settings can offer it.
const seen = atom({ plugin: 'streamer-mode', key: 'seen' } as const, [] as SeenPane[])

const LABELS: Record<keyof Hide, string> = {
  panes: 'Panes ticked below',
  bands: 'Bands above the prompt (Reflect, Replay, …)',
  status: 'Status line (folder, branch, cost)',
}

// The status line script reads this file: non-empty means streamer mode is on.
async function flagPath($: EngineInterface) {
  return `${await $.env.get('HOME')}/.claude/streamer-mode`
}

async function isHidden($: EngineInterface, id: string) {
  return (await read($, isOn)) && (await read($, hide)).panes && (await read($, privatePanes)).includes(id)
}

async function apply($: EngineInterface, on: boolean) {
  await update($, isOn, () => on)
  const cur = await read($, hide)
  try {
    await $.fs.write(await flagPath($), on && cur.status ? 'on\n' : '')
  } catch { /* status line flag is best effort */ }
  if (on && cur.panes) {
    for (const id of await read($, privatePanes)) {
      try { await $.ui.close({ id }) } catch { /* not open */ }
    }
  }
  $.ui.status(on && !cur.bands ? '● streamer mode' : undefined)
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'streamer',
      description: 'Streamer mode: hide private panes, bands and the status line while you share your screen',
      argumentHint: '[on|off|settings]',
      immediate: true,
    })
    const saved = (await $.store.get('hide')) as Partial<Hide> | undefined
    if (saved) await update($, hide, () => ({ ...ALL, ...saved }))
    const savedPanes = (await $.store.get('privatePanes')) as string[] | undefined
    if (savedPanes) await update($, privatePanes, () => savedPanes)
    const savedSeen = (await $.store.get('seen')) as SeenPane[] | undefined
    if (savedSeen) await update($, seen, () => savedSeen)

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

    return { text: next ? 'Streamer mode on: private panes, bands and status line hidden.' : 'Streamer mode off.' }
  })

  // Learn every pane that opens, and refuse a private one in streamer mode.
  on('ui.open', async ($, e, next) => {
    if (e.id !== PANE && !(await read($, seen)).some(p => p.id === e.id)) {
      const list = [...(await read($, seen)), { id: e.id, title: e.title ?? e.id }]
      await update($, seen, () => list)
      await $.store.set('seen', list)
    }
    if (await isHidden($, e.id)) {
      return { deny: 'hidden in streamer mode (/streamer off to show it)' }
    }
    return next(e)
  })

  // If a private pane stays open anyway, draw over it.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!(await isHidden($, e.requestId))) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>Hidden in streamer mode.</Text>
  })

  // Answering without next() keeps the bands beneath this one from drawing.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn)) || !(await read($, hide)).bands) {
      return next(e)
    }
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>● streamer mode · /streamer off to stop</Text>
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
        <Text dimColor>Hide in streamer mode:</Text>
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
