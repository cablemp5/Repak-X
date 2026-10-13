// caleb fork: saved loadouts, shared by the sidebar list (Loadouts.tsx) and the cards screen
// (LoadoutsScreen.tsx). A loadout remembers which mods were on among the mods shown when it was
// saved (its scope, e.g. everything filtered to Black Panther). Stored in localStorage.
import { useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type Mod = { path: string; enabled?: boolean }
export type Loadout = { id: string; name: string; label: string; scope: string[]; on: string[]; image?: string }

const STORAGE = 'caleb.loadouts'
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const notify = () => listeners.forEach(l => l())

export const readLoadouts = (): Loadout[] => JSON.parse(localStorage.getItem(STORAGE) || '[]')
/** Throws when localStorage is full (large images). */
export const writeLoadouts = (list: Loadout[]) => {
  localStorage.setItem(STORAGE, JSON.stringify(list))
  notify()
}
export const patchLoadout = (id: string, patch: Partial<Loadout>) =>
  writeLoadouts(readLoadouts().map(l => (l.id === id ? { ...l, ...patch } : l)))
export const deleteLoadout = (id: string) => writeLoadouts(readLoadouts().filter(l => l.id !== id))

export const useLoadouts = (): Loadout[] =>
  JSON.parse(useSyncExternalStore(subscribe, () => localStorage.getItem(STORAGE) || '[]'))

/** Same mod across enable/disable renames: file name without .pak / .bak_repak / .pak_disabled. */
export const modKey = (path: string) =>
  (path.split(/[/\\]/).pop() || path).replace(/(\.pak)?(\.bak_repak|\.pak_disabled)?$/i, '').replace(/_disabled$/i, '')

export const snapshotLoadout = (base: Pick<Loadout, 'id' | 'name'> & Partial<Loadout>, scopeMods: Mod[], label: string): Loadout => ({
  ...base,
  label,
  scope: scopeMods.map(m => modKey(m.path)),
  on: scopeMods.filter(m => m.enabled).map(m => modKey(m.path)),
})

/** Mods to flip so the loadout is on: its mods on, the rest of its scope off. */
export const changesToTurnOn = (l: Loadout, mods: Mod[]) => {
  const scope = new Set(l.scope)
  const on = new Set(l.on)
  return mods.filter(m => scope.has(modKey(m.path)) && Boolean(m.enabled) !== on.has(modKey(m.path)))
}

/** Mods to flip so the loadout is off: its own mods that are currently on. */
export const changesToTurnOff = (l: Loadout, mods: Mod[]) => {
  const on = new Set(l.on)
  return mods.filter(m => on.has(modKey(m.path)) && m.enabled)
}

export const isActive = (l: Loadout, mods: Mod[]) =>
  mods.some(m => l.scope.includes(modKey(m.path))) && changesToTurnOn(l, mods).length === 0

/** Toggle each mod through the backend; returns how many failed. */
export const flipMods = async (changes: Mod[]) => {
  let failed = 0
  for (const m of changes) {
    try { await invoke('toggle_mod', { modPath: m.path }) } catch { failed++ }
  }
  return failed
}

/** The cards screen open/close state, so any button can open it. */
let screenOpen = false
export const setLoadoutsScreenOpen = (open: boolean) => { screenOpen = open; notify() }
export const useLoadoutsScreenOpen = () => useSyncExternalStore(subscribe, () => screenOpen)
