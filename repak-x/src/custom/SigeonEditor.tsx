// caleb fork: Sigeon V2 config editor (backend: caleb_sigeon.rs). Each SigeonLoader.<preset>.ini in Desktop\Sigeon V2
// is edited as its own lines, so its notes, order and license line stay as they are; the license never reaches this file.
import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion } from 'framer-motion'
import { Copy, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import Switch from '../components/ui/Switch'
import CustomDropdown from '../components/CustomDropdown'
import type { useAlert } from '../components/AlertHandler'

export type Line =
  | { kind: 'blank' }
  | { kind: 'comment'; text: string }
  | { kind: 'section'; name: string }
  | { kind: 'entry'; key: string; value: string; on: boolean }
  | { kind: 'license' }
  | { kind: 'raw'; text: string }
type Status = { state: string; presets: string[]; game_running: boolean; problem?: string | null }
type Alert = ReturnType<typeof useAlert>

const VARIANTS = [
  { value: 'base', label: 'Base', note: 'The standard Sigeon V2 config' },
  { value: 'high', label: 'High', note: 'Highest quality that still gains FPS' },
  { value: 'mid', label: 'Mid', note: 'A balance of looks and performance' },
  { value: 'low', label: 'Low', note: 'Lowest quality for the most FPS (gray heroes)' },
  { value: 'n64', label: 'N64', note: 'Pixelated, N64-style textures' },
]
const TOGGLES = [
  { key: 'lowLatency', label: 'Low latency', note: 'Lower input latency for a little FPS' },
  { key: 'fixDarkMaps', label: 'Brighter maps', note: 'Stops the light culling that makes maps too dark' },
  { key: 'darkHair', label: 'Darker hair', note: 'Slightly darker hair, small FPS gain' },
  { key: 'fontAA', label: 'Smooth text', note: 'Font anti-aliasing (off is sharper)' },
]
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- the ini as lines: top settings live before the first [Section], overrides inside sections ----------
const firstSection = (ls: Line[]) => { const i = ls.findIndex(l => l.kind === 'section'); return i < 0 ? ls.length : i }
const findTop = (ls: Line[], key: string) =>
  ls.slice(0, firstSection(ls)).findIndex(l => l.kind === 'entry' && l.key.toLowerCase() === key.toLowerCase())
/** A top setting's value, or null when the line is missing or commented out (the config's own value applies). */
export const getTop = (ls: Line[], key: string) => {
  const l = ls[findTop(ls, key)]
  return l?.kind === 'entry' && l.on ? l.value : null
}
/** Sets a top setting; null comments it out. A missing one goes after the last top setting. */
export const setTop = (ls: Line[], key: string, value: string | null): Line[] => {
  const i = findTop(ls, key)
  const next = [...ls]
  if (i >= 0) {
    const l = ls[i] as Extract<Line, { kind: 'entry' }>
    next[i] = value === null ? { ...l, on: false } : { ...l, value, on: true }
    return next
  }
  if (value === null) return ls
  const top = ls.slice(0, firstSection(ls))
  const last = top.map(l => l.kind).lastIndexOf('entry')
  next.splice(last >= 0 ? last + 1 : top.length, 0, { kind: 'entry', key, value, on: true })
  return next
}
/** [Section] blocks: name, its header index and the index after its last line. */
export const sections = (ls: Line[]) => {
  const out: { name: string; at: number; end: number }[] = []
  ls.forEach((l, i) => {
    if (l.kind !== 'section') return
    if (out.length) out[out.length - 1].end = i
    out.push({ name: l.name, at: i, end: ls.length })
  })
  return out
}
/** Adds key=value at the end of a section, before its trailing blank lines. */
export const addEntry = (ls: Line[], sectionAt: number, key: string, value: string): Line[] => {
  const s = sections(ls).find(x => x.at === sectionAt)
  if (!s) return ls
  let at = s.end
  while (at - 1 > s.at && ls[at - 1].kind === 'blank') at--
  const next = [...ls]
  next.splice(at, 0, { kind: 'entry', key, value, on: true })
  return next
}

const same = (a?: Line[], b?: Line[]) => JSON.stringify(a) === JSON.stringify(b)
const KEY_OK = /^[A-Za-z0-9!._\-/:]{1,128}$/
const NAME_OK = /^[A-Za-z0-9_-]{1,32}$/

if (import.meta.env.DEV) {
  const sample: Line[] = [{ kind: 'license' }, { kind: 'entry', key: 'variant', value: 'high', on: true },
    { kind: 'entry', key: 'gamma', value: '0', on: false }, { kind: 'blank' }, { kind: 'section', name: 'Overrides' },
    { kind: 'comment', text: ' notes' }, { kind: 'entry', key: 'r.Fog', value: '0', on: true }, { kind: 'blank' }]
  console.assert(getTop(sample, 'variant') === 'high' && getTop(sample, 'gamma') === null, 'getTop')
  console.assert(getTop(setTop(sample, 'gamma', '2.2'), 'gamma') === '2.2', 'setTop uncomments')
  const added = setTop(sample, 'darkHair', '1')
  console.assert((added[3] as { key: string }).key === 'darkHair', 'new setting after the last one (commented ones count)')
  const more = addEntry(sample, 4, 'r.DetailMode', '1')
  console.assert((more[7] as { key: string }).key === 'r.DetailMode' && more[8].kind === 'blank', 'override before trailing blanks')
  console.assert(more.filter(l => l.kind === 'license').length === 1, 'license line untouched')
}

export default function SigeonEditor({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [saved, setSaved] = useState<Record<string, Line[]>>({})
  const [drafts, setDrafts] = useState<Record<string, Line[]>>({})
  const [pick, setPick] = useState<string | null>(null)
  const [naming, setNaming] = useState<{ mode: 'new' | 'rename'; value: string } | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<Record<number, { key: string; value: string }>>({})
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const load = async (keep?: string) => {
    const s = await invoke<Status>('sigeon_status').catch(() => null)
    setStatus(s)
    const names = s?.presets ?? []
    const read = await Promise.all(names.map(n => invoke<Line[]>('sigeon_read', { preset: n }).then(ls => [n, ls] as const).catch(() => null)))
    setSaved(Object.fromEntries(read.filter(Boolean) as (readonly [string, Line[]])[]))
    setPick(p => (keep && names.includes(keep) ? keep : p && names.includes(p) ? p : (s && names.includes(s.state) ? s.state : names[0] ?? null)))
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
      if (e.key.toLowerCase() === 's' && e.ctrlKey) { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const lines = pick ? drafts[pick] ?? saved[pick] : undefined
  const dirty = (n: string) => Boolean(drafts[n]) && !same(drafts[n], saved[n])
  const anyDirty = Object.keys(drafts).some(dirty)
  const edit = (f: (ls: Line[]) => Line[]) => { if (pick && lines) setDrafts(d => ({ ...d, [pick]: f(lines) })) }
  const changed = () => window.dispatchEvent(new Event('sigeon-changed'))
  const inUse = status?.state === pick
  const knownKeys = useMemo(() => [...new Set(Object.values(saved).flat().flatMap(l => l.kind === 'entry' ? [l.key] : []))].sort(), [saved])

  const close = () => { if (anyDirty && !leaving) setLeaving(true); else onClose() }

  const save = async () => {
    if (!pick || !lines || !dirty(pick) || busy) return
    setBusy(true)
    try {
      const r = await invoke<{ state: string; applied: boolean }>('sigeon_save', { preset: pick, lines })
      setSaved(s => ({ ...s, [pick]: lines }))
      setDrafts(({ [pick]: _, ...rest }) => rest)
      alert.success(`${label(pick)} saved`, r.applied ? 'In use: the game picks it up next launch.'
        : inUse && status?.game_running ? 'Close the game, then pick it in Sigeon again to apply it.' : 'Pick it in Sigeon to use it.')
      setStatus(s => s && { ...s, state: r.state })
      changed()
    } catch (e) { alert.warning('Not saved', String(e)) }
    setBusy(false)
  }

  const use = async () => {
    if (!pick) return
    try {
      const state = await invoke<string>('sigeon_set', { preset: pick })
      alert.success('Sigeon', `${label(state)} config is on. Applies next game launch.`)
      setStatus(s => s && { ...s, state })
      changed()
    } catch (e) { alert.warning('Sigeon not switched', String(e)) }
  }

  const commitName = async () => {
    if (!naming || !pick) return
    const name = naming.value.trim()
    if (!NAME_OK.test(name) || ['off', 'custom'].includes(name.toLowerCase())) {
      alert.warning('Pick another name', 'Letters, numbers, - or _ (up to 32).')
      return
    }
    try {
      if (naming.mode === 'new') {
        await invoke('sigeon_create', { name, from: pick })
        alert.success('Config added', `${label(name)} starts as a copy of ${label(pick)}.`)
      } else if (name !== pick) {
        await invoke('sigeon_rename', { from: pick, to: name })
        setDrafts(({ [pick]: d, ...rest }) => (d ? { ...rest, [name]: d } : rest))
      }
      setNaming(null)
      await load(name)
      changed()
    } catch (e) { alert.warning('Not done', String(e)) }
  }

  const remove = async () => {
    if (!pick) return
    const name = pick
    try {
      await invoke('sigeon_delete', { name })
      setDrafts(({ [name]: _, ...rest }) => rest)
      await load()
      changed()
      const id = alert.info(`${label(name)} deleted`, 'Kept in Sigeon V2\\.deleted until you undo or delete it there.', {
        duration: 10000,
        action: { label: 'Undo', onClick: async () => {
          alert.dismissAlert(id)
          await invoke('sigeon_restore', { name }).catch(e => alert.warning('Not restored', String(e)))
          await load(name)
          changed()
        } },
      })
    } catch (e) { alert.warning('Not deleted', String(e)) }
  }

  const top = (key: string) => (lines ? getTop(lines, key) : null)
  const variant = top('variant') ?? 'base'
  const stretch = Number(top('stretched') ?? '1') || 1
  const gamma = top('gamma')
  const cas = top('enableCAS')
  const q = query.trim().toLowerCase()

  return (
    <div className="modal-overlay" onClick={close}>
      <motion.div className="modal-content sg-modal" role="dialog" aria-label="Sigeon configs" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
        <div className="modal-header">
          <h2>Sigeon configs</h2>
          <button className="modal-close" onClick={close} aria-label="Close">×</button>
        </div>

        <div className="sg-body">
          <aside className="sg-list" aria-label="Configs">
            {(status?.presets ?? []).map(n => (
              <button key={n} type="button" className="sg-preset" aria-pressed={n === pick} onClick={() => { setPick(n); setNaming(null) }}>
                <span>{label(n)}</span>
                {dirty(n) && <i className="sg-dot" title="Unsaved changes" />}
                {status?.state === n && <span className="sg-pill">In use</span>}
              </button>
            ))}
            {naming ? (
              <input className="sg-name" autoFocus value={naming.value} aria-label={naming.mode === 'new' ? 'New config name' : 'Config name'}
                placeholder={naming.mode === 'new' ? 'New config name' : ''} onChange={e => setNaming({ ...naming, value: e.target.value })}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setNaming(null) }}
                onBlur={() => setNaming(null)} />
            ) : (
              <div className="sg-list-actions">
                <button type="button" className="lo-text-btn" disabled={!pick} onClick={() => setNaming({ mode: 'new', value: '' })}
                  title={pick ? `A new config, starting as a copy of ${label(pick)}` : undefined}><Plus size={14} /> New</button>
                <button type="button" className="lo-text-btn sg-icon" disabled={!pick} onClick={() => setNaming({ mode: 'rename', value: pick ?? '' })}
                  title="Rename" aria-label="Rename"><Pencil size={14} /></button>
                <button type="button" className="lo-text-btn sg-icon" disabled={!pick} onClick={() => setNaming({ mode: 'new', value: `${pick}-copy` })}
                  title="Duplicate" aria-label="Duplicate"><Copy size={14} /></button>
                <button type="button" className="lo-text-btn sg-icon" disabled={!pick || inUse} onClick={remove}
                  title={inUse ? 'In use: switch to another config or turn Sigeon off first' : 'Delete'} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            )}
            <p className="sg-foot">Desktop\Sigeon V2. Your license key stays in each file as it is and is never shown here.</p>
          </aside>

          {!lines ? (
            <div className="sg-empty">{status?.problem ?? 'No configs found in Desktop\\Sigeon V2.'}</div>
          ) : (
            <div className="sg-edit">
              <div className="sg-head">
                <h3>{label(pick!)}</h3>
                {inUse
                  ? <span className="sg-status">In use{status?.game_running ? ', game running' : ''}. Saving updates the game's copy.</span>
                  : <button type="button" className="lo-text-btn" onClick={use} disabled={Boolean(status?.game_running || status?.problem || dirty(pick!))}
                      title={dirty(pick!) ? 'Save first' : status?.game_running ? 'Close the game first' : undefined}>Use this config</button>}
              </div>

              <section className="sg-section">
                <h4>Config</h4>
                <div className="sg-row">
                  <div><b>Base config</b><small>{VARIANTS.find(v => v.value === variant)?.note ?? 'A config this editor does not know'}</small></div>
                  <CustomDropdown options={VARIANTS.map(v => ({ value: v.value, label: v.label }))} value={variant}
                    onChange={v => edit(ls => setTop(ls, 'variant', v))} />
                </div>
                {TOGGLES.map(t => (
                  <div className="sg-row" key={t.key}>
                    <div><b>{t.label}</b><small>{t.note}</small></div>
                    <Switch size="sm" checked={top(t.key) === '1'} aria-label={t.label}
                      onChange={on => edit(ls => setTop(ls, t.key, on ? '1' : '0'))} />
                  </div>
                ))}
                <div className="sg-row">
                  <div><b>Stretched resolution</b><small>{stretch <= 1 ? 'Off' : `App scale ${stretch.toFixed(2)}, for stretched res without black bars`}</small></div>
                  <input type="range" min={1} max={2} step={0.05} value={stretch} aria-label="Stretched resolution"
                    onChange={e => edit(ls => setTop(ls, 'stretched', Number(e.target.value).toFixed(2).replace(/0$/, '')))} />
                </div>
                <div className="sg-row">
                  <div><b>Gamma</b><small>{gamma === null ? "The config's own look" : 'Higher is darker; 2.2 suits most screens; 0 is the game default'}</small></div>
                  <div className="sg-inline">
                    <div className="mod-state-filter" role="group" aria-label="Gamma">
                      <button type="button" aria-pressed={gamma === null} onClick={() => edit(ls => setTop(ls, 'gamma', null))}>Config's own</button>
                      <button type="button" aria-pressed={gamma !== null} onClick={() => gamma === null && edit(ls => setTop(ls, 'gamma', '2.2'))}>Custom</button>
                    </div>
                    {gamma !== null && <input className="sg-num" type="number" min={0} max={5} step={0.1} value={gamma} aria-label="Gamma value"
                      onChange={e => edit(ls => setTop(ls, 'gamma', e.target.value))} />}
                  </div>
                </div>
                <div className="sg-row">
                  <div><b>Sharpening</b><small>Contrast adaptive sharpening (only Low ships it off)</small></div>
                  <div className="mod-state-filter" role="group" aria-label="Sharpening">
                    {([[null, "Config's own"], ['1', 'On'], ['0', 'Off']] as const).map(([v, t]) => (
                      <button key={t} type="button" aria-pressed={cas === v} onClick={() => edit(ls => setTop(ls, 'enableCAS', v))}>{t}</button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="sg-section">
                <div className="sg-section-head">
                  <h4>Overrides</h4>
                  <label className="sg-search"><Search size={14} />
                    <input value={query} placeholder="Find a setting" aria-label="Find a setting" onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => e.stopPropagation()} />
                  </label>
                </div>
                <p className="sg-hint">Console settings on top of the config; they win over everything above. Notes from the file stay where they are.</p>
                {sections(lines).map(s => {
                  const add = adding[s.at] ?? { key: '', value: '' }
                  const addOk = KEY_OK.test(add.key.trim()) && !/^licensekey$/i.test(add.key.trim())
                  return (
                    <div className="sg-block" key={s.at}>
                      {s.name !== 'Overrides' && <div className="sg-block-name">[{s.name}]</div>}
                      {lines.slice(s.at + 1, s.end).map((l, j) => {
                        const i = s.at + 1 + j
                        if (l.kind === 'comment' && !q) return <p key={i} className="sg-note">{l.text.trim()}</p>
                        if (l.kind !== 'entry' || (q && !l.key.toLowerCase().includes(q))) return null
                        return (
                          <div key={i} className={`sg-entry${l.on ? '' : ' is-off'}`}>
                            <Switch size="sm" checked={l.on} aria-label={`${l.key} in force`}
                              onChange={on => edit(ls => ls.map((x, k) => (k === i ? { ...l, on } : x)))} />
                            <code title={l.key}>{l.key}</code>
                            <input value={l.value} aria-label={`${l.key} value`} onKeyDown={e => e.stopPropagation()}
                              onChange={e => edit(ls => ls.map((x, k) => (k === i ? { ...l, value: e.target.value } : x)))} />
                            <button type="button" className="sg-x" title={`Remove ${l.key}`} aria-label={`Remove ${l.key}`}
                              onClick={() => edit(ls => ls.filter((_, k) => k !== i))}><X size={14} /></button>
                          </div>
                        )
                      })}
                      <form className="sg-entry sg-add" onSubmit={e => {
                        e.preventDefault()
                        if (!addOk) return
                        edit(ls => addEntry(ls, s.at, add.key.trim(), add.value.trim()))
                        setAdding(a => ({ ...a, [s.at]: { key: '', value: '' } }))
                      }}>
                        <Plus size={14} className="sg-add-icon" />
                        <input list="sg-keys" value={add.key} placeholder="r.SettingName" aria-label="New setting name" onKeyDown={e => e.stopPropagation()}
                          onChange={e => setAdding(a => ({ ...a, [s.at]: { ...add, key: e.target.value } }))} />
                        <input value={add.value} placeholder="value" aria-label="New setting value" onKeyDown={e => e.stopPropagation()}
                          onChange={e => setAdding(a => ({ ...a, [s.at]: { ...add, value: e.target.value } }))} />
                        <button type="submit" className="lo-text-btn" disabled={!addOk}>Add</button>
                      </form>
                    </div>
                  )
                })}
                {sections(lines).length === 0 && (
                  <button type="button" className="lo-text-btn" onClick={() => edit(ls => [...ls, { kind: 'blank' }, { kind: 'section', name: 'Overrides' }])}>
                    <Plus size={14} /> Add an Overrides section
                  </button>
                )}
                <datalist id="sg-keys">{knownKeys.map(k => <option key={k} value={k} />)}</datalist>
              </section>
            </div>
          )}
        </div>

        <div className="modal-footer sg-footer">
          {leaving ? (
            <>
              <span className="sg-leave">Unsaved changes in {Object.keys(drafts).filter(dirty).map(label).join(', ')}.</span>
              <button type="button" className="lo-text-btn" onClick={() => setLeaving(false)}>Keep editing</button>
              <button type="button" className="lo-text-btn" onClick={onClose}>Discard</button>
            </>
          ) : (
            <>
              <button type="button" className="lo-text-btn" disabled={!pick || !dirty(pick)}
                onClick={() => setDrafts(({ [pick!]: _, ...rest }) => rest)}>Revert</button>
              <button type="button" className="btn-primary sg-save" disabled={!pick || !dirty(pick) || busy} onClick={save} title="Ctrl+S">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
