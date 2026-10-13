// Uma janela por vault (doc 12, seção 2). Quatro comandos:
//   abrir_janela_vault     -> abre um vault numa janela nova, ou foca a que já está aberta
//   registrar_janela_vault -> cada janela avisa qual vault está mostrando
//   focar_janela           -> unminimize + set_focus por label
//   criar_vault            -> cria a pasta de um vault novo no disco
//
// `EstadoJanelas` é o registro path -> label das janelas de vault abertas. Sem ele duas
// janelas poderiam abrir o mesmo vault e brigar pelos mesmos arquivos (dois watchers, dois
// `documentosStore` gravando por cima um do outro).

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};

use crate::vault::conceder_escopo;

/// Registro de vaults abertos: chave = caminho normalizado (minúsculas, "/" em vez de "\",
/// sem barra final), valor = label da janela que o tem aberto.
#[derive(Default)]
pub struct EstadoJanelas(pub Mutex<HashMap<String, String>>);

/// Tamanho e mínimo iguais aos da janela `main` em `tauri.conf.json`. Não há como ler o
/// `WindowConfig` de "main" e reaproveitar para uma janela com outro label e outra URL sem
/// reconstruir o builder inteiro, então os números ficam fixados aqui — se um dia mudarem lá,
/// mudam aqui também.
const LARGURA: f64 = 1200.0;
const ALTURA: f64 = 800.0;
// No Linux, em gerenciador de janelas lado a lado (Hyprland etc.), o compositor espreme a
// janela que pede um mínimo maior que o espaço dela e a imagem do app sai distorcida; por
// isso o mínimo lá é menor.
#[cfg(target_os = "linux")]
const LARGURA_MINIMA: f64 = 480.0;
#[cfg(target_os = "linux")]
const ALTURA_MINIMA: f64 = 360.0;
#[cfg(not(target_os = "linux"))]
const LARGURA_MINIMA: f64 = 900.0;
#[cfg(not(target_os = "linux"))]
const ALTURA_MINIMA: f64 = 600.0;

/// Chave de `EstadoJanelas`: minúsculas, `\` virando `/`, sem barra final. Assim
/// `C:\Vaults\Casa` e `c:/vaults/casa/` caem na mesma entrada.
pub(crate) fn normalizar_chave(path: &str) -> String {
    let mut chave = path.trim().replace('\\', "/").to_lowercase();
    while chave.len() > 1 && chave.ends_with('/') {
        chave.pop();
    }
    chave
}

/// FNV-1a de 32 bits. Não precisa ser criptográfico, só estável e sem colisão na prática para
/// virar label de janela (`vault-<hex>`); por isso hash embutido em vez de outra dependência.
fn fnv1a32(s: &str) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in s.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

fn label_do_vault(chave: &str) -> String {
    format!("vault-{:08x}", fnv1a32(chave))
}

/// Percent-encoding igual ao `encodeURIComponent` do JS — não o `application/x-www-form-urlencoded`
/// (que trocaria espaço por "+"). O front decodifica com `decodeURIComponent`/`URLSearchParams`,
/// então os dois lados precisam concordar no formato exato.
fn codificar_query(valor: &str) -> String {
    let mut saida = String::with_capacity(valor.len());
    for byte in valor.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => saida.push(byte as char),
            _ => saida.push_str(&format!("%{byte:02X}")),
        }
    }
    saida
}

fn titulo_da_pasta(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

/// Abre `path` na sua própria janela. Se o vault já está aberto em outra janela, só foca ela.
///
/// Async por exigência do próprio Tauri: `WebviewWindowBuilder::build` trava se chamado numa
/// thread síncrona de comando no Windows (doc no código-fonte de `webview_window.rs`, "Known
/// issues" — WebView2 issue). Como comando `async`, o Tauri já roda fora da thread principal
/// do event loop.
#[tauri::command]
pub async fn abrir_janela_vault(
    app: AppHandle,
    estado_janelas: State<'_, EstadoJanelas>,
    path: String,
) -> Result<(), String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err("indisponivel".to_string());
    }

    let chave = normalizar_chave(&path);

    // Bloco à parte para soltar o lock antes de qualquer outra coisa: `build()` abaixo não
    // deve rodar com o mutex preso.
    let label_existente = estado_janelas.0.lock().unwrap().get(&chave).cloned();
    if let Some(label) = label_existente {
        if let Some(janela) = app.get_webview_window(&label) {
            janela.unminimize().map_err(|e| e.to_string())?;
            janela.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }
        // Label registrado mas sem janela viva (ficou órfão porque `Destroyed` ainda não
        // rodou, ou coisa parecida): esquece o registro e cai para criar uma nova.
        estado_janelas.0.lock().unwrap().remove(&chave);
    }

    conceder_escopo(&app, &path)?;

    let label = label_do_vault(&chave);
    // A URL final é `index.html?vault=<path codificado>`. Isso só funciona porque
    // `WebviewUrl::App` NÃO trata este caminho como "index.html" puro (o Tauri só pula o
    // `Url::join` nesse caso exato — ver `tauri::manager::webview::prepare_webview`) — com a
    // query string colada, cai no `join`, que faz o parser de URL entender a query
    // corretamente tanto com `devUrl` (dev) quanto com o protocolo do `frontendDist`
    // (build). Não precisou de tratamento diferente para os dois casos.
    let url = format!("index.html?vault={}", codificar_query(&path));
    let titulo = titulo_da_pasta(&path);

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(titulo)
        .inner_size(LARGURA, ALTURA)
        .min_inner_size(LARGURA_MINIMA, ALTURA_MINIMA)
        // Mesmo Ctrl+/Ctrl-/Ctrl+0 da janela principal (`zoomHotkeysEnabled` em tauri.conf.json).
        .zoom_hotkeys_enabled(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Cada janela chama isto ao terminar de abrir seu vault. Se outra janela já registrou o
/// mesmo vault, devolve o label dela (quem chamou deve focar e desistir). Senão registra e
/// devolve `None`. Trocar de vault na mesma janela substitui o registro anterior dela.
#[tauri::command]
pub fn registrar_janela_vault(
    window: Window,
    estado_janelas: State<'_, EstadoJanelas>,
    path: String,
) -> Result<Option<String>, String> {
    let chave = normalizar_chave(&path);
    let label = window.label().to_string();

    let mut mapa = estado_janelas.0.lock().unwrap();
    if let Some(dono) = mapa.get(&chave) {
        if dono != &label {
            return Ok(Some(dono.clone()));
        }
        return Ok(None);
    }

    // Esta janela pode já estar registrada para outro vault (trocou na tela sem vault, por
    // exemplo) — remove o registro velho antes de gravar o novo.
    mapa.retain(|_, l| l != &label);
    mapa.insert(chave, label);
    Ok(None)
}

/// `unminimize` + `set_focus` na janela do label. Usado tanto pelo menu de recentes quanto
/// por `abrir_janela_vault`.
#[tauri::command]
pub fn focar_janela(app: AppHandle, label: String) -> Result<(), String> {
    let janela = app
        .get_webview_window(&label)
        .ok_or_else(|| "indisponivel".to_string())?;
    janela.unminimize().map_err(|e| e.to_string())?;
    janela.set_focus().map_err(|e| e.to_string())
}

/// Caracteres proibidos em nome de pasta no Windows (e problemáticos nos outros SOs).
const CARACTERES_INVALIDOS: [char; 9] = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];

/// Verifica só a forma do nome (não vazio é checado antes, em `criar_vault`, e conflito de
/// pasta existente também é responsabilidade de lá).
fn nome_valido(nome: &str) -> bool {
    if nome.starts_with('.') {
        // Cobre também "é só pontos" (doc 12): uma string só de pontos sempre começa com um.
        return false;
    }
    !nome.chars().any(|c| CARACTERES_INVALIDOS.contains(&c))
}

/// Cria a pasta `pai/nome` e concede o escopo de FS a ela. Não cria `.excalisidian/` — o app
/// cria essa pasta quando precisar (ex.: ao gravar a primeira config do vault).
#[tauri::command]
pub fn criar_vault(app: AppHandle, pai: String, nome: String) -> Result<String, String> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Err("nome_vazio".to_string());
    }
    if !nome_valido(nome) {
        return Err("nome_invalido".to_string());
    }

    let pasta_pai = std::path::Path::new(&pai);
    if !pasta_pai.is_dir() {
        return Err("pai_indisponivel".to_string());
    }

    let alvo = pasta_pai.join(nome);
    if alvo.exists() {
        return Err("existe".to_string());
    }

    std::fs::create_dir(&alvo).map_err(|_| "pai_indisponivel".to_string())?;

    let caminho = alvo.to_string_lossy().to_string();
    conceder_escopo(&app, &caminho)?;
    Ok(caminho)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn nome_comecando_com_ponto_e_invalido() {
        assert!(!nome_valido(".git"));
        assert!(!nome_valido("."));
        assert!(!nome_valido(".."));
        assert!(!nome_valido("..."));
    }

    #[test]
    fn nome_com_caractere_proibido_e_invalido() {
        for c in CARACTERES_INVALIDOS {
            let nome = format!("vault{c}teste");
            assert!(!nome_valido(&nome), "devia rejeitar {nome:?}");
        }
    }

    #[test]
    fn nome_comum_e_valido() {
        assert!(nome_valido("Meu Vault"));
        assert!(nome_valido("vault-2026"));
        assert!(nome_valido("notas.pessoais"));
    }

    #[test]
    fn normalizar_chave_ignora_barra_e_maiusculas() {
        assert_eq!(normalizar_chave(r"C:\Vaults\Casa"), "c:/vaults/casa");
        assert_eq!(normalizar_chave("c:/vaults/casa/"), "c:/vaults/casa");
        assert_eq!(normalizar_chave("C:/Vaults/Casa"), "c:/vaults/casa");
    }

    #[test]
    fn mesmo_path_gera_o_mesmo_label() {
        let a = label_do_vault(&normalizar_chave(r"C:\Vaults\Casa"));
        let b = label_do_vault(&normalizar_chave("c:/vaults/casa/"));
        assert_eq!(a, b);
        assert!(a.starts_with("vault-"));
    }

    #[test]
    fn codificar_query_preserva_e_escapa() {
        assert_eq!(codificar_query("abc"), "abc");
        assert_eq!(codificar_query("C:/Meus Vaults"), "C%3A%2FMeus%20Vaults");
    }
}
