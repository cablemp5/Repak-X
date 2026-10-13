// caleb fork: show/hide switches for optional UI, saved in localStorage and applied instantly.
// Each pref sets a data-show-* attribute on <html>; caleb.css hides the element when it is absent.
import { useSyncExternalStore } from 'react'
import Checkbox from '../components/ui/Checkbox'

const PREFS = [
  { key: 'priority', label: 'Show load priority counter on mods' },
  { key: 'asset-explorer', label: 'Show Asset Explorer button' },
  { key: 'share', label: 'Show Share button' },
  { key: 'tools', label: 'Show Tools button' },
] as const

const storageKey = (key: string) => `caleb.show.${key}`
const listeners = new Set<() => void>()

const isOn = (key: string) => localStorage.getItem(storageKey(key)) === '1'

const apply = () => PREFS.forEach(({ key }) => document.documentElement.toggleAttribute(`data-show-${key}`, isOn(key)))
apply()

const set = (key: string, on: boolean) => {
  localStorage.setItem(storageKey(key), on ? '1' : '0')
  apply()
  listeners.forEach(l => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export default function CalebUiSettings() {
  const snapshot = useSyncExternalStore(subscribe, () => PREFS.map(p => (isOn(p.key) ? 1 : 0)).join(''))
  return (
    <div className="setting-section">
      <h3>Optional controls</h3>
      <div className="setting-group">
        {PREFS.map(({ key, label }, i) => (
          <div className="setting-item" key={key}>
            <Checkbox checked={snapshot[i] === '1'} onChange={(checked: boolean) => set(key, checked)}>
              <span>{label}</span>
            </Checkbox>
          </div>
        ))}
      </div>
    </div>
  )
}
