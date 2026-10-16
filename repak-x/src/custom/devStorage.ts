// repakxtra: the dev copy (dev.ps1) runs from http://localhost:5180, so its localStorage is not the app's: it would
// start with no loadouts. The stable and test copies keep a copy of every repakxtra.* entry on disk (xtra_storage.rs,
// checked every few seconds and on close); the dev copy loads it once per session, reloading once if that changed
// anything, so every module reads the copied values. One way only: the dev copy never writes it. Loadout pictures kept
// in IndexedDB (loadoutMedia.ts) are not copied. Imported in main.tsx; it never throws.
import { invoke } from '@tauri-apps/api/core'

const PREFIX = 'repakxtra.'
const SYNCED = 'repakxtra-dev.synced' // sessionStorage: survives the dev copy's reloads, gone when it closes

/** Every repakxtra.* entry, sorted, so an unchanged store serializes the same. */
export const collect = (store: Storage): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const k of Object.keys(store).filter(k => k.startsWith(PREFIX)).sort()) out[k] = store.getItem(k) ?? ''
  return out
}

/** Makes the store's repakxtra.* entries equal to `snap`. Returns whether anything changed. */
export function mirror(store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { readonly length: number; key(i: number): string | null }, snap: Record<string, string>) {
  let changed = false
  const own: string[] = []
  for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k?.startsWith(PREFIX)) own.push(k) }
  for (const k of own) if (!(k in snap)) { store.removeItem(k); changed = true }
  for (const [k, v] of Object.entries(snap)) if (k.startsWith(PREFIX) && store.getItem(k) !== v) { store.setItem(k, v); changed = true }
  return changed
}

const inApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

if (inApp && import.meta.env.DEV) {
  if (!sessionStorage.getItem(SYNCED)) {
    sessionStorage.setItem(SYNCED, '1')
    invoke<string | null>('xtra_storage_snapshot_read')
      .then(text => { if (text && mirror(localStorage, JSON.parse(text))) location.reload() })
      .catch(e => console.warn('[devStorage] Could not load the saved loadouts:', e))
  }
} else if (inApp) {
  let last = ''
  const write = () => {
    let text: string
    try { text = JSON.stringify(collect(localStorage)) } catch { return }
    if (text === last) return
    last = text
    invoke('xtra_storage_snapshot_write', { text }).catch(e => { last = ''; console.warn('[devStorage] Could not save the copy:', e) })
  }
  setTimeout(write, 1500)
  setInterval(write, 4000)
  window.addEventListener('pagehide', write)
}

if (import.meta.env.DEV) {
  const m = new Map<string, string>([['repakxtra.view', 'list'], ['repakxtra.old', 'x'], ['other', 'keep']])
  const fake = {
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
  const changed = mirror(fake, { 'repakxtra.view': 'cards', 'repakxtra.loadouts': '[]' })
  console.assert(changed && m.get('repakxtra.view') === 'cards' && m.get('repakxtra.loadouts') === '[]' && !m.has('repakxtra.old') && m.get('other') === 'keep', 'mirror', m)
  console.assert(!mirror(fake, { 'repakxtra.view': 'cards', 'repakxtra.loadouts': '[]' }), 'mirror: nothing to change')
}
