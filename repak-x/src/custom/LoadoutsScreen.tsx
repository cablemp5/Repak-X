// caleb fork: full-window loadouts screen. Each loadout is a card with optional media (image, GIF or
// looping video; upload or paste), an on/off switch and an expandable list of its mods.
// On = its mods on, the rest of its group off, and other loadouts sharing mods off. Off = its mods off.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ImageOff, ImagePlus, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import Switch from '../components/ui/Switch'
import { type LoadoutProps, runChanges } from './Loadouts'
import { deleteMedia, prepareMedia, putMedia, useMediaUrl } from './loadoutMedia'
import {
  type Loadout, changesToTurnOff, deleteLoadout, displayName, isActive, modKey, patchLoadout, planTurnOn,
  readLoadouts, setLoadoutsScreenOpen, snapshotLoadout, useLoadouts, useLoadoutsScreenOpen, writeLoadouts,
} from './loadoutStore'

function CardMedia({ l }: { l: Loadout }) {
  const url = useMediaUrl(l.id, l.mediaRev)
  const src = url ?? l.image
  if (!src) return <span className="lo-card-placeholder"><ImagePlus size={22} /><span>Click to upload, or hover and paste</span></span>
  return l.mediaType === 'video' && url
    ? <video src={url} autoPlay loop muted playsInline />
    : <img src={src} alt="" />
}

export default function LoadoutsScreen(p: LoadoutProps) {
  const open = useLoadoutsScreenOpen()
  const loadouts = useLoadouts()
  const [busy, setBusy] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaTarget = useRef<string | null>(null)
  const hovered = useRef<string | null>(null)

  const setMedia = async (id: string, file: File) => {
    try {
      const { blob, type } = await prepareMedia(file)
      await putMedia(id, blob)
      patchLoadout(id, { mediaType: type, mediaRev: Date.now(), image: undefined })
    } catch (e) {
      p.alert.error('Media not saved', e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setLoadoutsScreenOpen(false) } }
    // Ctrl+V with an image, GIF or video on the clipboard sets the hovered card's media
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find(f => /^(image|video)\//.test(f.type))
      if (!file) return
      e.preventDefault()
      if (hovered.current) setMedia(hovered.current, file)
      else p.alert.info('Hover a card first', 'Point at the loadout card, then paste.')
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('paste', onPaste)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('paste', onPaste) }
  }, [open])

  if (!open) return null

  const toggle = async (l: Loadout, on: boolean) => {
    setBusy(l.id)
    if (on) {
      const { flips, displaced } = planTurnOn(l, readLoadouts(), p.mods)
      await runChanges(p, l, flips, 'on', displaced)
    } else {
      await runChanges(p, l, changesToTurnOff(l, p.mods), 'off')
    }
    setBusy(null)
  }

  const pickMedia = (id: string) => {
    mediaTarget.current = id
    fileRef.current?.click()
  }

  const create = () => {
    const trimmed = name.trim()
    if (trimmed) writeLoadouts([...readLoadouts(), snapshotLoadout({ id: crypto.randomUUID(), name: trimmed }, p.scopeMods, p.scopeLabel)])
    setNaming(false)
    setName('')
  }

  const toggleExpanded = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Portal: the sidebar that mounts this sits inside animated, overflow-clipped panels
  return createPortal(
    <div className="lo-screen" role="dialog" aria-label="Loadouts">
      <header className="lo-screen-head">
        <div>
          <h2>Loadouts</h2>
          <p>On switches a loadout's mods on, the rest of its group off, and any other loadout sharing its mods off. Off switches its mods off. Press L to open or close.</p>
        </div>
        <button type="button" className="lo-icon lo-close" title="Close (Esc)" onClick={() => setLoadoutsScreenOpen(false)}>
          <X size={18} />
        </button>
      </header>

      <input ref={fileRef} type="file" accept="image/*,video/*" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f && mediaTarget.current) setMedia(mediaTarget.current, f); e.target.value = '' }} />

      <div className="lo-grid">
        {loadouts.map(l => {
          const active = isActive(l, p.mods)
          const byKey = new Map(p.mods.map(m => [modKey(m.path), m]))
          const present = l.scope.filter(k => byKey.has(k)).length
          const isOpen = expanded.has(l.id)
          const hasMedia = Boolean(l.mediaRev || l.image)
          return (
            <article key={l.id} className={`lo-card ${active ? 'is-on' : ''}`}
              onMouseEnter={() => { hovered.current = l.id }} onMouseLeave={() => { if (hovered.current === l.id) hovered.current = null }}>
              <button type="button" className="lo-card-image" onClick={() => pickMedia(l.id)}
                title={hasMedia ? 'Change image or video (or paste one)' : 'Add an image, GIF or video (or paste one)'}>
                <CardMedia l={l} />
              </button>
              <div className="lo-card-body">
                <div className="lo-card-title">
                  <h3 title={l.name}>{l.name}</h3>
                  <Switch size="sm" color="primary" checked={active} disabled={busy !== null}
                    title={active ? `Turn ${l.name} off` : `Turn ${l.name} on`}
                    onChange={(checked: boolean) => toggle(l, checked)} />
                </div>
                <p className="lo-card-meta">
                  {busy === l.id ? 'Switching mods…' : <>{l.label}<span className="lo-sep">·</span>{l.on.length} of {present} mods on</>}
                </p>
                <div className="lo-card-actions">
                  <button type="button" className="lo-expand" aria-expanded={isOpen} onClick={() => toggleExpanded(l.id)}>
                    {l.on.length} mods <ChevronDown size={14} />
                  </button>
                  <span className="lo-card-tools">
                    <button type="button" className="lo-icon" title={`Overwrite ${l.name} with the shown mods' current state`}
                      onClick={() => { patchLoadout(l.id, snapshotLoadout(l, p.scopeMods, p.scopeLabel)); p.alert.success('Loadout updated', `${l.name} now matches the ${p.scopeMods.length} shown mods.`) }}>
                      <RefreshCw size={14} />
                    </button>
                    {hasMedia && (
                      <button type="button" className="lo-icon" title="Remove image or video"
                        onClick={() => { deleteMedia(l.id); patchLoadout(l.id, { image: undefined, mediaRev: undefined, mediaType: undefined }) }}>
                        <ImageOff size={14} />
                      </button>
                    )}
                    <button type="button" className="lo-icon" title={`Delete ${l.name}`} onClick={() => deleteLoadout(l.id)}>
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
                {isOpen && (
                  <ul className="lo-mod-list">
                    {l.on.length === 0 && <li className="lo-mod-missing">No mods on in this loadout.</li>}
                    {[...l.on].sort((a, b) => a.localeCompare(b)).map(key => {
                      const mod = byKey.get(key)
                      return (
                        <li key={key} className={mod ? (mod.enabled ? 'is-on' : '') : 'lo-mod-missing'}
                          title={mod ? (mod.enabled ? 'On now' : 'Off now') : 'Not installed anymore'}>
                          <span className="lo-mod-dot" />
                          <span className="lo-mod-name">{displayName(key)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </article>
          )
        })}

        <div className="lo-card lo-card-new">
          {naming ? (
            <div className="lo-new">
              <input autoFocus value={name} placeholder="Loadout name" onChange={e => setName(e.target.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') create(); if (e.key === 'Escape') { setNaming(false); setName('') } }}
                onBlur={create} />
              <p className="lo-hint">Saves which of the {p.scopeMods.length} shown mods ({p.scopeLabel}) are on.</p>
            </div>
          ) : (
            <button type="button" className="lo-card-add" onClick={() => setNaming(true)}>
              <Plus size={20} />
              <span>Save the shown mods as a loadout</span>
              <small>{p.scopeLabel}<span className="lo-sep">·</span>{p.scopeMods.filter(m => m.enabled).length} of {p.scopeMods.length} on</small>
            </button>
          )}
        </div>
      </div>
    </div>
  , document.body)
}
