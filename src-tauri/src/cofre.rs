// Cofre de credenciais do sistema, para segredos da conta (ADR-34, e a chave de envelope da
// sincronização — doc 17 §2). Este é o único módulo que conhece `keyring-core`: o resto do app
// só vê `Option<String>` e `Result<(), String>`.
//
// Os três comandos abaixo não recebem serviço nem usuário livres. O usuário da entrada do
// cofre vem sempre do enum `Segredo` — fechado a duas variantes — nunca de uma string livre
// vinda da tela: a tela não escolhe qual credencial do Windows ler (decisão 4 do plano
// `docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`, reafirmada no plano
// `docs/superpowers/plans/2026-09-24-10-sincronizacao-na-tela.md`, Task 2).

use std::collections::HashMap;
use std::sync::OnceLock;

use tauri::AppHandle;

/// Qual segredo ler/gravar/apagar no cofre. Fechado a duas variantes — sem uma terceira forma
/// de passar um nome de usuário livre — para que os comandos nunca sirvam de leitor genérico de
/// credenciais do Windows.
#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Segredo {
    /// Token da sessão da conta (ADR-34).
    SessaoConta,
    /// `chaveDeEnvelope` da sincronização, uma por conta, guardada neste computador depois que
    /// o usuário digita a senha aqui (doc 17 §2, §7).
    ChaveDeEnvelope,
}

impl Segredo {
    /// Nome de usuário da entrada no cofre para este segredo. Único lugar que faz esse
    /// mapeamento — testado abaixo sem tocar no cofre real.
    fn usuario(&self) -> &'static str {
        match self {
            Segredo::SessaoConta => "sessao-conta",
            Segredo::ChaveDeEnvelope => "chave-de-envelope",
        }
    }
}

/// Verdadeiro se o valor pode ser gravado no cofre. Separada de `gravar_token_conta` para dar
/// um teste que não toca no cofre de verdade.
fn token_valido(token: &str) -> bool {
    !token.is_empty()
}

/// Garante que a loja nativa do Windows foi escolhida como loja padrão do `keyring-core`.
/// Preguiçoso: só roda no primeiro comando chamado, não no `setup` do app — quem nunca entra
/// numa conta não paga esse custo.
#[cfg(windows)]
fn garantir_loja() -> Result<(), String> {
    static LOJA: OnceLock<Result<(), String>> = OnceLock::new();
    LOJA.get_or_init(|| {
        let loja = windows_native_keyring_store::Store::new().map_err(|e| e.to_string())?;
        keyring_core::set_default_store(loja);
        Ok(())
    })
    .clone()
}

/// Entrada do cofre para um segredo desta instalação: serviço = identificador do app
/// (`app.config().identifier`), usuário = `segredo.usuario()`, persistência `Local` — o segredo
/// pertence a esta máquina. O padrão da loja, `Enterprise`, viajaria entre máquinas de um
/// domínio corporativo, o que não queremos.
#[cfg(windows)]
fn entrada(app: &AppHandle, segredo: &Segredo) -> Result<keyring_core::Entry, String> {
    garantir_loja()?;
    let servico = app.config().identifier.clone();
    let mut modificadores = HashMap::new();
    modificadores.insert("persistence", "Local");
    keyring_core::Entry::new_with_modifiers(&servico, segredo.usuario(), &modificadores)
        .map_err(|e| e.to_string())
}

/// Lê o valor salvo no cofre. Credencial inexistente não é erro: devolve `None`.
#[cfg(windows)]
#[tauri::command]
pub fn ler_token_conta(app: AppHandle, segredo: Segredo) -> Result<Option<String>, String> {
    match entrada(&app, &segredo)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Grava o valor no cofre. Valor vazio é recusado — gravar string vazia não tem sentido e
/// esconderia um bug de quem chama.
#[cfg(windows)]
#[tauri::command]
pub fn gravar_token_conta(app: AppHandle, segredo: Segredo, token: String) -> Result<(), String> {
    if !token_valido(&token) {
        return Err("token vazio".to_string());
    }
    entrada(&app, &segredo)?
        .set_password(&token)
        .map_err(|e| e.to_string())
}

/// Apaga o valor do cofre. Apagar o que não existe não é erro.
#[cfg(windows)]
#[tauri::command]
pub fn apagar_token_conta(app: AppHandle, segredo: Segredo) -> Result<(), String> {
    match entrada(&app, &segredo)?.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// Fora do Windows não existe loja nativa configurada — o app só empacota instalador para
// Windows (docs/05). Os três comandos compilam em qualquer sistema operacional, mas devolvem
// erro sem depender de nenhuma loja de credenciais.
#[cfg(not(windows))]
#[tauri::command]
pub fn ler_token_conta(_app: AppHandle, _segredo: Segredo) -> Result<Option<String>, String> {
    Err("cofre indisponível neste sistema".to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn gravar_token_conta(
    _app: AppHandle,
    _segredo: Segredo,
    _token: String,
) -> Result<(), String> {
    Err("cofre indisponível neste sistema".to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn apagar_token_conta(_app: AppHandle, _segredo: Segredo) -> Result<(), String> {
    Err("cofre indisponível neste sistema".to_string())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn token_vazio_nao_e_valido() {
        assert!(!token_valido(""));
    }

    #[test]
    fn token_nao_vazio_e_valido() {
        assert!(token_valido("um-token-qualquer"));
    }

    #[test]
    fn segredo_sessao_conta_mapeia_para_o_nome_de_usuario_existente() {
        // O nome não pode mudar: entradas já gravadas no cofre de quem já tem conta usam
        // "sessao-conta" (ADR-34). Trocar o nome aqui deslogaria todo mundo em silêncio.
        assert_eq!(Segredo::SessaoConta.usuario(), "sessao-conta");
    }

    #[test]
    fn segredo_chave_de_envelope_mapeia_para_nome_proprio() {
        assert_eq!(Segredo::ChaveDeEnvelope.usuario(), "chave-de-envelope");
    }

    #[test]
    fn os_dois_segredos_mapeiam_para_nomes_diferentes() {
        assert_ne!(Segredo::SessaoConta.usuario(), Segredo::ChaveDeEnvelope.usuario());
    }
}
