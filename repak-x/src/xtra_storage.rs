//! repakxtra: a copy of repakxtra's saved webview data (its `repakxtra.*` localStorage keys: loadouts, groups, view
//! settings) in %APPDATA%\Repak-X\webview-storage.json. The stable and test copies write it as it changes; the dev copy
//! (dev.ps1) runs from another address, so its own storage starts empty, and it loads this copy once per session
//! (custom/devStorage.ts). One way only: nothing the dev copy does is written back.

use std::fs;
use std::path::PathBuf;

const MAX_BYTES: usize = 32 * 1024 * 1024;

fn snapshot_file() -> PathBuf {
    crate::app_dir().join("webview-storage.json")
}

/// Only an object of string values under repakxtra.* names is kept, so the dev copy never loads anything else.
fn checked(text: &str) -> Result<(), String> {
    if text.len() > MAX_BYTES {
        return Err("The saved data is too large to copy".into());
    }
    let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(text).map_err(|e| format!("Not a storage copy: {e}"))?;
    if map.iter().all(|(k, v)| k.starts_with("repakxtra.") && v.is_string()) { Ok(()) } else { Err("Not a storage copy".into()) }
}

/// Written through a temporary file, so a crash mid-write never leaves half a copy.
#[tauri::command]
pub fn xtra_storage_snapshot_write(text: String) -> Result<(), String> {
    checked(&text)?;
    fs::create_dir_all(crate::app_dir()).map_err(|e| e.to_string())?;
    let file = snapshot_file();
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, &text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn xtra_storage_snapshot_read() -> Option<String> {
    fs::read_to_string(snapshot_file()).ok().filter(|t| checked(t).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_repakxtra_string_entries_count() {
        assert!(checked(r#"{"repakxtra.loadouts":"[]","repakxtra.view":"cards"}"#).is_ok());
        assert!(checked("{}").is_ok());
        assert!(checked(r#"{"other.key":"x"}"#).is_err());
        assert!(checked(r#"{"repakxtra.loadouts":[]}"#).is_err());
        assert!(checked("[1]").is_err() && checked("not json").is_err());
    }
}
