// File watcher do vault (Fatia 5, doc 05 §4). Um comando `observar_vault` que liga um
// watcher com debounce e emite LOTES de eventos para o front num único evento Tauri
// (`vault://eventos`) — um `git checkout` gera milhares de eventos por segundo e atravessar
// o IPC um por um seria caro.
//
// O escopo de FS já foi concedido por `permitir_vault`; aqui é só observar.
//
// Doc 12 (múltiplos vaults): cada janela tem seu próprio vault e seu próprio watcher. Por
// isso o estado é um mapa por label de janela, e os dois eventos saem com `emit_to(label)` —
// nunca `emit` global, senão toda janela receberia os eventos de todos os vaults.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State, Window};

const DEBOUNCE_MS: u64 = 150;
const EVENTO: &str = "vault://eventos";
/// Emitido quando o watcher perdeu o fio da meada e o front precisa reler o vault inteiro.
const EVENTO_RESSINCRONIZAR: &str = "vault://ressincronizar";

type WatcherInterno = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

/// Guarda o debouncer vivo de cada janela, por label. Re-chamar `observar_vault` na mesma
/// janela troca o watcher dela (cobre troca de vault); `WindowEvent::Destroyed` (em `lib.rs`)
/// remove a entrada quando a janela fecha.
#[derive(Default)]
pub struct EstadoWatcher(pub Mutex<HashMap<String, WatcherInterno>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct EventoWatcher {
    /// "criado" | "modificado" | "removido"
    tipo: &'static str,
    /// Caminho relativo à raiz do vault, com "/".
    path: String,
}

/// Mesma regra de `vault.rs`: ignora componente iniciado por ".", `node_modules`, e
/// arquivos `.excalisidian-tmp`.
fn deve_ignorar_rel(rel: &str) -> bool {
    for parte in rel.split('/') {
        if parte.starts_with('.') || parte == "node_modules" {
            return true;
        }
    }
    rel.ends_with(".excalisidian-tmp")
}

fn tipo_de(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("criado"),
        EventKind::Modify(_) => Some("modificado"),
        EventKind::Remove(_) => Some("removido"),
        _ => None,
    }
}

/// Raiz contra a qual os caminhos dos eventos são comparados. No macOS o FSEvents devolve
/// caminhos já resolvidos (sem link simbólico); se o vault foi aberto por um link, o
/// `strip_prefix` com a raiz original falharia em todo evento. Por isso resolve o link aqui,
/// caindo no caminho original se não der. No Windows não resolve: `canonicalize` devolve
/// `\\?\C:\...` e os eventos do ReadDirectoryChangesW vêm sem esse prefixo.
fn raiz_para_eventos(raiz: &Path) -> std::path::PathBuf {
    #[cfg(not(windows))]
    {
        std::fs::canonicalize(raiz).unwrap_or_else(|_| raiz.to_path_buf())
    }
    #[cfg(windows)]
    {
        raiz.to_path_buf()
    }
}

fn relativo(raiz: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(raiz).ok()?;
    let s: Vec<String> = rel
        .components()
        .filter_map(|c| match c {
            std::path::Component::Normal(o) => Some(o.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();
    if s.is_empty() {
        None
    } else {
        Some(s.join("/"))
    }
}

#[tauri::command]
pub fn observar_vault(
    app: AppHandle,
    estado: State<'_, EstadoWatcher>,
    window: Window,
    path: String,
) -> Result<(), String> {
    let raiz = std::path::PathBuf::from(&path);
    let raiz_handler = raiz_para_eventos(&raiz);
    let app_handler = app.clone();
    let label = window.label().to_string();

    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |resultado: DebounceEventResult| {
            let eventos = match resultado {
                Ok(e) => e,
                Err(erros) => {
                    // Antes isto era `Err(_) => return` — silêncio total. O erro que mais
                    // importa aqui é o overflow do buffer do ReadDirectoryChangesW: quando o
                    // Windows acumula mudanças demais (o caso clássico é o PC hibernar por
                    // horas), o notify perde eventos e avisa por este canal. Engolindo, o
                    // vault ficava dessincronizado do disco sem ninguém saber. Agora loga e
                    // pede ao front pra reler tudo — os eventos perdidos não voltam, mas o
                    // estado converge.
                    for erro in &erros {
                        eprintln!("[watcher] erro do notify: {erro}");
                    }
                    let _ = app_handler.emit_to(&label, EVENTO_RESSINCRONIZAR, ());
                    return;
                }
            };
            let mut lote: Vec<EventoWatcher> = Vec::new();
            for ev in eventos {
                let Some(tipo) = tipo_de(&ev.kind) else {
                    continue;
                };
                for p in &ev.paths {
                    if let Some(rel) = relativo(&raiz_handler, p) {
                        if !deve_ignorar_rel(&rel) {
                            lote.push(EventoWatcher { tipo, path: rel });
                        }
                    }
                }
            }
            if !lote.is_empty() {
                let _ = app_handler.emit_to(&label, EVENTO, lote);
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watch(&raiz, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Substitui o watcher anterior desta janela, se houver (o antigo é dropado aqui, parando
    // de observar).
    estado
        .0
        .lock()
        .unwrap()
        .insert(window.label().to_string(), debouncer);
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;
    use std::path::PathBuf;

    #[cfg(unix)]
    #[test]
    fn relativo_funciona_com_vault_aberto_por_link_simbolico() {
        let base =
            std::env::temp_dir().join(format!("excalisidian-watcher-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let real = base.join("real");
        std::fs::create_dir_all(real.join("sub")).unwrap();
        let link = base.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();

        // O FSEvents (macOS) devolve o caminho já resolvido, sem o link simbólico.
        let evento = std::fs::canonicalize(&real).unwrap().join("sub/a.md");
        let raiz = raiz_para_eventos(&link);
        assert_eq!(relativo(&raiz, &evento).as_deref(), Some("sub/a.md"));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn raiz_inexistente_cai_no_caminho_original() {
        let p = PathBuf::from("/nao/existe/excalisidian-xyz");
        assert_eq!(raiz_para_eventos(&p), p);
    }
}
