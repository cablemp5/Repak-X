// repakxtra: loadouts and UI settings saved by repakxtra 0.2 and older sit under an older key prefix. They are copied
// once to their repakxtra.* names, only where nothing is saved under the new name yet, and the old entries stay so an
// older build still finds its own. Imported first in main.tsx, before any module reads its settings.
const OWN = /^(?!repakxtra\.)[a-z]+\.(loadouts|groups|view|loadoutsHeight|loadoutGroupBy|setup\.autoCheck|setup\.galactaFolder|uiScale|hideTags|sound|motion|show\.[\w-]+)$/

/** The entries to add: old-prefix keys whose repakxtra.* name is not saved yet. Pure. */
export const carryOver = (saved: Record<string, string>) =>
  Object.entries(saved).flatMap(([k, v]) => {
    const name = k.match(OWN)?.[1]
    return name && !(`repakxtra.${name}` in saved) ? [[`repakxtra.${name}`, v] as const] : []
  })

for (const [k, v] of carryOver({ ...localStorage })) localStorage.setItem(k, v)

if (import.meta.env.DEV) {
  const out = Object.fromEntries(carryOver({ 'old.loadouts': '[1]', 'old.show.tags': '0', 'old.view': 'home', 'repakxtra.view': 'library',
    'mock.kit': '1', hasSeenOnboarding: 'true' }))
  console.assert(JSON.stringify(out) === JSON.stringify({ 'repakxtra.loadouts': '[1]', 'repakxtra.show.tags': '0' }),
    `carryOver copies only unsaved old keys: ${JSON.stringify(out)}`)
}
