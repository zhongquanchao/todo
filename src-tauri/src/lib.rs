use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;

/// 悬浮球是否已被首次定位过（首次收起时放到主屏右下角）。
static BALL_INITIALIZED: AtomicBool = AtomicBool::new(false);

/// 收起主面板为悬浮球。
#[tauri::command]
fn collapse_to_ball(app: AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("missing main window")?;
    let ball = app.get_webview_window("ball").ok_or("missing ball window")?;

    if !BALL_INITIALIZED.swap(true, Ordering::SeqCst) {
        // 首次显示：定位到球所在主屏的右下角，避免落在默认位置
        if let Ok(Some(monitor)) = ball.current_monitor() {
            let scale = monitor.scale_factor();
            let size = monitor.size().to_logical::<f64>(scale);
            let pos = monitor.position().to_logical::<f64>(scale);
            let margin = 24.0f64;
            let diameter = 68.0f64;
            let x = pos.x + size.width - diameter - margin;
            let y = pos.y + size.height - diameter - margin;
            let _ = ball.set_position(tauri::LogicalPosition::new(x, y));
        }
    }

    let _ = main.hide();
    let _ = ball.show();
    let _ = ball.emit("ball-update", ());
    Ok(())
}

/// 从悬浮球展开主面板：以球当前位置为锚点，夹紧到球所在显示器内。
#[tauri::command]
fn expand_from_ball(app: AppHandle) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("missing main window")?;
    let ball = app.get_webview_window("ball").ok_or("missing ball window")?;

    let ball_pos = ball.outer_position().map_err(|e| e.to_string())?;
    let ball_size = ball.outer_size().map_err(|e| e.to_string())?;
    let main_size = main.outer_size().map_err(|e| e.to_string())?;
    let monitor = ball
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("no monitor")?;

    let scale = monitor.scale_factor();
    let ball_logical = ball_pos.to_logical::<f64>(scale);
    let bs = ball_size.to_logical::<f64>(scale);
    let ms = main_size.to_logical::<f64>(scale);
    let mon_pos = monitor.position().to_logical::<f64>(scale);
    let mon_size = monitor.size().to_logical::<f64>(scale);

    // 与 core.js 的 computeExpandPosition 一致的锚点展开 + 夹紧
    let margin = 8.0f64;
    let center_x = ball_logical.x + bs.width / 2.0;
    let center_y = ball_logical.y + bs.height / 2.0;
    let mut x = center_x - ms.width / 2.0;
    let mut y = center_y - ms.height / 2.0;

    let min_x = mon_pos.x + margin;
    let max_x = mon_pos.x + mon_size.width - ms.width - margin;
    let min_y = mon_pos.y + margin;
    let max_y = mon_pos.y + mon_size.height - ms.height - margin;
    x = x.max(min_x).min(max_x);
    y = y.max(min_y).min(max_y);

    main.set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;

    let _ = ball.hide();
    let _ = main.show();
    let _ = main.set_focus();
    let _ = main.emit("panel-shown", ());
    Ok(())
}

/// 显示或隐藏悬浮窗：面板可见则收起为球，否则从球展开面板。
fn toggle_window(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        if main.is_visible().unwrap_or(false) {
            let _ = main.hide();
            if let Some(ball) = app.get_webview_window("ball") {
                let _ = ball.show();
                let _ = ball.emit("ball-update", ());
            }
        } else {
            let _ = expand_from_ball(app.clone());
        }
    }
}

/// 导出数据到用户选择的文件。
#[tauri::command]
async fn export_data(app: AppHandle, json: String) -> Result<bool, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name("todo-backup.json")
        .blocking_save_file();
    match file {
        Some(p) => {
            let path = p.into_path().map_err(|e| e.to_string())?;
            std::fs::write(path, json).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// 从用户选择的文件导入数据，返回文件内容。
#[tauri::command]
async fn import_data(app: AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file();
    match file {
        Some(p) => {
            let path = p.into_path().map_err(|e| e.to_string())?;
            let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            Ok(Some(content))
        }
        None => Ok(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![]),
            ));
    }

    builder
        .invoke_handler(tauri::generate_handler![
            export_data,
            import_data,
            collapse_to_ball,
            expand_from_ball
        ])
        .setup(|app| {
            // macOS：作为状态栏小组件运行，不占用程序坞。
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }

            // 全局快捷键：CmdOrCtrl+Shift+Space 唤起并聚焦输入框（快速捕获）。
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
                let handle = app.handle().clone();
                let _ = app.global_shortcut().on_shortcut(
                    "CommandOrControl+Shift+Space",
                    move |_app, _shortcut, event| {
                        if event.state == ShortcutState::Pressed {
                            let visible = handle
                                .get_webview_window("main")
                                .map(|w| w.is_visible().unwrap_or(false))
                                .unwrap_or(false);
                            if visible {
                                if let Some(win) = handle.get_webview_window("main") {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                    let _ = win.emit("quick-capture", ());
                                }
                            } else {
                                let _ = expand_from_ball(handle.clone());
                                if let Some(win) = handle.get_webview_window("main") {
                                    let _ = win.emit("quick-capture", ());
                                }
                            }
                        }
                    },
                );
            }

            let toggle_item =
                MenuItem::with_id(app, "toggle", "显示/隐藏小组件", true, None::<&str>)?;
            let passthrough_item =
                MenuItem::with_id(app, "passthrough", "切换鼠标穿透", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &passthrough_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("TODO")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_window(app),
                    "passthrough" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.emit("toggle-passthrough", ());
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
