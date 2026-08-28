// Ponte com o disco. Três comandos, e não mais que isso sem uma boa razão (doc 05, seção 3):
//   escolher_vault  -> abre o diálogo de pasta, concede o escopo de FS e devolve o caminho
//   permitir_vault  -> reaplica o escopo no boot, a partir do caminho salvo
//   walk_vault      -> percorre o vault inteiro em uma chamada e devolve só metadados
//
// Armadilha do Tauri v2: o diálogo de pasta NÃO concede permissão de FS ao caminho, e o
// escopo concedido em runtime NÃO sobrevive ao reinício. Por isso `permitir_vault` roda a
// cada boot.

use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaArquivo {
    /// Caminho relativo à raiz do vault, com "/" como separador, normalizado NFC.
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub mtime_ms: u64,
    pub birthtime_ms: u64,
}

/// Concede a este processo acesso de leitura e escrita a uma pasta.
/// NÃO persiste entre execuções: precisa ser chamado a cada boot, com o caminho salvo.
fn conceder_escopo(app: &AppHandle, path: &str) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(path, true)
        .map_err(|e| e.to_string())
}

/// Abre o diálogo nativo de escolher pasta. Se o usuário escolher, concede o escopo e
/// devolve o caminho absoluto. Se cancelar, devolve `None`.
#[tauri::command]
pub async fn escolher_vault(app: AppHandle) -> Result<Option<String>, String> {
    // Comando async: roda fora da thread principal do event loop, então `blocking_pick_folder`
    // é seguro aqui (na thread principal ele travaria).
    let escolhido = app.dialog().file().blocking_pick_folder();
    match escolhido {
        Some(fp) => {
            let path = fp.to_string();
            conceder_escopo(&app, &path)?;
            Ok(Some(path))
        }
        None => Ok(None),
    }
}

/// Reaplica o escopo de FS para um vault já conhecido. Chamado no boot.
#[tauri::command]
pub fn permitir_vault(app: AppHandle, path: String) -> Result<(), String> {
    conceder_escopo(&app, &path)
}

/// Percorre a pasta inteira e devolve `[{path, isDir, size, mtimeMs, birthtimeMs}]`.
/// Ignora:
///   - qualquer componente que comece com "." (inclui .git, .trash, .excalisidian)
///   - node_modules
///   - arquivos com extensão `.excalisidian-tmp`
/// Caminhos são relativos à raiz, com "/" como separador, normalizados NFC.
#[tauri::command]
pub fn walk_vault(path: String) -> Result<Vec<EntradaArquivo>, String> {
    let raiz = std::path::Path::new(&path);
    let mut saida = Vec::new();

    let iter = WalkDir::new(raiz)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !deve_ignorar(e));

    for entrada in iter {
        let entrada = entrada.map_err(|e| e.to_string())?;
        let caminho_abs = entrada.path();

        let relativo = match caminho_abs.strip_prefix(raiz) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let rel_str = componentes_para_string(relativo);
        if rel_str.is_empty() {
            continue;
        }

        let meta = match entrada.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        saida.push(EntradaArquivo {
            path: rel_str,
            is_dir: meta.is_dir(),
            size: meta.len(),
            mtime_ms: tempo_ms(meta.modified().ok()),
            birthtime_ms: tempo_ms(meta.created().ok()),
        });
    }

    Ok(saida)
}

/// True quando a entrada é uma pasta com ponto no início, `node_modules`, ou um arquivo
/// com extensão `.excalisidian-tmp`.
fn deve_ignorar(entrada: &walkdir::DirEntry) -> bool {
    let nome = entrada.file_name().to_string_lossy();
    if nome.starts_with('.') {
        return true;
    }
    if entrada.file_type().is_dir() && nome == "node_modules" {
        return true;
    }
    if entrada.file_type().is_file() && nome.ends_with(".excalisidian-tmp") {
        return true;
    }
    false
}

/// Junta os componentes do caminho com "/" e normaliza cada um em NFC.
fn componentes_para_string(caminho: &std::path::Path) -> String {
    use std::path::Component;
    let mut partes: Vec<String> = Vec::new();
    for c in caminho.components() {
        if let Component::Normal(os) = c {
            partes.push(nfc(&os.to_string_lossy()));
        }
    }
    partes.join("/")
}

/// Normalização NFC sem dependência externa: aqui o caminho já vem do filesystem do Windows,
/// que é NFC na prática. A normalização real de nomes vindos de wikilink acontece no front
/// (`caminhos.ts`). Mantido como ponto único caso um dia entre macOS (NFD).
fn nfc(s: &str) -> String {
    s.to_string()
}

fn tempo_ms(t: Option<std::time::SystemTime>) -> u64 {
    t.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
