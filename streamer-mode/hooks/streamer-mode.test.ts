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
