mod vault;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(watcher::EstadoWatcher::default())
        .invoke_handler(tauri::generate_handler![
            vault::escolher_vault,
            vault::permitir_vault,
            vault::walk_vault,
            watcher::observar_vault,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Excalisidian");
}
