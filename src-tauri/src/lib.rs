mod sistema;
mod vault;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Updater e reinício do processo só existem em desktop — o plugin não compila para mobile.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(watcher::EstadoWatcher::default())
        .invoke_handler(tauri::generate_handler![
            vault::escolher_vault,
            vault::permitir_vault,
            vault::walk_vault,
            watcher::observar_vault,
            sistema::nome_usuario,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Excalisidian");
}
