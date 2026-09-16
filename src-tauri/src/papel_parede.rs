use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

const NOME_ARQUIVO: &str = "papel-parede-home";
static PROXIMO_TEMPORARIO: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PapelParedeArquivo {
    pub path: String,
    pub mime: String,
}

#[tauri::command]
pub fn preparar_papel_parede_home(app: AppHandle) -> Result<Option<PapelParedeArquivo>, String> {
    let destino = caminho_gerenciado(&app)?;
    let mut arquivo = match File::open(&destino) {
        Ok(arquivo) => arquivo,
        Err(erro) if erro.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(erro) => return Err(format!("não foi possível abrir o papel de parede: {erro}")),
    };

    let mime = detectar_mime_arquivo(&mut arquivo)?;
    let descricao = descrever_arquivo(&destino, mime)?;
    conceder_leitura(&app, &destino)?;
    Ok(Some(descricao))
}

#[tauri::command]
pub fn importar_papel_parede_home(
    app: AppHandle,
    path: String,
) -> Result<PapelParedeArquivo, String> {
    let origem = Path::new(&path);
    let mut arquivo_origem = File::open(origem)
        .map_err(|erro| format!("não foi possível abrir a imagem selecionada: {erro}"))?;
    let mime = detectar_mime_arquivo(&mut arquivo_origem)?;

    let destino = caminho_gerenciado(&app)?;
    let diretorio = destino
        .parent()
        .ok_or_else(|| "diretório do papel de parede inválido".to_string())?;
    fs::create_dir_all(diretorio)
        .map_err(|erro| format!("não foi possível criar o diretório do papel de parede: {erro}"))?;

    let descricao = descrever_arquivo(&destino, mime)?;
    conceder_leitura(&app, &destino)?;

    let temporario = caminho_temporario(&destino);
    let resultado = copiar_e_substituir(&mut arquivo_origem, &temporario, &destino);
    if resultado.is_err() {
        let _ = fs::remove_file(&temporario);
    }
    resultado?;

    Ok(descricao)
}

#[tauri::command]
pub fn remover_papel_parede_home(app: AppHandle) -> Result<(), String> {
    let destino = caminho_gerenciado(&app)?;
    match fs::remove_file(destino) {
        Ok(()) => Ok(()),
        Err(erro) if erro.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(erro) => Err(format!(
            "não foi possível remover o papel de parede: {erro}"
        )),
    }
}

fn caminho_gerenciado(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|diretorio| caminho_gerenciado_em(&diretorio))
        .map_err(|erro| format!("não foi possível localizar os dados do aplicativo: {erro}"))
}

fn caminho_gerenciado_em(diretorio: &Path) -> PathBuf {
    diretorio.join(NOME_ARQUIVO)
}

fn caminho_temporario(destino: &Path) -> PathBuf {
    let sequencia = PROXIMO_TEMPORARIO.fetch_add(1, Ordering::Relaxed);
    destino.with_file_name(format!(
        "{NOME_ARQUIVO}.tmp.{}.{}",
        std::process::id(),
        sequencia
    ))
}

fn copiar_e_substituir(origem: &mut File, temporario: &Path, destino: &Path) -> Result<(), String> {
    let mut saida = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temporario)
        .map_err(|erro| format!("não foi possível criar o arquivo temporário: {erro}"))?;

    std::io::copy(origem, &mut saida)
        .map_err(|erro| format!("não foi possível copiar o papel de parede: {erro}"))?;
    saida
        .flush()
        .and_then(|_| saida.sync_all())
        .map_err(|erro| format!("não foi possível salvar o papel de parede: {erro}"))?;
    drop(saida);

    substituir_atomicamente(temporario, destino)
        .map_err(|erro| format!("não foi possível substituir o papel de parede: {erro}"))
}

#[cfg(not(windows))]
fn substituir_atomicamente(temporario: &Path, destino: &Path) -> std::io::Result<()> {
    fs::rename(temporario, destino)
}

#[cfg(windows)]
fn substituir_atomicamente(temporario: &Path, destino: &Path) -> std::io::Result<()> {
    match fs::rename(temporario, destino) {
        Ok(()) => Ok(()),
        Err(_erro_rename) if destino.exists() => substituir_arquivo_windows(temporario, destino),
        Err(erro_rename) => Err(erro_rename),
    }
}

#[cfg(windows)]
fn substituir_arquivo_windows(temporario: &Path, destino: &Path) -> std::io::Result<()> {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt};

    #[link(name = "Kernel32")]
    extern "system" {
        fn ReplaceFileW(
            replaced_file_name: *const u16,
            replacement_file_name: *const u16,
            backup_file_name: *const u16,
            replace_flags: u32,
            exclude: *mut c_void,
            reserved: *mut c_void,
        ) -> i32;
    }

    let destino_wide: Vec<u16> = destino
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let temporario_wide: Vec<u16> = temporario
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let substituido = unsafe {
        ReplaceFileW(
            destino_wide.as_ptr(),
            temporario_wide.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };

    if substituido != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

fn detectar_mime_arquivo(arquivo: &mut File) -> Result<&'static str, String> {
    let mut cabecalho = [0_u8; 12];
    let mut quantidade = 0;
    while quantidade < cabecalho.len() {
        let lidos = arquivo
            .read(&mut cabecalho[quantidade..])
            .map_err(|erro| format!("não foi possível ler a imagem: {erro}"))?;
        if lidos == 0 {
            break;
        }
        quantidade += lidos;
    }
    arquivo
        .rewind()
        .map_err(|erro| format!("não foi possível reler a imagem: {erro}"))?;
    detectar_mime(&cabecalho[..quantidade])
        .ok_or_else(|| "formato de imagem inválido; use JPEG, PNG ou WebP".to_string())
}

fn detectar_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn conceder_leitura(app: &AppHandle, caminho: &Path) -> Result<(), String> {
    app.fs_scope()
        .allow_file(caminho)
        .map_err(|erro| format!("não foi possível liberar a leitura do papel de parede: {erro}"))
}

fn descrever_arquivo(caminho: &Path, mime: &str) -> Result<PapelParedeArquivo, String> {
    let path = caminho
        .to_str()
        .ok_or_else(|| "o caminho do papel de parede não é UTF-8 válido".to_string())?
        .to_string();
    Ok(PapelParedeArquivo {
        path,
        mime: mime.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{caminho_gerenciado_em, detectar_mime, NOME_ARQUIVO};
    use std::path::Path;

    #[test]
    fn detecta_jpeg_pela_assinatura() {
        assert_eq!(detectar_mime(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
    }

    #[test]
    fn detecta_png_pela_assinatura_completa() {
        assert_eq!(
            detectar_mime(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
            Some("image/png")
        );
    }

    #[test]
    fn detecta_webp_no_container_riff() {
        assert_eq!(
            detectar_mime(b"RIFF\x04\x00\x00\x00WEBP"),
            Some("image/webp")
        );
    }

    #[test]
    fn rejeita_assinaturas_truncadas_ou_desconhecidas() {
        assert_eq!(detectar_mime(&[0xff, 0xd8]), None);
        assert_eq!(detectar_mime(b"RIFFWEBP"), None);
        assert_eq!(detectar_mime(b"GIF89a"), None);
    }

    #[test]
    fn usa_nome_estavel_no_diretorio_do_aplicativo() {
        assert_eq!(
            caminho_gerenciado_em(Path::new("dados")),
            Path::new("dados").join(NOME_ARQUIVO)
        );
    }
}
