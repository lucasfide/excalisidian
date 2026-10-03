// Trava de sincronização por vault (doc 17 §8.1, plano 12 Task 3). Impede que a janela de um
// vault aberto e o segundo plano rodem um ciclo de sincronização ao mesmo tempo no mesmo vault
// (Review Focus 2 do plano).
//
// A lógica mora numa struct testável (`TravasSync`), sem depender de janela real nem de
// `tauri::State` — os três comandos abaixo são cascas finas em cima dela.
//
// **Por dono, não por label** (correção pós-revisão do commit 104fb5e): a janela designada do
// segundo plano (plano 12 Task 5) pode ser a MESMA janela onde um vault acabou de ser aberto —
// o ciclo em segundo plano e o `syncStore` dessa janela teriam o mesmo `label`. Uma trava
// reentrante por label deixaria os dois passarem juntos no mesmo vault, e o primeiro a terminar
// liberaria a trava do outro (a própria brecha que a trava existe para fechar). Por isso o dono
// é um token aleatório por tentativa (`dono`, gerado no TS a cada ciclo — `crypto.randomUUID()`
// em `sync/coordenacao.ts`), NÃO reentrante: uma segunda tentativa para a mesma chave sempre
// devolve `false`, mesmo vinda do mesmo label ou do mesmo dono de antes. Só quem apresenta o
// `dono` exato libera. `label` continua guardado por chave só para `liberar_todas` — ao destruir
// uma janela, solta tudo que sobrou dela, mesmo travas cujo `dono` ninguém mais tem (senão uma
// janela fechada no meio de um ciclo travaria o vault para sempre — `lib.rs`,
// `WindowEvent::Destroyed`).

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{State, Window};

use crate::janelas::{normalizar_chave, EstadoJanelas};

#[derive(Default)]
pub struct TravasSync(Mutex<HashMap<String, (String, String)>>); // chave -> (label, dono)

impl TravasSync {
    /// Tenta travar `chave` para `dono` (chamado pela janela `label`, guardado só para
    /// `liberar_todas`). `true` se travou agora. `false` se a chave já está travada por
    /// qualquer dono — inclusive um pedido anterior do mesmo `label`/`dono`: não reentrante.
    pub fn tentar(&self, chave: &str, label: &str, dono: &str) -> bool {
        let mut mapa = self.0.lock().unwrap();
        if mapa.contains_key(chave) {
            return false;
        }
        mapa.insert(chave.to_string(), (label.to_string(), dono.to_string()));
        true
    }

    /// Libera `chave` só se o dono atual for `dono`. Liberar uma chave não travada, ou travada
    /// por outro dono, não faz nada (não é erro).
    pub fn liberar(&self, chave: &str, dono: &str) {
        let mut mapa = self.0.lock().unwrap();
        if mapa.get(chave).map(|(_, d)| d.as_str()) == Some(dono) {
            mapa.remove(chave);
        }
    }

    /// Libera todas as travas cujo `label` é o da janela destruída — mesmo as cujo `dono`
    /// ninguém mais consegue apresentar.
    pub fn liberar_todas(&self, label: &str) {
        self.0.lock().unwrap().retain(|_, (l, _)| l != label);
    }
}

/// Chaves normalizadas (`normalizar_chave`) dos vaults abertos em alguma janela — os valores de
/// `EstadoJanelas` são o label da janela, as chaves são os paths (doc 12 §2).
#[tauri::command]
pub fn vaults_abertos(estado_janelas: State<'_, EstadoJanelas>) -> Vec<String> {
    estado_janelas.0.lock().unwrap().keys().cloned().collect()
}

/// Trava `path` para `dono` (token aleatório gerado por quem chama, um por tentativa). `false`
/// se já travado por qualquer dono — inclusive um pedido anterior desta mesma janela.
#[tauri::command]
pub fn tentar_travar_sync(
    window: Window,
    travas: State<'_, TravasSync>,
    path: String,
    dono: String,
) -> bool {
    let chave = normalizar_chave(&path);
    travas.tentar(&chave, window.label(), &dono)
}

/// Libera a trava de `path`, só se `dono` for exatamente quem a tem.
#[tauri::command]
pub fn liberar_trava_sync(
    _window: Window,
    travas: State<'_, TravasSync>,
    path: String,
    dono: String,
) {
    let chave = normalizar_chave(&path);
    travas.liberar(&chave, &dono);
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn tentar_trava_quando_livre() {
        let travas = TravasSync::default();
        assert!(travas.tentar("c:/vaults/casa", "janela-a", "dono-1"));
    }

    #[test]
    fn segunda_tentativa_do_mesmo_label_e_recusada_nao_reentrante() {
        let travas = TravasSync::default();
        assert!(travas.tentar("c:/vaults/casa", "janela-a", "dono-1"));
        // Mesmo label, novo dono (ex.: o segundo plano e a janela do vault são a mesma janela,
        // cada um com seu próprio ciclo): recusado.
        assert!(!travas.tentar("c:/vaults/casa", "janela-a", "dono-2"));
        // Mesmo label, MESMO dono de antes (ex.: um retry que reusasse o token): também
        // recusado — a trava não é reentrante de jeito nenhum.
        assert!(!travas.tentar("c:/vaults/casa", "janela-a", "dono-1"));
    }

    #[test]
    fn tentar_recusa_outro_label() {
        let travas = TravasSync::default();
        assert!(travas.tentar("c:/vaults/casa", "janela-a", "dono-1"));
        assert!(!travas.tentar("c:/vaults/casa", "janela-b", "dono-2"));
    }

    #[test]
    fn liberar_com_dono_errado_nao_libera() {
        let travas = TravasSync::default();
        travas.tentar("c:/vaults/casa", "janela-a", "dono-1");

        travas.liberar("c:/vaults/casa", "dono-errado");
        assert!(!travas.tentar("c:/vaults/casa", "janela-b", "dono-2"));

        travas.liberar("c:/vaults/casa", "dono-1"); // dono certo: libera
        assert!(travas.tentar("c:/vaults/casa", "janela-b", "dono-2"));
    }

    #[test]
    fn liberar_chave_nao_travada_nao_entra_em_panico() {
        let travas = TravasSync::default();
        travas.liberar("c:/vaults/casa", "dono-1");
        assert!(travas.tentar("c:/vaults/casa", "janela-a", "dono-1"));
    }

    #[test]
    fn liberar_todas_solta_as_travas_da_janela_mesmo_sem_o_dono() {
        let travas = TravasSync::default();
        travas.tentar("c:/vaults/casa", "janela-a", "dono-1");
        travas.tentar("c:/vaults/trabalho", "janela-a", "dono-2");
        travas.tentar("c:/vaults/outro", "janela-b", "dono-3");

        travas.liberar_todas("janela-a");

        assert!(travas.tentar("c:/vaults/casa", "janela-b", "dono-4"));
        assert!(travas.tentar("c:/vaults/trabalho", "janela-b", "dono-5"));
        assert!(!travas.tentar("c:/vaults/outro", "janela-c", "dono-6")); // ainda travado por janela-b
    }
}
