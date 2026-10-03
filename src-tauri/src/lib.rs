mod cofre;
mod janelas;
mod papel_parede;
mod sistema;
mod trava_sync;
mod vault;
mod watcher;

// `Manager` traz `.state::<T>()`, usado no `on_window_event` abaixo para limpar o registro de
// janelas e o watcher quando uma janela fecha, e `.path()`/`.fs_scope()` usados no `setup`
// abaixo (escopo da pasta de teste do sync).
use tauri::Manager;

/// Concede escopo de FS recursivo à pasta `sync-teste/` dentro do app data — SÓ em build de
/// desenvolvimento. `ServicoSyncLocal.ts` (src/sync/ServicoSyncLocal.ts) é um servidor de teste
/// que só roda atrás de `import.meta.env.DEV` e lê/grava nessa pasta via `@tauri-apps/plugin-fs`;
/// sem escopo, o plugin recusa toda operação ("forbidden path") e a UI mostra o erro genérico de
/// sincronização (doc 17 §10, task-6, defeito relatado em Configurações → Sincronização).
///
/// Isso NÃO entra em `capabilities/main.json` (permissão estática) de propósito: uma capability
/// estática valeria para o WebView da versão publicada também, e essa pasta de teste não deve
/// existir nem ser acessível fora de DEV. `#[cfg(debug_assertions)]` garante que esta função nem
/// compila no build de release (`npm run tauri build` / `cargo build --release`).
#[cfg(debug_assertions)]
fn conceder_escopo_sync_teste(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;

    // `appDataDir()` do lado JS (src/sync/ServicoSyncLocal.ts, função `pastaPadrao`) resolve
    // para `app_data_dir()` do Tauri — o mesmo caminho, incluindo o identificador
    // "com.excalisidian.app" (tauri.conf.json) que o SO já embute no diretório de app data.
    let pasta = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("sync-teste");
    std::fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
    app.fs_scope()
        .allow_directory(&pasta, true)
        .map_err(|e| e.to_string())
}

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
        .manage(trava_sync::TravasSync::default())
        .invoke_handler(tauri::generate_handler![
            vault::escolher_vault,
            vault::permitir_vault,
            vault::vault_existe,
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
            trava_sync::vaults_abertos,
            trava_sync::tentar_travar_sync,
            trava_sync::liberar_trava_sync,
        ])
        .setup(|app| {
            // Só em DEV (ver `conceder_escopo_sync_teste` acima) — em release esta chamada
            // desaparece inteira por causa do `#[cfg(debug_assertions)]` na função.
            #[cfg(debug_assertions)]
            conceder_escopo_sync_teste(app.handle())?;
            Ok(())
        })
        // Uma janela fechada não deve deixar rastro: nem no registro de "qual janela tem
        // qual vault" (doc 12 §2), nem watcher rodando sozinho em background observando uma
        // pasta que ninguém mais está mostrando, nem trava de sincronização travada para
        // sempre (doc 17 §8.1) — sem isto um vault cuja janela fechou no meio de um ciclo
        // nunca mais sincronizaria, nem pela janela (fechada) nem pelo segundo plano (que
        // veria a trava presa a um label morto).
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
                window
                    .state::<trava_sync::TravasSync>()
                    .liberar_todas(&label);
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Excalisidian");
}
