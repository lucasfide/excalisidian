mod cofre;
mod janelas;
mod papel_parede;
mod sistema;
mod vault;
mod watcher;

// `Manager` traz `.state::<T>()`, usado no `on_window_event` abaixo para limpar o registro de
// janelas e o watcher quando uma janela fecha.
use tauri::Manager;

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
        .manage(janelas::EstadoJanelas::default())
        .invoke_handler(tauri::generate_handler![
            vault::escolher_vault,
            vault::permitir_vault,
            vault::walk_vault,
            watcher::observar_vault,
            janelas::abrir_janela_vault,
            janelas::registrar_janela_vault,
            janelas::focar_janela,
            janelas::criar_vault,
            papel_parede::preparar_papel_parede_home,
            papel_parede::importar_papel_parede_home,
            papel_parede::remover_papel_parede_home,
            sistema::nome_usuario,
            sistema::revelar_pasta,
            cofre::ler_token_conta,
            cofre::gravar_token_conta,
            cofre::apagar_token_conta,
        ])
        // Uma janela fechada não deve deixar rastro: nem no registro de "qual janela tem
        // qual vault" (doc 12 §2) nem watcher rodando sozinho em background observando uma
        // pasta que ninguém mais está mostrando.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                window
                    .state::<janelas::EstadoJanelas>()
                    .0
                    .lock()
                    .unwrap()
                    .retain(|_, l| l != &label);
                window
                    .state::<watcher::EstadoWatcher>()
                    .0
                    .lock()
                    .unwrap()
                    .remove(&label);
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Excalisidian");
}
