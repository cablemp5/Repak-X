//! repakxtra: crash facts for the setup report (the newest crash, without its folder path).

use crate::crash_monitor;
use serde::Serialize;

#[derive(Serialize)]
pub struct NewestCrash {
    /// Unix seconds when the crash folder was made
    time: u64,
    crash_type: Option<String>,
    asset_path: Option<String>,
}

/// The newest crash the game left, if any. Reads only; the startup crash check keeps its own bookkeeping.
#[tauri::command]
pub fn xtra_newest_crash() -> Option<NewestCrash> {
    let (_, folder) = crash_monitor::get_newest_crash_folder()?;
    let info = crash_monitor::parse_crash_info(&folder, Vec::new())?;
    let (asset_path, error_type, _) = crash_monitor::parse_error_details(info.error_message.as_deref().unwrap_or(""));
    let time = info.timestamp.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    Some(NewestCrash { time, crash_type: error_type.or(info.crash_type), asset_path })
}
