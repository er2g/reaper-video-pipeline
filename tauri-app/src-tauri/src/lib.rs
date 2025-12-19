use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::Emitter;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub index: i32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaperResponse {
    pub success: bool,
    pub message: Option<String>,
    pub tracks: Option<Vec<Track>>,
    #[serde(rename = "outputPath")]
    pub output_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderSettings {
    pub video_codec: String,
    pub video_bitrate: String,
    pub audio_codec: String,
    pub audio_bitrate: String,
    pub sample_rate: u32,
}

impl Default for RenderSettings {
    fn default() -> Self {
        Self {
            video_codec: "copy".to_string(),
            video_bitrate: "0".to_string(),
            audio_codec: "aac".to_string(),
            audio_bitrate: "320k".to_string(),
            sample_rate: 48000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub step: String,
    pub percent: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub bundled_available: bool,
}

fn get_comm_dir() -> PathBuf {
    std::env::temp_dir().join("reaper-video-fx")
}

fn get_command_file() -> PathBuf {
    get_comm_dir().join("command.json")
}

fn get_response_file() -> PathBuf {
    get_comm_dir().join("response.json")
}

fn ensure_comm_dir() -> Result<(), String> {
    let dir = get_comm_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn cleanup_files() {
    let _ = fs::remove_file(get_command_file());
    let _ = fs::remove_file(get_response_file());
}

async fn send_reaper_command(command: serde_json::Value) -> Result<ReaperResponse, String> {
    ensure_comm_dir()?;
    cleanup_files();

    let command_file = get_command_file();
    let response_file = get_response_file();

    // Write command
    let command_json = serde_json::to_string(&command).map_err(|e| e.to_string())?;
    fs::write(&command_file, &command_json).map_err(|e| e.to_string())?;

    // Wait for response with timeout
    let start = Instant::now();
    let timeout = Duration::from_secs(60);

    loop {
        tokio::time::sleep(Duration::from_millis(100)).await;

        if start.elapsed() > timeout {
            cleanup_files();
            return Err("REAPER yanit vermedi (timeout)".to_string());
        }

        if response_file.exists() {
            match fs::read_to_string(&response_file) {
                Ok(content) => {
                    if let Ok(response) = serde_json::from_str::<ReaperResponse>(&content) {
                        let _ = fs::remove_file(&response_file);
                        return Ok(response);
                    }
                }
                Err(_) => continue,
            }
        }
    }
}

fn get_reaper_user_plugins_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        if let Some(appdata) = dirs::config_dir() {
            let reaper_path = appdata.join("REAPER").join("UserPlugins");
            return Some(reaper_path);
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(home) = dirs::home_dir() {
            let reaper_path = home.join(".config").join("REAPER").join("UserPlugins");
            return Some(reaper_path);
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let reaper_path = home
                .join("Library")
                .join("Application Support")
                .join("REAPER")
                .join("UserPlugins");
            return Some(reaper_path);
        }
    }
    None
}

fn get_bundled_dll_path() -> Option<PathBuf> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Check in resources directory (bundled)
            let resource_path = exe_dir.join("reaper_video_fx_bridge.dll");
            if resource_path.exists() {
                return Some(resource_path);
            }
            // Check in parent's reaper-extension/dist (development)
            let dev_path = exe_dir
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .map(|p| p.join("reaper-extension").join("dist").join("reaper_video_fx_bridge.dll"));
            if let Some(path) = dev_path {
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }
    // Fallback: check relative to current working directory
    let cwd_path = std::env::current_dir()
        .ok()
        .map(|p| p.parent().unwrap_or(&p).join("reaper-extension").join("dist").join("reaper_video_fx_bridge.dll"));
    if let Some(path) = cwd_path {
        if path.exists() {
            return Some(path);
        }
    }
    None
}

fn generate_random_filename(extension: &str) -> String {
    let uuid = Uuid::new_v4();
    format!("render_{}_{}.{}",
        chrono_like_timestamp(),
        &uuid.to_string()[..8],
        extension
    )
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", duration.as_secs())
}

// Tauri Commands

#[tauri::command]
async fn ping_reaper() -> bool {
    let command = serde_json::json!({ "command": "PING" });
    match send_reaper_command(command).await {
        Ok(response) => response.success,
        Err(_) => false,
    }
}

#[tauri::command]
async fn get_tracks() -> Result<Vec<Track>, String> {
    let command = serde_json::json!({ "command": "GET_TRACKS" });
    let response = send_reaper_command(command).await?;
    if response.success {
        Ok(response.tracks.unwrap_or_default())
    } else {
        Err(response.message.unwrap_or_else(|| "Track listesi alinamadi".to_string()))
    }
}

#[tauri::command]
async fn check_extension_status() -> ExtensionStatus {
    let plugins_dir = get_reaper_user_plugins_dir();
    let bundled_path = get_bundled_dll_path();

    let installed = if let Some(ref dir) = plugins_dir {
        dir.join("reaper_video_fx_bridge.dll").exists()
    } else {
        false
    };

    ExtensionStatus {
        installed,
        path: plugins_dir.map(|p| p.to_string_lossy().to_string()),
        bundled_available: bundled_path.is_some(),
    }
}

#[tauri::command]
async fn install_extension() -> Result<String, String> {
    let bundled_path = get_bundled_dll_path()
        .ok_or_else(|| "Extension DLL bulunamadi".to_string())?;

    let plugins_dir = get_reaper_user_plugins_dir()
        .ok_or_else(|| "REAPER UserPlugins dizini bulunamadi".to_string())?;

    // Create directory if it doesn't exist
    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir).map_err(|e| format!("Dizin olusturulamadi: {}", e))?;
    }

    let dest_path = plugins_dir.join("reaper_video_fx_bridge.dll");

    fs::copy(&bundled_path, &dest_path)
        .map_err(|e| format!("Kopyalama hatasi: {}", e))?;

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn process_video(
    app: tauri::AppHandle,
    video_path: String,
    track_index: i32,
    settings: RenderSettings,
) -> Result<String, String> {
    let temp_dir = get_comm_dir();

    // Generate random filenames to avoid overwrite prompts
    let audio_filename = generate_random_filename("flac");
    let rendered_filename = generate_random_filename("wav");

    let audio_path = temp_dir.join(&audio_filename);
    let rendered_path = temp_dir.join(&rendered_filename);

    let video_dir = PathBuf::from(&video_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    let video_stem = PathBuf::from(&video_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".to_string());

    let output_path = video_dir.join(format!("{}_processed.mp4", video_stem));

    // Helper to emit progress
    let emit_progress = |step: &str, percent: u32| {
        let _ = app.emit("progress", ProgressEvent {
            step: step.to_string(),
            percent,
        });
    };

    // 1. Extract audio from video
    emit_progress("Videodan ses cikariliyor...", 10);
    extract_audio(&video_path, &audio_path.to_string_lossy(), settings.sample_rate)?;
    emit_progress("Ses cikarildi", 25);

    // 2. Clear track
    emit_progress("Track hazirlaniyor...", 30);
    let clear_cmd = serde_json::json!({
        "command": "CLEAR_TRACK",
        "trackIndex": track_index
    });
    send_reaper_command(clear_cmd).await?;

    // 3. Load audio to REAPER
    emit_progress("Ses REAPER'a yukleniyor...", 40);
    let load_cmd = serde_json::json!({
        "command": "LOAD_AUDIO",
        "trackIndex": track_index,
        "audioPath": audio_path.to_string_lossy()
    });
    let load_result = send_reaper_command(load_cmd).await?;
    if !load_result.success {
        return Err(load_result.message.unwrap_or_else(|| "Ses yuklenemedi".to_string()));
    }
    emit_progress("Ses yuklendi", 55);

    // 4. Render track
    emit_progress("Track render ediliyor...", 60);
    let render_cmd = serde_json::json!({
        "command": "RENDER_TRACK",
        "trackIndex": track_index,
        "outputPath": rendered_path.to_string_lossy()
    });
    let render_result = send_reaper_command(render_cmd).await?;
    if !render_result.success {
        return Err(render_result.message.unwrap_or_else(|| "Render basarisiz".to_string()));
    }
    emit_progress("Render tamamlandi", 80);

    // 5. Merge audio back to video
    emit_progress("Video olusturuluyor...", 85);
    merge_audio_video(&video_path, &rendered_path.to_string_lossy(), &output_path.to_string_lossy(), &settings)?;
    emit_progress("Tamamlandi!", 100);

    // Cleanup temp files
    let _ = fs::remove_file(&audio_path);
    let _ = fs::remove_file(&rendered_path);

    Ok(output_path.to_string_lossy().to_string())
}

fn extract_audio(video_path: &str, output_path: &str, sample_rate: u32) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "flac",
            "-ar", &sample_rate.to_string(),
            "-ac", "2",
            output_path
        ])
        .status()
        .map_err(|e| format!("FFmpeg calistirilamadi: {}", e))?;

    if !status.success() {
        return Err("Ses cikarma hatasi".to_string());
    }
    Ok(())
}

fn merge_audio_video(video_path: &str, audio_path: &str, output_path: &str, settings: &RenderSettings) -> Result<(), String> {
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(), video_path.to_string(),
        "-i".to_string(), audio_path.to_string(),
    ];

    // Video codec settings
    if settings.video_codec == "copy" {
        args.extend(["-c:v".to_string(), "copy".to_string()]);
    } else {
        args.extend(["-c:v".to_string(), settings.video_codec.clone()]);
        if settings.video_bitrate != "0" && !settings.video_bitrate.is_empty() {
            args.extend(["-b:v".to_string(), settings.video_bitrate.clone()]);
        }
    }

    // Audio codec settings
    args.extend([
        "-c:a".to_string(), settings.audio_codec.clone(),
        "-b:a".to_string(), settings.audio_bitrate.clone(),
    ]);

    args.extend([
        "-map".to_string(), "0:v:0".to_string(),
        "-map".to_string(), "1:a:0".to_string(),
        "-shortest".to_string(),
        output_path.to_string(),
    ]);

    let status = Command::new("ffmpeg")
        .args(&args)
        .status()
        .map_err(|e| format!("FFmpeg calistirilamadi: {}", e))?;

    if !status.success() {
        return Err("Video birlestirme hatasi".to_string());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            ping_reaper,
            get_tracks,
            check_extension_status,
            install_extension,
            process_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
