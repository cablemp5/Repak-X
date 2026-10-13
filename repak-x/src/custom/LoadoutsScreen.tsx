// caleb fork: full-window loadouts screen. Each loadout is a card with an optional preview image and
// an on/off switch. On = its mods on and the rest of its scope off. Off = its own mods off.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, ImagePlus, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import Switch from '../components/ui/Switch'
import { type LoadoutProps, runChanges } from './Loadouts'
import {
  type Loadout, changesToTurnOff, changesToTurnOn, deleteLoadout, isActive, modKey, patchLoadout,
  readLoadouts, setLoadoutsScreenOpen, snapshotLoadout, useLoadouts, useLoadoutsScreenOpen, writeLoadouts,
} from './loadoutStore'

/** Downscale to at most 960 px wide so dozens of cards fit in localStorage. */
async function toPreviewDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 960 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

export default function LoadoutsScreen(p: LoadoutProps) {
  const open = useLoadoutsScreenOpen()
  const loadouts = useLoadouts()
  const [busy, setBusy] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const imageTarget = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setLoadoutsScreenOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null

  const toggle = async (l: Loadout, on: boolean) => {
    setBusy(l.id)
    await runChanges(p, l, on ? changesToTurnOn(l, p.mods) : changesToTurnOff(l, p.mods), on ? 'on' : 'off')
    setBusy(null)
  }

  const pickImage = (id: string) => {
    imageTarget.current = id
    fileRef.current?.click()
  }

  const onFile = async (file?: File) => {
    const id = imageTarget.current
    if (!file || !id) return
    try {
      patchLoadout(id, { image: await toPreviewDataUrl(file) })
    } catch (e) {
      p.alert.error('Image not saved', String(e).includes('quota') ? 'Storage is full; remove an image from another loadout first.' : String(e))
    }
  }

  const create = () => {
    const trimmed = name.trim()
    if (trimmed) writeLoadouts([...readLoadouts(), snapshotLoadout({ id: crypto.randomUUID(), name: trimmed }, p.scopeMods, p.scopeLabel)])
    setNaming(false)
    setName('')
  }

  // Portal: the sidebar that mounts this sits inside animated, overflow-clipped panels
  return createPortal(
    <div className="lo-screen" role="dialog" aria-label="Loadouts">
      <header className="lo-screen-head">
        <div>
          <h2>Loadouts</h2>
          <p>On switches a loadout's mods on and the rest of its group off. Off switches its mods off.</p>
        </div>
        <button type="button" className="lo-icon lo-close" title="Close (Esc)" onClick={() => setLoadoutsScreenOpen(false)}>
          <X size={18} />
        </button>
      </header>

      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={e => { onFile(e.target.files?.[0]); e.target.value = '' }} />

      <div className="lo-grid">
        {loadouts.map(l => {
          const active = isActive(l, p.mods)
          const present = p.mods.filter(m => l.scope.includes(modKey(m.path))).length
          return (
            <article key={l.id} className={`lo-card ${active ? 'is-on' : ''}`}>
              <button type="button" className="lo-card-image" onClick={() => pickImage(l.id)}
                title={l.image ? 'Change image' : 'Add an image of the mods'}>
                {l.image ? <img src={l.image} alt="" /> : (
                  <span className="lo-card-placeholder"><ImagePlus size={22} /><span>Add image</span></span>
                )}
              </button>
              <div className="lo-card-body">
                <div className="lo-card-title">
                  <h3 title={l.name}>{l.name}</h3>
                  <Switch size="sm" color="primary" checked={active} disabled={busy !== null}
                    title={active ? `Turn ${l.name} off` : `Turn ${l.name} on`}
                    onChange={(checked: boolean) => toggle(l, checked)} />
                </div>
                <p className="lo-card-meta">
                  {busy === l.id ? 'Switching mods…' : `${l.label} · ${l.on.length} of ${present} mods on`}
                </p>
                <div className="lo-card-actions">
                  <button type="button" className="lo-icon" title={`Overwrite ${l.name} with the shown mods' current state`}
                    onClick={() => { patchLoadout(l.id, snapshotLoadout(l, p.scopeMods, p.scopeLabel)); p.alert.success('Loadout updated', `${l.name} now matches the ${p.scopeMods.length} shown mods.`) }}>
                    <RefreshCw size={14} />
                  </button>
                  {l.image && (
                    <button type="button" className="lo-icon" title="Remove image" onClick={() => patchLoadout(l.id, { image: undefined })}>
                      <ImageOff size={14} />
                    </button>
                  )}
                  <button type="button" className="lo-icon" title={`Delete ${l.name}`} onClick={() => deleteLoadout(l.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
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
              <small>{p.scopeLabel} · {p.scopeMods.filter(m => m.enabled).length} of {p.scopeMods.length} on</small>
            </button>
          )}
        </div>
      </div>
    </div>
  , document.body)
}
