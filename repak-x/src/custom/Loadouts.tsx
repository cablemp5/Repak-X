// caleb fork: saved loadouts. A loadout remembers which mods were on among the mods shown when it
// was saved (its scope, e.g. everything filtered to Black Panther). Applying it turns exactly those
// on and the rest of that scope off; mods outside the scope are never touched.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Check, Plus, Save, X } from 'lucide-react'
import type { useAlert } from '../components/AlertHandler'

type Mod = { path: string; enabled?: boolean }
export type Loadout = { id: string; name: string; label: string; scope: string[]; on: string[] }

const STORAGE = 'caleb.loadouts'
const listeners = new Set<() => void>()
const read = (): Loadout[] => JSON.parse(localStorage.getItem(STORAGE) || '[]')
const write = (list: Loadout[]) => {
  localStorage.setItem(STORAGE, JSON.stringify(list))
  listeners.forEach(l => l())
}
const useLoadouts = () =>
  JSON.parse(useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l) },
    () => localStorage.getItem(STORAGE) || '[]',
  )) as Loadout[]

/** Same mod across enable/disable renames: file name without .pak / .bak_repak / .pak_disabled. */
export const modKey = (path: string) =>
  (path.split(/[/\\]/).pop() || path).replace(/(\.pak)?(\.bak_repak|\.pak_disabled)?$/i, '').replace(/_disabled$/i, '')

/** Mods whose state must flip to match the loadout (empty = already active). */
export const changesFor = (loadout: Loadout, mods: Mod[]) => {
  const scope = new Set(loadout.scope)
  const on = new Set(loadout.on)
  return mods.filter(m => scope.has(modKey(m.path)) && Boolean(m.enabled) !== on.has(modKey(m.path)))
}

type Props = {
  mods: Mod[]            // every installed mod
  scopeMods: Mod[]       // mods currently shown (folder, hero, type, tag and search filters)
  scopeLabel: string     // what the current filters mean, e.g. "Black Panther"
  blocked: boolean       // game running and the lock is not bypassed
  reload: () => Promise<unknown>
  alert: ReturnType<typeof useAlert>
}

export default function Loadouts({ mods, scopeMods, scopeLabel, blocked, reload, alert }: Props) {
  const loadouts = useLoadouts()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (naming) inputRef.current?.focus() }, [naming])

  const snapshot = (base: Pick<Loadout, 'id' | 'name'>): Loadout => ({
    ...base,
    label: scopeLabel,
    scope: scopeMods.map(m => modKey(m.path)),
    on: scopeMods.filter(m => m.enabled).map(m => modKey(m.path)),
  })

  const save = () => {
    const trimmed = name.trim()
    if (trimmed) write([...read(), snapshot({ id: crypto.randomUUID(), name: trimmed })])
    setNaming(false)
    setName('')
  }

  const update = (l: Loadout) => {
    write(read().map(x => (x.id === l.id ? snapshot(l) : x)))
    alert.success('Loadout updated', `${l.name} now matches the ${scopeMods.length} shown mods.`)
  }

  const remove = (l: Loadout) => write(read().filter(x => x.id !== l.id))

  const apply = async (l: Loadout) => {
    if (blocked) {
      alert.warning('Game Running', 'Cannot toggle mods while game is running.')
      return
    }
    const changes = changesFor(l, mods)
    if (changes.length === 0) return
    setBusy(l.id)
    let failed = 0
    for (const m of changes) {
      try { await invoke('toggle_mod', { modPath: m.path }) } catch { failed++ }
    }
    await reload()
    setBusy(null)
    if (failed) alert.warning('Loadout partly applied', `${failed} of ${changes.length} mods could not be switched.`)
    else alert.success(`${l.name} applied`, `${changes.length} mod${changes.length === 1 ? '' : 's'} switched.`)
  }

  return (
    <div className="loadouts">
      <div className="fp-head">
        <span className="fp-title">Loadouts</span>
        <button type="button" className="lo-icon" title="Save the shown mods' on/off state as a loadout" onClick={() => setNaming(true)}>
          <Plus size={15} />
        </button>
      </div>

      {loadouts.length === 0 && !naming && (
        <p className="lo-empty">Filter to a hero, set which mods are on, then save it here to switch back in one click.</p>
      )}

      {loadouts.map(l => {
        const pending = changesFor(l, mods).length
        const present = mods.some(m => l.scope.includes(modKey(m.path)))
        const active = present && pending === 0
        return (
          <div className="fp-row-wrap lo-row" key={l.id}>
            <button type="button" className="fp-row" aria-pressed={active} disabled={busy !== null}
              onClick={() => apply(l)} title={active ? `${l.name} is active` : `Apply ${l.name}: switches ${pending} mods in ${l.label}`}>
              <span className="fp-lead">{active ? <Check size={15} className="lo-active" /> : <span className="lo-dot" />}</span>
              <span className="fp-label">{l.name}</span>
              <span className="fp-count">{busy === l.id ? '…' : `${l.on.length} on`}</span>
            </button>
            <button type="button" className="lo-icon lo-hover" title={`Overwrite ${l.name} with the shown mods' current state`} onClick={() => update(l)}>
              <Save size={14} />
            </button>
            <button type="button" className="lo-icon lo-hover" title={`Delete ${l.name}`} onClick={() => remove(l)}>
              <X size={14} />
            </button>
          </div>
        )
      })}

      {naming && (
        <div className="lo-new">
          <input ref={inputRef} value={name} placeholder="Loadout name" onChange={e => setName(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') save(); if (e.key === 'Escape') { setNaming(false); setName('') } }}
            onBlur={save} />
          <p className="lo-hint">Saves which of the {scopeMods.length} shown mods ({scopeLabel}) are on.</p>
        </div>
      )}
    </div>
  )
}
