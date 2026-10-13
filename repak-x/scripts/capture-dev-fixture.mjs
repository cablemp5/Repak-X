// Snapshot your real Repak-X library (read only) into src/dev/fixture.local.json,
// which the browser preview's fake backend (src/dev/mockBackend.ts) serves.
// Usage (from repak-x/): node scripts/capture-dev-fixture.mjs
import fs from 'node:fs'
import path from 'node:path'

const appDir = path.join(process.env.APPDATA, 'Repak-X')
const state = JSON.parse(fs.readFileSync(path.join(appDir, 'state.json'), 'utf8'))
const characterData = JSON.parse(fs.readFileSync(path.join(appDir, 'character_data.json'), 'utf8'))
const root = path.normalize(state.game_path)
const rootName = path.basename(root)
const MOD_EXT = ['.pak', '.bak_repak', '.pak_disabled']

const camel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
const settings = Object.fromEntries(Object.entries(state).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [camel(k), v]))

const mods = [], folders = [], details = {}
const isMod = f => MOD_EXT.includes(path.extname(f))

// Mirrors get_pak_files / get_folders in main_tauri.rs
function walk(dir) {
  const rel = path.relative(root, dir).replaceAll('\\', '/')
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  folders.push({
    id: rel || rootName, name: rel ? path.basename(dir) : rootName, enabled: true, expanded: true, color: null,
    depth: rel ? rel.split('/').length : 0,
    parent_id: rel ? (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : rootName) : null,
    is_root: !rel, mod_count: entries.filter(e => e.isFile() && isMod(e.name)).length,
  })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p); continue }
    if (!isMod(e.name)) continue
    const ext = path.extname(e.name)
    const stem = path.basename(e.name, ext)
    const base = path.join(dir, stem)
    const ucas = fs.existsSync(base + '.ucas') ? base + '.ucas' : null
    const nines = stem.match(/_(9+)_P$/)
    mods.push({
      path: p, utoc_path: fs.existsSync(base + '.utoc') ? base + '.utoc' : null,
      enabled: ext === '.pak', custom_name: null, folder_id: rel || rootName,
      custom_tags: state.mod_tags?.[stem.replace(/_disabled$/, '')] ?? [],
      file_size: fs.statSync(ucas ?? p).size, modified_date: Math.floor(fs.statSync(p).mtimeMs / 1000),
      priority: stem.startsWith('!') ? 0 : nines && nines[1].length >= 7 ? nines[1].length - 6 : 0,
      character_name: null, skin_name: null,
    })
    details[p] = guessDetails(stem, !!ucas, fs.statSync(ucas ?? p).size)
  }
}

// shortcut: hero and category are guessed from the file name, not read from the pak; fine for a visual preview
function guessDetails(stem, isIostore, size) {
  const n = stem.toLowerCase()
  const panther = /panther|^bp|catboy|wakanda|kow|kingof|damisa|bast/.test(n)
  const category = /vfx|lightning|trail|swipe|glow|flame|fire/.test(n) ? 'VFX'
    : /sfx|sound|voice|audio/.test(n) ? 'Audio'
    : /icon|text|prompt|ui|wheel/.test(n) ? 'UI'
    : /texture|color|normals|blush/.test(n) ? 'Texture' : 'Mesh'
  const character_name = panther ? 'Black Panther' : ''
  return {
    mod_name: stem, mod_type: character_name ? `${character_name} - ${category}` : category,
    character_name, category, character_id: panther ? '1026' : '',
    file_count: 12, total_size: size, files: [], is_iostore: isIostore, is_encrypted: false,
    has_blueprint: /bp|blueprint/.test(n), is_hybrid: false,
  }
}

walk(root)
const out = path.join(import.meta.dirname, '..', 'src', 'dev', 'fixture.local.json')
fs.writeFileSync(out, JSON.stringify({ gamePath: root, settings, tags: state.custom_tag_catalog ?? [], characterData, mods, folders, details }, null, 1))
console.log(`Wrote ${mods.length} mods, ${folders.length} folders to ${out}`)
