// Cofre de credenciais do sistema, para segredos da conta (ADR-34, e a chave de envelope da
// sincronização — doc 17 §2). Este é o único módulo que conhece `keyring-core`: o resto do app
// só vê `Option<String>` e `Result<(), String>`.
//
// Uma loja nativa por sistema: Credential Manager no Windows, Keychain de login no macOS e
// Secret Service (GNOME Keyring ou KWallet) no Linux. A interface é a mesma nos três.
//
// Os três comandos abaixo não recebem serviço nem usuário livres. O usuário da entrada do
// cofre vem sempre do enum `Segredo` — fechado a duas variantes — nunca de uma string livre
// vinda da tela: a tela não escolhe qual credencial do sistema ler (decisão 4 do plano
// `docs/superpowers/plans/2026-09-23-05-token-no-cofre.md`, reafirmada no plano
// `docs/superpowers/plans/2026-09-24-10-sincronizacao-na-tela.md`, Task 2).

#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
use std::collections::HashMap;
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
use std::sync::Mutex;

use tauri::AppHandle;

/// Qual segredo ler/gravar/apagar no cofre. Fechado a duas variantes — sem uma terceira forma
/// de passar um nome de usuário livre — para que os comandos nunca sirvam de leitor genérico de
/// credenciais do sistema.
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
#[cfg_attr(
    not(any(windows, target_os = "macos", target_os = "linux")),
    allow(dead_code)
)]
fn token_valido(token: &str) -> bool {
    !token.is_empty()
}

/// Garante que a loja nativa do sistema foi escolhida como loja padrão do `keyring-core`.
/// Preguiçoso: só roda no primeiro comando chamado, não no `setup` do app — quem nunca entra
/// numa conta não paga esse custo.
///
/// Só o sucesso fica guardado. Se o Secret Service estiver fora do ar (Linux sem chaveiro), o
/// erro volta ao chamador e a próxima chamada tenta de novo, porque o chaveiro pode ter
/// subido nesse meio-tempo.
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
fn garantir_loja() -> Result<(), String> {
    static PRONTA: Mutex<bool> = Mutex::new(false);
    let mut pronta = PRONTA.lock().map_err(|e| e.to_string())?;
    if *pronta {
        return Ok(());
    }
    criar_loja_nativa()?;
    *pronta = true;
    Ok(())
}

#[cfg(windows)]
fn criar_loja_nativa() -> Result<(), String> {
    let loja = windows_native_keyring_store::Store::new().map_err(|e| e.to_string())?;
    keyring_core::set_default_store(loja);
    Ok(())
}

// Keychain de login comum (`keychain::Store::new()` usa o domínio User): não pede entitlement
// nem assinatura especial. A loja "protected" exige perfil de provisionamento e fica de fora.
#[cfg(target_os = "macos")]
fn criar_loja_nativa() -> Result<(), String> {
    let loja = apple_native_keyring_store::keychain::Store::new().map_err(|e| e.to_string())?;
    keyring_core::set_default_store(loja);
    Ok(())
}

// Secret Service persiste entre reinícios (o keyring do kernel, keyutils, não persiste).
// Sem chaveiro rodando, `Store::new()` falha e o app trata como cofre indisponível (ADR-34).
#[cfg(target_os = "linux")]
fn criar_loja_nativa() -> Result<(), String> {
    let loja = zbus_secret_service_keyring_store::Store::new().map_err(|e| e.to_string())?;
    keyring_core::set_default_store(loja);
    Ok(())
}

/// Entrada do cofre para um segredo desta instalação: serviço = identificador do app
/// (`app.config().identifier`), usuário = `segredo.usuario()`.
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
fn entrada(app: &AppHandle, segredo: &Segredo) -> Result<keyring_core::Entry, String> {
    garantir_loja()?;
    let servico = app.config().identifier.clone();
    keyring_core::Entry::new_with_modifiers(&servico, segredo.usuario(), &modificadores())
        .map_err(|e| e.to_string())
}

/// Windows: persistência `Local` — o segredo pertence a esta máquina. O padrão da loja,
/// `Enterprise`, viajaria entre máquinas de um domínio corporativo, o que não queremos.
#[cfg(windows)]
fn modificadores() -> HashMap<&'static str, &'static str> {
    HashMap::from([("persistence", "Local")])
}

/// macOS (Keychain de login) e Linux (coleção padrão do Secret Service) já guardam por usuário
/// nesta máquina; nenhum modificador é necessário.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn modificadores() -> HashMap<&'static str, &'static str> {
    HashMap::new()
}

/// Lê o valor salvo no cofre. Credencial inexistente não é erro: devolve `None`.
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
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
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
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
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
#[tauri::command]
pub fn apagar_token_conta(app: AppHandle, segredo: Segredo) -> Result<(), String> {
    match entrada(&app, &segredo)?.delete_credential() {
        Ok(()) | Err(keyring_core::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// Sistemas fora dos três (BSDs, por exemplo) não têm loja configurada. Os três comandos
// compilam em qualquer sistema, mas devolvem erro sem depender de nenhuma loja de credenciais.
#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
#[tauri::command]
pub fn ler_token_conta(_app: AppHandle, _segredo: Segredo) -> Result<Option<String>, String> {
    Err("cofre indisponível neste sistema".to_string())
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
#[tauri::command]
pub fn gravar_token_conta(
    _app: AppHandle,
    _segredo: Segredo,
    _token: String,
) -> Result<(), String> {
    Err("cofre indisponível neste sistema".to_string())
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
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
        assert_ne!(
            Segredo::SessaoConta.usuario(),
            Segredo::ChaveDeEnvelope.usuario()
        );
    }
}
