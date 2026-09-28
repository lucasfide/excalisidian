// Trava de sincronização por vault (doc 17 §8.1, plano 12 Task 3). Impede que a janela de um
// vault aberto e o segundo plano rodem um ciclo de sincronização ao mesmo tempo no mesmo vault
// (Review Focus 2 do plano).
//
// A lógica mora numa struct testável (`TravasSync`), sem depender de janela real nem de
// `tauri::State` — os três comandos abaixo são cascas finas em cima dela. Reentrante para o
// mesmo label: uma janela pode chamar `tentar` duas vezes seguidas sem se travar sozinha (ex.:
// o ciclo automático e "Sincronizar agora" quase juntos). Só quem é dono libera; ao destruir uma
// janela, `liberar_todas` solta tudo que sobrou dela — sem isso uma janela fechada no meio de um
// ciclo travaria o vault para sempre (`lib.rs`, `WindowEvent::Destroyed`).

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{State, Window};

use crate::janelas::{normalizar_chave, EstadoJanelas};

#[derive(Default)]
pub struct TravasSync(Mutex<HashMap<String, String>>);

impl TravasSync {
    /// Tenta travar `chave` para `label`. `true` se travou agora ou se `label` já era o dono
    /// (reentrante). `false` se outro label já é dono.
    pub fn tentar(&self, chave: &str, label: &str) -> bool {
        let mut mapa = self.0.lock().unwrap();
        match mapa.get(chave) {
            Some(dono) if dono != label => false,
            _ => {
                mapa.insert(chave.to_string(), label.to_string());
                true
            }
        }
    }

    /// Libera `chave` só se o dono atual for `label`. Liberar uma chave não travada, ou travada
    /// por outro label, não faz nada (não é erro).
    pub fn liberar(&self, chave: &str, label: &str) {
        let mut mapa = self.0.lock().unwrap();
        if mapa.get(chave).map(String::as_str) == Some(label) {
            mapa.remove(chave);
        }
    }

    /// Libera todas as travas cujo dono é `label`. Chamado ao destruir a janela dona.
    pub fn liberar_todas(&self, label: &str) {
        self.0.lock().unwrap().retain(|_, l| l != label);
    }
}

/// Chaves normalizadas (`normalizar_chave`) dos vaults abertos em alguma janela — os valores de
/// `EstadoJanelas` são o label da janela, as chaves são os paths (doc 12 §2).
#[tauri::command]
pub fn vaults_abertos(estado_janelas: State<'_, EstadoJanelas>) -> Vec<String> {
    estado_janelas.0.lock().unwrap().keys().cloned().collect()
}

/// Trava `path` para a janela chamadora. `false` se já travado por outra janela.
#[tauri::command]
pub fn tentar_travar_sync(window: Window, travas: State<'_, TravasSync>, path: String) -> bool {
    let chave = normalizar_chave(&path);
    travas.tentar(&chave, window.label())
}

/// Libera a trava de `path`, só se a janela chamadora for a dona.
#[tauri::command]
pub fn liberar_trava_sync(window: Window, travas: State<'_, TravasSync>, path: String) {
    let chave = normalizar_chave(&path);
    travas.liberar(&chave, window.label());
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn tentar_trava_quando_livre() {
        let travas = TravasSync::default();
        assert!(travas.tentar("c:/vaults/casa", "janela-a"));
    }

    #[test]
    fn tentar_e_reentrante_para_o_mesmo_label() {
        let travas = TravasSync::default();
        assert!(travas.tentar("c:/vaults/casa", "janela-a"));
        assert!(travas.tentar("c:/vaults/casa", "janela-a"));
    }

    #[test]
    fn tentar_recusa_outro_label() {
        let travas = TravasSync::default();
        assert!(travas.tentar("c:/vaults/casa", "janela-a"));
        assert!(!travas.tentar("c:/vaults/casa", "janela-b"));
    }

    #[test]
    fn liberar_so_libera_se_o_dono_for_o_label() {
        let travas = TravasSync::default();
        travas.tentar("c:/vaults/casa", "janela-a");

        travas.liberar("c:/vaults/casa", "janela-b"); // não é dona: não libera
        assert!(!travas.tentar("c:/vaults/casa", "janela-b"));

        travas.liberar("c:/vaults/casa", "janela-a"); // dona: libera
        assert!(travas.tentar("c:/vaults/casa", "janela-b"));
    }

    #[test]
    fn liberar_chave_nao_travada_nao_entra_em_panico() {
        let travas = TravasSync::default();
        travas.liberar("c:/vaults/casa", "janela-a");
        assert!(travas.tentar("c:/vaults/casa", "janela-a"));
    }

    #[test]
    fn liberar_todas_solta_so_as_travas_do_label() {
        let travas = TravasSync::default();
        travas.tentar("c:/vaults/casa", "janela-a");
        travas.tentar("c:/vaults/trabalho", "janela-a");
        travas.tentar("c:/vaults/outro", "janela-b");

        travas.liberar_todas("janela-a");

        assert!(travas.tentar("c:/vaults/casa", "janela-b"));
        assert!(travas.tentar("c:/vaults/trabalho", "janela-b"));
        assert!(!travas.tentar("c:/vaults/outro", "janela-c")); // ainda travado por janela-b
    }
}
