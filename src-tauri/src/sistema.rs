// Informações do sistema operacional que não pertencem ao domínio do vault (vault.rs é só
// disco). Comandos de SO: saudação da tela de início e abrir uma pasta no Explorer.

/// Nome de usuário do sistema operacional, ou string vazia se não for possível ler.
/// `USERNAME` é a variável do Windows; `USER` cobre Unix como fallback caso o app rode lá.
#[tauri::command]
pub fn nome_usuario() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_default()
}

/// Abre `path` no gerenciador de arquivos do sistema (Windows: `explorer.exe`).
/// Usado por "Abrir pasta do agente" (doc 11 §6.3). A pasta é criada se não existir —
/// sem ela, o Explorer abre "Documentos" por trás, o que parece bug mas é do explorer.
#[tauri::command]
pub fn revelar_pasta(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Abrir pasta não é suportado fora do Windows.".to_string())
    }
}
