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
        // Saída de rede do agente de IA (doc 11): reqwest no processo Rust, escopo de
        // hosts declarado em capabilities/main.json. O WebView não faz fetch direto.
        .plugin(tauri_plugin_http::init())
        .manage(watcher::EstadoWatcher::default())
        .invoke_handler(tauri::generate_handler![
            vault::escolher_vault,
            vault::permitir_vault,
            vault::walk_vault,
            watcher::observar_vault,
            sistema::nome_usuario,
            sistema::revelar_pasta,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Excalisidian");
}
