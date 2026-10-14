//! caleb fork: Sigeon V2 switch, the same logic as Caleb's Desktop `toggle-sigeon.ps1`.
//! Source files live in `%USERPROFILE%\Desktop\Sigeon V2` (SigeonLoader.asi plus one
//! `SigeonLoader.<preset>.ini` per preset). On = copy the .asi and the chosen ini (as
//! SigeonLoader.ini) into the game's Binaries\Win64\plugins folder; off = remove both.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::State;

const ASI: &str = "SigeonLoader.asi";
const LIVE_INI: &str = "SigeonLoader.ini";

#[derive(Serialize)]
pub struct SigeonStatus {
    /// "off", a preset name, or "custom" when the live ini matches no preset
    state: String,
    presets: Vec<String>,
    storage: String,
    plugins: String,
    game_running: bool,
    /// Why switching is unavailable, if it is
    problem: Option<String>,
}

fn storage_dir() -> PathBuf {
    dirs::desktop_dir().unwrap_or_default().join("Sigeon V2")
}

/// ...\Content\Paks\~mods -> ...\Marvel\Binaries\Win64\plugins
fn plugins_dir(mods_dir: &Path) -> Option<PathBuf> {
    Some(mods_dir.parent()?.parent()?.parent()?.join("Binaries").join("Win64").join("plugins"))
}

fn presets(storage: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(storage)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.strip_prefix("SigeonLoader.")?.strip_suffix(".ini").map(str::to_string)
        })
        .collect();
    names.sort();
    names
}

fn current_state(storage: &Path, plugins: &Path) -> String {
    let live = match (plugins.join(ASI).exists(), fs::read(plugins.join(LIVE_INI))) {
        (true, Ok(bytes)) => bytes,
        _ => return "off".into(),
    };
    presets(storage)
        .into_iter()
        .find(|p| fs::read(storage.join(format!("SigeonLoader.{p}.ini"))).ok().as_deref() == Some(&live[..]))
        .unwrap_or_else(|| "custom".into())
}

/// Same marker the Desktop script leaves, so both show the same state.
fn write_marker(storage: &Path, state: &str) {
    if let Ok(entries) = fs::read_dir(storage) {
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with("SIGEON V2 ") && n.ends_with(".txt") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let _ = fs::write(storage.join(format!("SIGEON V2 {}.txt", state.to_uppercase())), b"");
}

fn apply(storage: &Path, plugins: &Path, preset: Option<&str>) -> Result<String, String> {
    match preset {
        None => {
            for f in [ASI, LIVE_INI] {
                let p = plugins.join(f);
                if p.exists() {
                    fs::remove_file(&p).map_err(|e| format!("Could not remove {}: {e}", p.display()))?;
                }
            }
        }
        Some(name) => {
            let asi = storage.join(ASI);
            let ini = storage.join(format!("SigeonLoader.{name}.ini"));
            for f in [&asi, &ini] {
                if !f.exists() {
                    return Err(format!("Missing {}", f.display()));
                }
            }
            fs::create_dir_all(plugins).map_err(|e| e.to_string())?;
            fs::copy(&asi, plugins.join(ASI)).map_err(|e| format!("Could not copy the loader: {e}"))?;
            fs::copy(&ini, plugins.join(LIVE_INI)).map_err(|e| format!("Could not copy the ini: {e}"))?;
        }
    }
    let state = current_state(storage, plugins);
    write_marker(storage, &state);
    Ok(state)
}

fn paths(state: &State<'_, Arc<Mutex<crate::AppState>>>) -> (PathBuf, Option<PathBuf>) {
    let mods = state.lock().unwrap().game_path.clone();
    (storage_dir(), plugins_dir(&mods))
}

#[tauri::command]
pub async fn sigeon_status(state: State<'_, Arc<Mutex<crate::AppState>>>) -> Result<SigeonStatus, String> {
    let (storage, plugins) = paths(&state);
    let problem = if !storage.join(ASI).exists() {
        Some(format!("{} not found", storage.join(ASI).display()))
    } else if plugins.is_none() {
        Some("Set the game mods path in Settings first".into())
    } else {
        None
    };
    let plugins = plugins.unwrap_or_default();
    Ok(SigeonStatus {
        state: current_state(&storage, &plugins),
        presets: presets(&storage),
        storage: storage.display().to_string(),
        plugins: plugins.display().to_string(),
        game_running: crate::is_game_process_running(),
        problem,
    })
}

/// `preset` = None turns Sigeon off.
#[tauri::command]
pub async fn sigeon_set(preset: Option<String>, state: State<'_, Arc<Mutex<crate::AppState>>>) -> Result<String, String> {
    if crate::is_game_process_running() {
        return Err("Marvel Rivals is running. Close the game before switching Sigeon.".into());
    }
    let (storage, plugins) = paths(&state);
    let plugins = plugins.ok_or("Set the game mods path in Settings first")?;
    apply(&storage, &plugins, preset.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn switches_between_off_and_presets() {
        let base = std::env::temp_dir().join(format!("sigeon-test-{}", std::process::id()));
        let storage = base.join("storage");
        let plugins = base.join("plugins");
        fs::create_dir_all(&storage).unwrap();
        fs::write(storage.join(ASI), b"asi").unwrap();
        fs::write(storage.join("SigeonLoader.base.ini"), b"variant=base").unwrap();
        fs::write(storage.join("SigeonLoader.high.ini"), b"variant=high").unwrap();

        assert_eq!(presets(&storage), vec!["base", "high"]);
        assert_eq!(current_state(&storage, &plugins), "off");
        assert_eq!(apply(&storage, &plugins, Some("high")).unwrap(), "high");
        assert!(storage.join("SIGEON V2 HIGH.txt").exists());
        assert_eq!(apply(&storage, &plugins, Some("base")).unwrap(), "base");
        assert!(!storage.join("SIGEON V2 HIGH.txt").exists());
        fs::write(plugins.join(LIVE_INI), b"edited").unwrap();
        assert_eq!(current_state(&storage, &plugins), "custom");
        assert_eq!(apply(&storage, &plugins, None).unwrap(), "off");
        assert!(!plugins.join(ASI).exists());
        assert!(apply(&storage, &plugins, Some("missing")).is_err());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn plugins_dir_from_mods_path() {
        let mods = Path::new(r"C:\Steam\MarvelRivals\MarvelGame\Marvel\Content\Paks\~mods");
        assert_eq!(plugins_dir(mods).unwrap(), Path::new(r"C:\Steam\MarvelRivals\MarvelGame\Marvel\Binaries\Win64\plugins"));
    }
}
