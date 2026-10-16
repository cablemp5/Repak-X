//! repakxtra: test and dev copies mark their window (and so taskbar) icon in their color, like the "xtra" in the header
//! (custom/version.ts): green for a test build (`build.ps1 -Test` sets REPAKXTRA_BUILD=test for the Rust build), amber for
//! the dev copy (dev.ps1 runs a debug build). The icon is the app's own x glyph, recolored, so no extra icon files exist.

/// "test" or "dev" and its color, or None for the stable copy.
fn mark() -> Option<[u8; 3]> {
    if cfg!(debug_assertions) {
        Some([0xF5, 0xA5, 0x24]) // dev, amber
    } else if option_env!("REPAKXTRA_BUILD") == Some("test") {
        Some([0x3E, 0xCF, 0x6E]) // test, green
    } else {
        None
    }
}

/// Every pixel takes the color and keeps its own alpha: the icon is one color on transparency.
fn recolor(rgba: &[u8], [r, g, b]: [u8; 3]) -> Vec<u8> {
    rgba.chunks_exact(4).flat_map(|px| [r, g, b, px[3]]).collect()
}

/// Called once at startup; the stable copy keeps its blue icon. Secondary windows opened later keep the default icon.
pub fn tint_window_icon(app: &tauri::App) {
    use tauri::Manager;
    let (Some(color), Some(icon)) = (mark(), app.default_window_icon()) else { return };
    let tinted = tauri::image::Image::new_owned(recolor(icon.rgba(), color), icon.width(), icon.height());
    for window in app.webview_windows().values() {
        let _ = window.set_icon(tinted.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recolor_keeps_alpha() {
        let px = [0x34, 0x6B, 0xF1, 255, 0, 0, 0, 0, 0x34, 0x6B, 0xF1, 128];
        assert_eq!(recolor(&px, [1, 2, 3]), vec![1, 2, 3, 255, 1, 2, 3, 0, 1, 2, 3, 128]);
    }
}
