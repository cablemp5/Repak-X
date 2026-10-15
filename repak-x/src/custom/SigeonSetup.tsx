// repakxtra: Sigeon V2 setup, opened from the header while Sigeon reads "not configured" (no SigeonLoader.asi in the
// Sigeon folder). Where to buy it, the signature bypass it loads through and the folder its files stay in; the editor
// takes over from there (a config and its license key).
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion } from 'framer-motion'
import { ExternalLink, FolderOpen, SlidersHorizontal } from 'lucide-react'
import { open as pickFolder } from '@tauri-apps/plugin-dialog'
import { open as openUrl } from '@tauri-apps/plugin-shell'
import type { useAlert } from '../components/AlertHandler'

type Storage = { path: string; default: boolean; loader: boolean }
type Bypass = { state: 'installed' | 'disabled' | 'partial' | 'other' | 'missing' }

const STORE = 'https://oinkerhub.com/CABLE'
const BYPASS_LABEL: Record<Bypass['state'], string> = {
  installed: 'Installed', disabled: 'Off', partial: 'Incomplete', other: 'Different version', missing: 'Not installed',
}

export default function SigeonSetup({ alert, onClose, onEdit }: { alert: ReturnType<typeof useAlert>; onClose: () => void; onEdit: () => void }) {
  const [storage, setStorage] = useState<Storage | null>(null)
  const [bypass, setBypass] = useState<Bypass | string | null>(null)   // a string: why it can't be checked
  const [busy, setBusy] = useState(false)

  // again on focus: back from unzipping into Desktop\Sigeon V2 (the default folder), it shows as found
  const check = () => {
    invoke<Storage>('sigeon_storage').then(setStorage).catch(() => {})
    invoke<Bypass>('setup_bypass_status').then(setBypass).catch(e => setBypass(String(e)))
  }
  useEffect(() => {
    check()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('focus', check)
    window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('focus', check); window.removeEventListener('keydown', esc, true) }
  }, [])

  const choose = async () => {
    const path = await pickFolder({ directory: true, title: 'The folder you unzipped Sigeon V2 into' }).catch(() => null)
    if (!path) return
    try {
      const s = await invoke<Storage>('sigeon_set_storage', { path })
      setStorage(s)
      window.dispatchEvent(new Event('sigeon-changed'))
      if (!s.loader) alert.warning('SigeonLoader.asi is not there', 'Choose the folder you unzipped the Sigeon V2 download into.')
    } catch (e) { alert.warning('Folder not set', String(e)) }
  }

  const fixBypass = async (action: 'install' | 'enable') => {
    setBusy(true)
    try {
      setBypass(await invoke<Bypass>('setup_bypass', { action }))
      window.dispatchEvent(new Event('bypass-changed'))
    } catch (e) { alert.warning('Signature bypass', String(e)) }
    setBusy(false)
  }

  const b = typeof bypass === 'object' ? bypass : null
  const ready = Boolean(storage?.loader)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div className="modal-content su-modal ss-modal" role="dialog" aria-label="Set up Sigeon V2" onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
        <div className="modal-header">
          <div>
            <h2>Set up Sigeon V2</h2>
            <p className="su-sub">A performance loader for Marvel Rivals. Once it is set up, repakxtra switches it on and off and edits its configs.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body su-body">
          <section className="su-card">
            <div className="su-card-head">
              <div>
                <h3><span className="ss-num">1</span>Get Sigeon V2</h3>
                <p>Sold on Oinker Hub. You get a download with SigeonLoader.asi in it, and your license key by email.</p>
              </div>
            </div>
            <div className="su-actions">
              <button type="button" className="lo-text-btn" onClick={() => openUrl(STORE).catch(() => window.open(STORE, '_blank'))}>
                <ExternalLink size={14} /> Buy it at oinkerhub.com/CABLE
              </button>
            </div>
          </section>

          <section className="su-card">
            <div className="su-card-head">
              <div>
                <h3><span className="ss-num">2</span>Signature bypass</h3>
                <p>Sigeon loads through it, like every mod. It comes with repakxtra.</p>
              </div>
              <span className={`su-chip is-${b?.state ?? 'missing'}`}>{b ? BYPASS_LABEL[b.state] : bypass ? 'Unknown' : 'Checking…'}</span>
            </div>
            {typeof bypass === 'string' && <p className="su-note">{bypass}</p>}
            {(b?.state === 'missing' || b?.state === 'partial' || b?.state === 'disabled') && (
              <div className="su-actions">
                <button type="button" className="btn-primary su-main" disabled={busy} onClick={() => fixBypass(b.state === 'disabled' ? 'enable' : 'install')}>
                  {busy ? 'Working…' : b.state === 'disabled' ? 'Turn on' : b.state === 'partial' ? 'Repair' : 'Install'}
                </button>
              </div>
            )}
          </section>

          <section className="su-card">
            <div className="su-card-head">
              <div>
                <h3><span className="ss-num">3</span>Sigeon folder</h3>
                <p>Unzip the download into a folder you keep, like Desktop\Sigeon V2, and choose it. Leave the files there: repakxtra copies the loader and the config you pick into the game.</p>
              </div>
              <span className={`su-chip ${ready ? 'is-installed' : 'is-missing'}`}>{!storage ? 'Checking…' : ready ? 'Found' : 'Not found'}</span>
            </div>
            {storage && <p className="su-meta"><code>{storage.path}</code>{!ready && ' has no SigeonLoader.asi.'}</p>}
            <div className="su-actions">
              <button type="button" className={ready ? 'lo-text-btn' : 'btn-primary su-main'} onClick={choose}>
                <FolderOpen size={14} /> {ready ? 'Change folder' : 'Choose folder'}
              </button>
            </div>
          </section>

          <section className="su-card">
            <div className="su-card-head">
              <div>
                <h3><span className="ss-num">4</span>Config and license key</h3>
                <p>Make a config in the editor, then paste your license key into it in Notepad. Your key stays in that file: repakxtra never shows it.</p>
              </div>
            </div>
            <div className="su-actions">
              <button type="button" className="btn-primary su-main" disabled={!ready} onClick={onEdit} title={ready ? undefined : 'Choose the Sigeon folder first'}>
                <SlidersHorizontal size={14} /> Open the editor
              </button>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  )
}
