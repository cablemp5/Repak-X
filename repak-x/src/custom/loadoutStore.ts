// caleb fork: saved loadouts, shared by the sidebar list (Loadouts.tsx) and the cards screen
// (LoadoutsScreen.tsx). A loadout remembers which mods were on among the mods shown when it was
// saved (its scope, e.g. everything filtered to Black Panther). Stored in localStorage.
import { useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { deleteMedia } from './loadoutMedia'

export type Mod = { path: string; enabled?: boolean }
export type Loadout = {
  id: string
  name: string
  label: string
  scope: string[]
  on: string[]
  image?: string          // legacy: small data URL kept in localStorage
  mediaType?: 'image' | 'video'
  mediaRev?: number       // set when a file is stored in IndexedDB (loadoutMedia.ts); bumps on change
}

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
export const deleteLoadout = (id: string) => {
  writeLoadouts(readLoadouts().filter(l => l.id !== id))
  deleteMedia(id)
}

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

/**
 * Turning a loadout on also turns off every other active loadout that shares mods with it
 * (overlapping scope): their mods go off unless this loadout wants them on.
 * Returns the flips plus the loadouts that end up switched off.
 */
export const planTurnOn = (l: Loadout, all: Loadout[], mods: Mod[]) => {
  const flips = new Map(changesToTurnOn(l, mods).map(m => [m.path, m]))
  const scope = new Set(l.scope)
  const keep = new Set(l.on)
  const displaced: Loadout[] = []
  for (const k of all) {
    if (k.id === l.id || !isActive(k, mods) || !k.scope.some(key => scope.has(key))) continue
    displaced.push(k)
    for (const m of changesToTurnOff(k, mods)) if (!keep.has(modKey(m.path))) flips.set(m.path, m)
  }
  return { flips: [...flips.values()], displaced }
}

/** Readable mod name from its key: drops the _9999999_P priority suffix. */
export const displayName = (key: string) => key.replace(/(_\d+_P)+$/i, '')

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

// L opens/closes the loadouts screen (main window only: this module loads with the app)
window.addEventListener('keydown', e => {
  const t = e.target as HTMLElement | null
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  if (e.key.toLowerCase() !== 'l' || e.ctrlKey || e.altKey || e.metaKey || typing) return
  e.preventDefault()
  setLoadoutsScreenOpen(!screenOpen)
})
