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

/// O AppImage é feito no Ubuntu 22.04 e leva dentro dele um `libwayland-client` antigo (1.20).
/// Com Mesa novo (distros rolling), o `libEGL` do sistema é carregado junto com essa cópia velha e o
/// `WebKitWebProcess` aborta na partida com `EGL_BAD_PARAMETER`. Por isso o `LD_PRELOAD` aponta para a
/// cópia do sistema e o binário se reexecuta uma vez: o processo principal já carregou a cópia velha
/// antes do `main`. O hook do Tauri força `GDK_BACKEND=x11` por causa disso (tauri#8541); com a lib
/// do sistema garantida, trocamos para Wayland nativo, que respeita a escala fracionária (via
/// XWayland o app fica maior que os outros). `EXCALISIDIAN_FORCAR_X11` mantém o x11 em máquina
/// onde o Wayland nativo der problema. Fora do AppImage nada muda.
#[cfg(target_os = "linux")]
fn preparar_ambiente_appimage() {
    use std::os::unix::process::CommandExt;

    if std::env::var_os("APPIMAGE").is_none() {
        return;
    }
    // `/usr/lib` por último: no Fedora com multilib ele guarda a cópia de 32 bits.
    let candidatas = [
        "/usr/lib64/libwayland-client.so.0",
        "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
        "/usr/lib/libwayland-client.so.0",
    ];
    // Sem a lib do sistema, Wayland nativo com a cópia antiga é o caso que quebrava: fica em x11.
    let Some(lib) = candidatas.iter().find(|c| std::path::Path::new(c).exists()) else {
        return;
    };

    let mut trocou_backend = false;
    if std::env::var_os("EXCALISIDIAN_FORCAR_X11").is_none() {
        let gdk_backend = std::env::var("GDK_BACKEND").ok();
        let wayland_display = std::env::var("WAYLAND_DISPLAY").ok();
        if let Some(backend) =
            backend_gdk_para_appimage(gdk_backend.as_deref(), wayland_display.as_deref())
        {
            std::env::set_var("GDK_BACKEND", backend);
            trocou_backend = true;
        }
    }

    let atual = std::env::var("LD_PRELOAD").ok();
    if let Some(novo) = ld_preload_com_libwayland(atual.as_deref(), lib) {
        std::env::set_var("LD_PRELOAD", novo);
        if let Ok(exe) = std::env::current_exe() {
            // `exec` só volta em caso de erro. Na segunda execução o `LD_PRELOAD` já tem a lib,
            // então não há laço.
            let _erro = std::process::Command::new(exe)
                .args(std::env::args_os().skip(1))
                .exec();
        }
        // Sem a reexecução o principal ficou com a lib antiga: volta para x11.
        if trocou_backend {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }
}

/// Backend GDK a impor no AppImage: `Some("wayland")` quando há sessão Wayland e o backend é o
/// `x11` que o hook do pacote força; `None` em qualquer outro caso (não mexe).
#[cfg(target_os = "linux")]
fn backend_gdk_para_appimage(
    gdk_backend: Option<&str>,
    wayland_display: Option<&str>,
) -> Option<&'static str> {
    match (gdk_backend, wayland_display) {
        (Some("x11"), Some(d)) if !d.is_empty() => Some("wayland"),
        _ => None,
    }
}

/// Calcula o novo `LD_PRELOAD`; `None` quando já contém `libwayland-client` (não mexe).
#[cfg(target_os = "linux")]
fn ld_preload_com_libwayland(atual: Option<&str>, lib: &str) -> Option<String> {
    match atual {
        Some(a) if a.contains("libwayland-client") => None,
        Some(a) if !a.is_empty() => Some(format!("{lib}:{a}")),
        _ => Some(lib.to_string()),
    }
}

#[cfg(all(test, target_os = "linux"))]
mod testes {
    use super::{backend_gdk_para_appimage, ld_preload_com_libwayland};

    #[test]
    fn sem_valor_ou_vazio_usa_so_a_lib() {
        assert_eq!(
            ld_preload_com_libwayland(None, "/x/lw.so.0"),
            Some("/x/lw.so.0".into())
        );
        assert_eq!(
            ld_preload_com_libwayland(Some(""), "/x/lw.so.0"),
            Some("/x/lw.so.0".into())
        );
    }

    #[test]
    fn ja_contem_libwayland_nao_mexe() {
        assert_eq!(
            ld_preload_com_libwayland(Some("/a/libwayland-client.so.0"), "/x/lw.so.0"),
            None
        );
    }

    #[test]
    fn valor_existente_recebe_a_lib_na_frente() {
        assert_eq!(
            ld_preload_com_libwayland(Some("/a/b.so"), "/x/lw.so.0"),
            Some("/x/lw.so.0:/a/b.so".into())
        );
    }

    #[test]
    fn x11_com_wayland_display_vira_wayland() {
        assert_eq!(
            backend_gdk_para_appimage(Some("x11"), Some("wayland-1")),
            Some("wayland")
        );
    }

    #[test]
    fn x11_sem_wayland_display_nao_mexe() {
        assert_eq!(backend_gdk_para_appimage(Some("x11"), None), None);
        assert_eq!(backend_gdk_para_appimage(Some("x11"), Some("")), None);
    }

    #[test]
    fn outro_backend_nao_mexe() {
        assert_eq!(
            backend_gdk_para_appimage(Some("wayland"), Some("wayland-1")),
            None
        );
        assert_eq!(backend_gdk_para_appimage(None, Some("wayland-1")), None);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    preparar_ambiente_appimage();

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
