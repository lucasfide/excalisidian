// Informações do sistema operacional que não pertencem ao domínio do vault (vault.rs é só
// disco). Um comando só, pra saudação da tela de início (RF ver docs/03).

/// Nome de usuário do sistema operacional, ou string vazia se não for possível ler.
/// `USERNAME` é a variável do Windows; `USER` cobre Unix como fallback caso o app rode lá.
#[tauri::command]
pub fn nome_usuario() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default()
}
