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

test('/streamer blocks only private panes, until turned off', { plugins: [probe] }, async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.run', () => ({ value: { text: '' } }))
  const run = (command: string, args = '') =>
    $.command.run({ command, args, origin: { kind: 'composer' } } as any)

  expect((await run('probe', 'filetree')).text).toBe('opened')
  await run('streamer', 'on')
  expect((await run('probe', 'filetree')).text).toBe('denied')
  expect((await run('probe', 'notes')).text).toBe('opened')
  await run('streamer', 'off')
  expect((await run('probe', 'filetree')).text).toBe('opened')
})

const env = (on: any) => {
  on('command.run', () => ({ value: { text: '' } }))
  on('env.get', () => ({ value: '/Users/someone' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: String(e.props.text ?? e.props.tool) }))
}
const streamer = ($: any, args: string) => $.command.run({ command: 'streamer', args, origin: { kind: 'composer' } })
const draw = async ($: any, component: string, requestId: string, props: object) =>
  JSON.stringify(await $.ui.render({ surface: 'terminal', component, requestId, props }))
const reply = (text: string) => ({ text, isFirstOfReply: true })
const tool = { tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false }

test('/streamer shows only rows added after it, with paths shortened', async ($, on) => {
  env(on)
  expect(await draw($, 'AssistantMessage', 'aaaaaaaa-0000-4000-8000-000000000000', reply('secret plan'))).toContain('secret plan')
  await streamer($, 'on')
  // Drawn before, or never drawn but older (a reload, a resumed session): hidden either way.
  expect(await draw($, 'AssistantMessage', 'aaaaaaaa-0000-4000-8000-000000000000', reply('secret plan'))).toContain('hidden in streamer mode')
  expect(await draw($, 'AssistantMessage', 'bbbbbbbb-0000-4000-8000-000000000000', reply('reworded narration'))).toContain('hidden in streamer mode')
  expect(await draw($, 'ToolUse', 'toolu_old', tool)).toContain('hidden in streamer mode')

  await $.session.append({
    uuid: 'cccccccc-0000-4000-8000-123456789abc',
    door: 'model',
    origin: { kind: 'model' },
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text: 'see /Users/someone/app.ts' }, { type: 'tool_use', id: 'toolu_new', name: 'Read', input: {} }] },
  } as any)
  const fresh = await draw($, 'AssistantMessage', 'cccccccc-0000-4000-8000-000000000000', reply('see /Users/someone/app.ts'))
  expect(fresh).toContain('see ~/app.ts')
  expect(fresh).not.toContain('/Users/someone')
  expect(await draw($, 'ToolUse', 'toolu_new', tool)).not.toContain('hidden in streamer mode')
  expect(await draw($, 'UserMessage', 'placeholder', { text: 'just typed', origin: { kind: 'composer' }, isExpanded: false })).toContain('just typed')
  expect(await draw($, 'CommandOutput', 'c1', { command: 'filetree', args: '', text: 'File tree on ~/x', isErrored: false })).toContain('hidden in streamer mode')
  expect(await draw($, 'CommandOutput', 'c2', { command: 'streamer', args: 'on', text: 'Streamer mode on', isErrored: false })).toContain('Streamer mode on')

  await streamer($, 'off')
  expect(await draw($, 'AssistantMessage', 'aaaaaaaa-0000-4000-8000-000000000000', reply('secret plan'))).toContain('secret plan')
})

test('warns at session start when another plugin is listed before streamer-mode', async ($, on) => {
  const toasts: string[] = []
  on('env.get', () => ({ value: '/Users/someone' }))
  on('command.register', () => ({ value: undefined }))
  on('fs.read', (_: any, e: any) =>
    String(e.path).endsWith('settings.json')
      ? { value: JSON.stringify({ enabledPlugins: { 'filetree@x': true, 'streamer-mode@claude-mods': true } }) }
      : { value: '' })
  on('ui.toast', (_: any, e: any) => { toasts.push(String(e.text ?? e)); return { value: undefined } })
  on('store.get', () => ({ value: undefined }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/Users/someone/project' } as any)
  expect(toasts.join('\n')).toContain('filetree@x')
})
