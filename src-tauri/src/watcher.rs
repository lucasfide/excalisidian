// File watcher do vault (Fatia 5, doc 05 §4). Um comando `observar_vault` que liga um
// watcher com debounce e emite LOTES de eventos para o front num único evento Tauri
// (`vault://eventos`) — um `git checkout` gera milhares de eventos por segundo e atravessar
// o IPC um por um seria caro.
//
// O escopo de FS já foi concedido por `permitir_vault`; aqui é só observar.

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const DEBOUNCE_MS: u64 = 150;
const EVENTO: &str = "vault://eventos";

type WatcherInterno = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

/// Guarda o debouncer vivo. Re-chamar `observar_vault` troca o watcher (cobre troca de vault).
#[derive(Default)]
pub struct EstadoWatcher(pub Mutex<Option<WatcherInterno>>);

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
    path: String,
) -> Result<(), String> {
    let raiz = std::path::PathBuf::from(&path);
    let raiz_handler = raiz.clone();
    let app_handler = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |resultado: DebounceEventResult| {
            let eventos = match resultado {
                Ok(e) => e,
                Err(_) => return,
            };
            let mut lote: Vec<EventoWatcher> = Vec::new();
            for ev in eventos {
                let Some(tipo) = tipo_de(&ev.kind) else { continue };
                for p in &ev.paths {
                    if let Some(rel) = relativo(&raiz_handler, p) {
                        if !deve_ignorar_rel(&rel) {
                            lote.push(EventoWatcher { tipo, path: rel });
                        }
                    }
                }
            }
            if !lote.is_empty() {
                let _ = app_handler.emit(EVENTO, lote);
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watch(&raiz, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    // Substitui o watcher anterior (o antigo é dropado aqui, parando de observar).
    *estado.0.lock().unwrap() = Some(debouncer);
    Ok(())
}
