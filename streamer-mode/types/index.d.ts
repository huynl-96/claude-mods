export type Hide = { panes: boolean; bands: boolean; status: boolean }
export type SeenPane = { id: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    'streamer-mode': { isOn: boolean; hide: Hide; privatePanes: string[]; seen: SeenPane[] }
  }
}
