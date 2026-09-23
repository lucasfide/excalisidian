// Token da conta no cofre de credenciais do sistema (ADR-34). Este é o único módulo que
// conhece `keyring-core`: o resto do app só vê `Option<String>` e `Result<(), String>`.
//
// Os três comandos abaixo não recebem serviço nem usuário como parâmetro. A entrada é sempre
// `app.config().identifier` / `"sessao-conta"`, fixada aqui dentro — a tela não escolhe qual
// credencial do Windows ler, então estes comandos não servem para ler nenhuma outra credencial
// do sistema (decisão 4 do plano `docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`).

use std::collections::HashMap;
use std::sync::OnceLock;

use tauri::AppHandle;

const USUARIO_COFRE: &str = "sessao-conta";

/// Verdadeiro se o token pode ser gravado no cofre. Separada de `gravar_token_conta` para dar
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

/// Entrada do cofre para o token da conta desta instalação: serviço = identificador do app
/// (`app.config().identifier`), usuário fixo `"sessao-conta"`, persistência `Local` — a sessão
/// pertence a esta máquina. O padrão da loja, `Enterprise`, viajaria entre máquinas de um
/// domínio corporativo, o que não queremos.
#[cfg(windows)]
fn entrada(app: &AppHandle) -> Result<keyring_core::Entry, String> {
    garantir_loja()?;
    let servico = app.config().identifier.clone();
    let mut modificadores = HashMap::new();
    modificadores.insert("persistence", "Local");
    keyring_core::Entry::new_with_modifiers(&servico, USUARIO_COFRE, &modificadores)
        .map_err(|e| e.to_string())
}

/// Lê o token salvo no cofre. Credencial inexistente não é erro: devolve `None`.
#[cfg(windows)]
#[tauri::command]
pub fn ler_token_conta(app: AppHandle) -> Result<Option<String>, String> {
    match entrada(&app)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Grava o token no cofre. Token vazio é recusado — gravar string vazia não tem sentido e
/// esconderia um bug de quem chama.
#[cfg(windows)]
#[tauri::command]
pub fn gravar_token_conta(app: AppHandle, token: String) -> Result<(), String> {
    if !token_valido(&token) {
        return Err("token vazio".to_string());
    }
    entrada(&app)?
        .set_password(&token)
        .map_err(|e| e.to_string())
}

/// Apaga o token do cofre. Apagar o que não existe não é erro.
#[cfg(windows)]
#[tauri::command]
pub fn apagar_token_conta(app: AppHandle) -> Result<(), String> {
    match entrada(&app)?.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// Fora do Windows não existe loja nativa configurada — o app só empacota instalador para
// Windows (docs/05). Os três comandos compilam em qualquer sistema operacional, mas devolvem
// erro sem depender de nenhuma loja de credenciais.
#[cfg(not(windows))]
#[tauri::command]
pub fn ler_token_conta(_app: AppHandle) -> Result<Option<String>, String> {
    Err("cofre indisponível neste sistema".to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn gravar_token_conta(_app: AppHandle, _token: String) -> Result<(), String> {
    Err("cofre indisponível neste sistema".to_string())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn apagar_token_conta(_app: AppHandle) -> Result<(), String> {
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
}
