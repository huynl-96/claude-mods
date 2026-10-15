import { expect, test } from 'claude-code/testing'

// An inline plugin stands in for other mods: /probe <id> tries to open a pane with that id.
const probe = {
  name: 'probe',
  register: (on: any) => {
    on('command.run', { command: 'probe' }, async ($: any, e: any) => {
      try {
        await $.ui.open({ id: e.args })
        return { text: 'opened' }
      } catch {
        return { text: 'denied' }
      }
    })
  },
}

test('a private pane is covered while on, and refused when another mod is listed first', { plugins: [probe] }, async ($, on) => {
  let order = { 'curtain@claude-mods': true }
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ value: { text: '' } }))
  on('env.get', () => ({ value: '/Users/someone' }))
  on('fs.write', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: undefined } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('fs.read', (_: any, e: any) =>
    String(e.path).endsWith('settings.json') ? { value: JSON.stringify({ enabledPlugins: order }) } : { deny: 'ENOENT' })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'real files' }))
  const run = (command: string, args = '') =>
    $.command.run({ command, args, origin: { kind: 'composer' } } as any)
  const pane = async (id: string) =>
    JSON.stringify(await $.ui.render({ surface: 'terminal', component: 'Pane', requestId: id, props: { title: id, isFocused: false, bodyColumns: 80 } } as any))

  await $.session.start({ cwd: '/p' } as any)
  await run('curtain', 'on')
  expect((await run('probe', 'filetree')).text).toBe('opened')
  expect(await pane('filetree')).toContain('Hidden by curtain')
  expect(await pane('notes')).toContain('real files')
  await run('curtain', 'off')
  expect(await pane('filetree')).toContain('real files')

  order = { 'filetree@x': true, 'curtain@claude-mods': true } as any
  await $.session.start({ cwd: '/p' } as any)
  await run('curtain', 'on')
  expect((await run('probe', 'filetree')).text).toBe('denied')
})

const env = (on: any) => {
  on('command.run', () => ({ value: { text: '' } }))
  on('env.get', () => ({ value: '/Users/someone' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: String(e.props.text ?? e.props.tool) }))
}
const curtain = ($: any, args: string) => $.command.run({ command: 'curtain', args, origin: { kind: 'composer' } })
const draw = async ($: any, component: string, requestId: string, props: object) =>
  JSON.stringify(await $.ui.render({ surface: 'terminal', component, requestId, props }))
const reply = (text: string) => ({ text, isFirstOfReply: true })
const tool = { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }

test('/curtain shows only rows added after it, with paths shortened', async ($, on) => {
  env(on)
  expect(await draw($, 'AssistantMessage', 'aaaaaaaa-0000-4000-8000-000000000000', reply('secret plan'))).toContain('secret plan')
  await curtain($, 'on')
  // Drawn before, or never drawn but older (a reload, a resumed session): hidden either way.
  expect(await draw($, 'AssistantMessage', 'aaaaaaaa-0000-4000-8000-000000000000', reply('secret plan'))).toContain('hidden by curtain')
  expect(await draw($, 'AssistantMessage', 'bbbbbbbb-0000-4000-8000-000000000000', reply('reworded narration'))).toContain('hidden by curtain')
  expect(await draw($, 'ToolUse', 'toolu_old', tool)).toContain('hidden by curtain')

  await $.session.append({
    uuid: 'cccccccc-0000-4000-8000-123456789abc',
    door: 'model',
    origin: { kind: 'model' },
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'see /Users/someone/app.ts' }, { type: 'tool_use', id: 'toolu_new', name: 'Read', input: {} }] },
  } as any)
  const fresh = await draw($, 'AssistantMessage', 'cccccccc-0000-4000-8000-000000000000', reply('see /Users/someone/app.ts'))
  expect(fresh).toContain('see ~/app.ts')
  expect(fresh).not.toContain('/Users/someone')
  expect(await draw($, 'ToolUse', 'toolu_new', tool)).not.toContain('hidden by curtain')
  expect(await draw($, 'UserMessage', 'placeholder', { text: 'just typed', origin: { kind: 'composer' }, isExpanded: false })).toContain('just typed')
  expect(await draw($, 'CommandOutput', 'c1', { command: 'filetree', args: '', text: 'File tree on ~/x', isErrored: false })).toContain('hidden by curtain')
  expect(await draw($, 'CommandOutput', 'c2', { command: 'curtain', args: 'on', text: 'Curtain on', isErrored: false })).toContain('Curtain on')

  await curtain($, 'off')
  expect(await draw($, 'AssistantMessage', 'aaaaaaaa-0000-4000-8000-000000000000', reply('secret plan'))).toContain('secret plan')
})

test('warns at session start when another plugin is listed before curtain', async ($, on) => {
  const toasts: string[] = []
  on('env.get', () => ({ value: '/Users/someone' }))
  on('command.register', () => ({ value: undefined }))
  on('fs.read', (_: any, e: any) =>
    String(e.path).endsWith('settings.json')
      ? { value: JSON.stringify({ enabledPlugins: { 'filetree@x': true, 'curtain@claude-mods': true } }) }
      : { value: '' })
  on('ui.toast', (_: any, e: any) => { toasts.push(String(e.text ?? e)); return { value: undefined } })
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/Users/someone/project' } as any)
  expect(toasts.join('\n')).toContain('filetree@x')
})

test('no order warning when curtain is loaded another way (--plugin-dir)', async ($, on) => {
  const toasts: string[] = []
  on('env.get', () => ({ value: '/Users/someone' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('fs.read', (_: any, e: any) =>
    String(e.path).endsWith('settings.json')
      ? { value: JSON.stringify({ enabledPlugins: { 'filetree@x': true, 'curtain@claude-mods': false } }) }
      : { value: '' })
  on('ui.toast', (_: any, e: any) => { toasts.push(String(e.text ?? e)); return { value: undefined } })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/Users/someone/project' } as any)
  expect(toasts.join('\n')).not.toContain('enabledPlugins')
})

test('/curtain sets one switch for every session, and the status line flag', async ($, on) => {
  const files: Record<string, string> = {}
  on('command.run', () => ({ value: { text: '' } }))
  on('env.get', () => ({ value: '/Users/someone' }))
  on('fs.read', (_: any, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'ENOENT' }))
  on('fs.write', (_: any, e: any) => { files[e.path] = e.text; return { value: undefined } })
  const run = (args: string) => $.command.run({ command: 'curtain', args, origin: { kind: 'composer' } } as any)

  await run('on')
  expect(files['/Users/someone/.claude/curtain.state']).toBe('on\n')
  expect(files['/Users/someone/.claude/curtain']).toBe('on\n')
  await run('off')
  expect(files['/Users/someone/.claude/curtain.state']).toBe('')
  expect(files['/Users/someone/.claude/curtain']).toBe('')
})

test('/curtain key writes the shortcut and keeps other bindings', async ($, on) => {
  const path = '/Users/someone/.claude/keybindings.json'
  const files: Record<string, string> = {
    [path]: JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+e': 'chat:externalEditor', 'ctrl+x s': 'app:toggleDiffNoiseFilter' } }] }),
  }
  on('command.run', () => ({ value: { text: '' } }))
  on('env.get', () => ({ value: '/Users/someone' }))
  on('store.set', () => ({ value: undefined }))
  on('fs.read', (_: any, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'ENOENT' }))
  on('fs.write', (_: any, e: any) => { files[e.path] = e.text; return { value: undefined } })
  const run = async (args: string) =>
    (await $.command.run({ command: 'curtain', args, origin: { kind: 'composer' } } as any)).text

  expect(await run('key s')).toContain('Start with ctrl or meta')
  expect(await run('key ctrl+e')).toContain('already bound to chat:externalEditor')
  expect(await run('key ctrl+g')).toContain("Claude Code's chat:externalEditor shortcut")
  expect(await run('key meta+shift+s')).toBe('Shortcut saved: meta+shift+s')
  const chat = JSON.parse(files[path]).bindings[0].bindings
  expect(chat).toEqual({ 'ctrl+e': 'chat:externalEditor', 'meta+shift+s': 'app:toggleDiffNoiseFilter' })
})

test('the settings pane draws, with the shortcut field', async ($, on) => {
  on('env.get', () => ({ value: '/Users/someone' }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'engine' }))
  const tree = JSON.stringify(
    await $.ui.render({ surface: 'terminal', component: 'Pane', requestId: 'curtain', props: { title: 'Curtain', isFocused: true, bodyColumns: 80 } } as any),
  )
  expect(tree).toContain('Turn on')
  expect(tree).toContain('"type":"Input"')
  expect(tree).toContain('Shortcut (now none)')
})

test('a new session starts with the curtain on when another session turned it on', async ($, on) => {
  const files: Record<string, string> = { '/Users/someone/.claude/curtain.state': 'on\n' }
  on('env.get', () => ({ value: '/Users/someone' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: undefined } }))
  on('fs.exists', (_: any, e: any) => ({ value: e.path in files }))
  const toasts: string[] = []
  on('ui.toast', (_: any, e: any) => { toasts.push(String(e.text ?? e)); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('fs.read', (_: any, e: any) => (e.path in files ? { value: files[e.path] } : { deny: 'ENOENT' }))
  on('fs.write', (_: any, e: any) => { files[e.path] = e.text; return { value: undefined } })
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/Users/someone/project' } as any)
  expect(toasts.join('\n')).toContain('Curtain is on. /curtain off turns it off in every session.')
})

test('fails closed: unreadable settings refuse private panes', { plugins: [probe] }, async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ value: { text: '' } }))
  on('env.get', () => ({ value: '/Users/someone' }))
  on('fs.write', () => ({ value: undefined }))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ deny: 'EACCES' }))
  on('store.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: undefined } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  const run = (command: string, args = '') => $.command.run({ command, args, origin: { kind: 'composer' } } as any)
  await $.session.start({ cwd: '/p' } as any)
  await run('curtain', 'on')
  expect((await run('probe', 'filetree')).text).toBe('denied')
})

test('fails closed: a failed write or an unreadable switch never turns the curtain off', async ($, on) => {
  const toasts: string[] = []
  let writable = false
  on('command.run', () => ({ value: { text: '' } }))
  on('env.get', () => ({ value: '/Users/someone' }))
  on('fs.write', () => (writable ? { value: undefined } : { deny: 'EACCES' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ deny: 'EACCES' }))
  on('store.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('clock.every', () => ({ value: { cancel: undefined } }))
  on('ui.toast', (_: any, e: any) => { toasts.push(String(e.text ?? e)); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  const run = (args: string) => $.command.run({ command: 'curtain', args, origin: { kind: 'composer' } } as any)

  await run('on')
  expect(toasts.join('\n')).toContain('in this session only')
  await $.session.start({ cwd: '/p' } as any) // follows the switch: must stay on
  expect(toasts.join('\n')).toContain('Curtain is on.')
  writable = true
  await run('on') // a successful write ends the pin; the switch is now unreadable, so state is kept
  toasts.length = 0
  await $.session.start({ cwd: '/p' } as any)
  expect(toasts.join('\n')).toContain('Curtain is on.')
})
