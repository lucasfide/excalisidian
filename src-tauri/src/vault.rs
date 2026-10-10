// Ponte com o disco. Poucos comandos, e não mais que isso sem uma boa razão (doc 05, seção 3):
//   escolher_vault  -> abre o diálogo de pasta, concede o escopo de FS e devolve o caminho
//   permitir_vault  -> reaplica o escopo no boot, a partir do caminho salvo
//   vault_existe    -> confere se a pasta existe, ANTES de tentar abrir (fonte da verdade
//                      pra "pasta não encontrada" no boot, sem depender do texto do erro)
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
/// `pub(crate)` porque `janelas.rs` reaproveita (abrir janela nova e criar vault também
/// precisam do escopo, e duplicar a chamada ao plugin de FS não tem vantagem nenhuma).
pub(crate) fn conceder_escopo<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    path: &str,
) -> Result<(), String> {
    let escopo = app.fs_scope();
    let raiz = std::path::Path::new(path);
    escopo
        .allow_directory(raiz, true)
        .map_err(|e| e.to_string())?;
    // O `**` do escopo acima não casa componente que começa com ponto no Linux e no macOS
    // (o glob exige ponto literal em Unix; no Windows não). Sem estas linhas, as pastas ocultas
    // do próprio app dão "forbidden path". `.git` e afins continuam fechados de propósito.
    let config = raiz.join(PASTA_CONFIG_VAULT);
    let lixeira = raiz.join(".trash");
    let indice_lixeira = lixeira.join(".index.json");
    let indice_lixeira_tmp = lixeira.join(format!(".index.json.{EXT_TMP}"));
    escopo
        .allow_directory(config, true)
        .map_err(|e| e.to_string())?;
    escopo
        .allow_directory(lixeira, true)
        .map_err(|e| e.to_string())?;
    escopo
        .allow_file(indice_lixeira)
        .map_err(|e| e.to_string())?;
    escopo
        .allow_file(indice_lixeira_tmp)
        .map_err(|e| e.to_string())
}

/// Espelham `PASTA_CONFIG_VAULT` e `EXT_TMP` de `src/app/constantes.ts` (ambos derivados de
/// `APP_ID = "excalisidian"`; no Rust não há a constante única).
/// Os dois lados precisam andar juntos: mudou o identificador lá, mude aqui.
const PASTA_CONFIG_VAULT: &str = ".excalisidian";
const EXT_TMP: &str = "excalisidian-tmp";

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

/// Confere se `path` existe e é uma pasta, direto no processo Rust — sem depender do escopo
/// de FS do plugin (que só é concedido depois, em `permitir_vault`) nem do texto de erro do
/// SO. Fonte da verdade pro boot decidir "pasta não encontrada" antes de tentar abrir.
#[tauri::command]
pub fn vault_existe(path: String) -> bool {
    std::path::Path::new(&path).is_dir()
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

#[cfg(test)]
mod testes_escopo {
    use super::*;

    #[test]
    fn escopo_libera_pastas_do_app_e_mantem_outras_ocultas_fechadas() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_fs::init())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("app de teste");
        let vault = std::env::temp_dir().join("excalisidian-teste-escopo");
        std::fs::create_dir_all(&vault).unwrap();
        conceder_escopo(app.handle(), vault.to_str().unwrap()).unwrap();

        let escopo = app.fs_scope();
        let liberados = [
            "nota.md",
            ".excalisidian/tarefas.json",
            ".excalisidian/tarefas.json.excalisidian-tmp",
            ".excalisidian/vault.json",
            ".trash",
            ".trash/x.md",
            ".trash/.index.json",
            ".trash/.index.json.excalisidian-tmp",
        ];
        for rel in liberados {
            assert!(escopo.is_allowed(vault.join(rel)), "deveria liberar {rel}");
        }
        assert!(
            !escopo.is_allowed(vault.join(".git/config")),
            ".git deve ficar fechado"
        );
        assert!(!escopo.is_allowed(vault.parent().unwrap().join("fora.md")));
    }
}
