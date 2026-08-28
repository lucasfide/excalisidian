# HANDOFF — começar a codar o Excalisidian

Escrito em 28/08/2026. Este arquivo é para a **primeira sessão de código**. Depois que a Fatia 0 estiver de pé, ele deixa de ser útil e o `docs/08-roadmap.md` assume.

---

## 1. O que é, em cinco linhas

App desktop local-first para Windows. Um vault é uma pasta no disco. Notas são `.md` com live preview. Desenhos são `.draw.md` — markdown com o JSON de uma cena Excalidraw dentro. Notas embutem desenhos, desenhos linkam notas, e os dois vivem na mesma pasta. Sem servidor, sem conta, sem plugin.

Stack: Tauri v2 + Vite + React 19 + TypeScript + CodeMirror 6 + `@excalidraw/excalidraw` 0.18.1 + dockview + Tailwind v4 + zustand.

---

## 2. Como trabalhar neste projeto

**Leia antes de escrever a primeira linha:**

| Documento | Por quê |
|---|---|
| `docs/02-modelo-de-dados.md` | **Normativo.** O que vai no disco. Nada pode divergir. |
| `docs/05-arquitetura-e-stack.md` | Stack, versões fixadas, estrutura de pastas, ponte com o Rust. |
| `docs/06-design-system.md` | **Normativo.** Nenhum valor visual pode ser inventado. |
| `docs/09-decisoes-e-incertezas.md` | O que foi verificado e o que é suposição. **Leia a Parte 3 inteira.** |

`docs/03-requisitos-mvp.md` tem os RF numerados; `docs/04-regras-de-negocio.md` tem os comportamentos de erro e todos os textos de interface; `docs/08-roadmap.md` tem a ordem das fatias.

**Três regras de conduta:**

1. **Não invente valor visual.** Se uma cor, tamanho, espaçamento, raio ou sombra não está no documento 06, pare e pergunte.
2. **Não invente API.** Se a assinatura de uma função de biblioteca não está confirmada, leia a documentação ou o `node_modules` antes de usar. O documento 09 lista o que não foi verificado.
3. **Não instale nada fora da tabela de stack** sem dizer por que e esperar aprovação.

---

## 3. Antes de começar: quatro decisões que só o Lucas pode tomar

Pergunte, não presuma. As duas primeiras bloqueiam a Fatia 0.

1. **O nome do produto está fechado?** "Excalisidian" entra na chave de frontmatter, na pasta de config do vault e na extensão de arquivo temporário. Ver ADR-9 no documento 09 — há uma questão de marca. **Independente da resposta, derive os três de uma constante única `APP_ID`.**
2. **Windows só, ou também macOS?** Se macOS entrar, é preciso normalizar NFD nos nomes de arquivo desde o início.
3. **Repositório Git novo, ou pasta existente?** O `C:\Excalisidian` hoje só tem os docs.
4. **Qual pasta usar como vault de teste?** Precisa de uma pasta real com algumas notas para validar cada fatia.

---

## 4. Pré-requisitos da máquina

Verifique antes; se faltar, avise em vez de tentar instalar sozinho.

```powershell
node --version      # 20+
rustc --version     # instale por https://rustup.rs se faltar
cargo --version
```

Windows também precisa do **Visual Studio Build Tools** com "Desktop development with C++" e do **WebView2 Runtime** (já vem no Windows 11 e no 10 atualizado).

---

## 5. Fatia 0 — passo a passo

O objetivo da Fatia 0 é uma coisa só: **o app abre, pede a pasta do vault uma vez, e nas próximas aberturas lista os arquivos dela sem pedir nada.** Mais o spike de desempenho do canvas.

Isso parece pequeno. Não é — o passo 5.3 é o que tem maior chance de travar o projeto por um dia inteiro.

### 5.1 Andaime

```powershell
cd C:\Excalisidian
npm create tauri-app@latest . -- --template react-ts --manager npm
```

Se o comando reclamar da pasta não estar vazia, gere em `C:\Excalisidian\app` e mova, preservando `docs/` e `CLAUDE.md` na raiz.

Dependências, com as versões do documento 05:

```powershell
npm i @tauri-apps/api@2.11.1 @tauri-apps/plugin-fs@2.5.1 @tauri-apps/plugin-dialog@2.7.2 @tauri-apps/plugin-store@2.4.4
npm i @excalidraw/excalidraw@0.18.1 dockview-react@8.2.0 zustand@5.0.15 minisearch@7.2.0
npm i @codemirror/view@6.43.9 @codemirror/state @codemirror/lang-markdown@6.5.2 @lezer/markdown@1.7.2
npm i unified@11.0.5 remark-parse@11.0.0 remark-gfm@4.0.1 gray-matter@4.0.3
npm i lucide-react @tanstack/react-virtual sonner
npm i -D @tauri-apps/cli@2.11.4 tailwindcss @tailwindcss/vite
```

**Confira as versões instaladas contra a tabela do documento 05.** Se alguma subiu de major, pare e avise — não siga por cima.

`src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-fs = { version = "2", features = ["watch"] }
tauri-plugin-dialog = "2"
tauri-plugin-store = "2"
serde = { version = "1", features = ["derive"] }
walkdir = "2"
```

A feature `watch` do `tauri-plugin-fs` não vem ligada por padrão.

**Critério de pronto:** `npm run tauri dev` abre uma janela.

### 5.2 Tokens do design system

Antes de qualquer tela, ponha o `globals.css` no lugar. O documento 06 tem o arquivo completo — copie de lá, incluindo:

- os `@font-face` das três fontes;
- os tokens de interface, claro e escuro;
- **os 14 tokens de canvas** (`--color-traco-*`, `--color-fundo-*`, `--color-postit-*`);
- as sombras redefinidas no `.dark`;
- o `@utility meta`.

As fontes vão em `public/fontes/`: Fraunces (variável), Instrument Sans (variável), IBM Plex Mono 400 e 500, em `woff2`. Baixe do Google Fonts e **empacote** — o app tem que funcionar offline (RNF5).

Ligue o Tailwind v4 no `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({ plugins: [react(), tailwindcss()] });
```

**Critério de pronto:** uma página com `bg-papel text-tinta font-display` renderiza no papel manilha com Fraunces, e a classe `.dark` no `<html>` troca a paleta.

### 5.3 O comando que escolhe o vault — o passo crítico

**O problema:** no Tauri v2, o diálogo de escolher pasta **não concede** permissão de filesystem para o caminho escolhido, e o escopo concedido em runtime **não sobrevive ao reinício do app**. Sem resolver isso, nada mais funciona.

**A solução:** um comando Rust que abre o diálogo, concede o escopo e devolve o caminho; e um segundo que reaplica o escopo no boot a partir do caminho salvo.

`src-tauri/src/vault.rs` — ponto de partida:

```rust
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

#[derive(Serialize)]
pub struct EntradaArquivo {
    pub path: String,        // relativo à raiz do vault, com "/"
    pub is_dir: bool,
    pub size: u64,
    pub mtime_ms: u64,
    pub birthtime_ms: u64,
}

/// Concede a este processo acesso de leitura e escrita a uma pasta.
/// NÃO persiste entre execuções: precisa ser chamado a cada boot.
#[tauri::command]
pub fn permitir_vault(app: AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn walk_vault(path: String) -> Result<Vec<EntradaArquivo>, String> {
    // walkdir a partir de `path`, ignorando:
    //   qualquer componente que comece com "." (inclui .git, .trash, .excalisidian)
    //   node_modules
    //   arquivos com extensão .excalisidian-tmp
    // devolver caminhos RELATIVOS à raiz, com "/" como separador, normalizados NFC
    todo!()
}
```

`main.rs`:

```rust
mod vault;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            vault::permitir_vault,
            vault::walk_vault,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Excalisidian");
}
```

`src-tauri/capabilities/main.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "store:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-mkdir",
    "fs:allow-read-dir",
    "fs:allow-rename",
    "fs:allow-remove",
    "fs:allow-stat",
    "fs:allow-exists",
    "fs:allow-watch"
  ]
}
```

**Atenção — três coisas para verificar, não presumir:**

1. **`FsExt::allow_directory` e `app.fs_scope()`** são o padrão documentado em discussões do Tauri, mas a assinatura exata **não foi confirmada** na versão que você vai instalar. Confira em `~/.cargo/registry` ou nos docs do `tauri-plugin-fs` 2.x antes de assumir que compila. Se o nome mudou, procure por `scope`, `allow_directory` e `Scope` no crate.
2. A lista de permissões acima é um ponto de partida. Se uma chamada falhar com erro de permissão, o erro do Tauri **diz qual permissão falta** — acrescente essa, não um curinga.
3. Permissão e escopo são coisas separadas. As `permissions` acima liberam as **operações**; o `allow_directory` libera o **caminho**. As duas são necessárias.

O fluxo no front, em `vault/TauriVaultAdapter.ts`:

```ts
// boot
const salvo = await store.get<string>("vaultPath");
if (salvo) {
  await invoke("permitir_vault", { path: salvo });   // reaplica o escopo
  const entradas = await invoke<EntradaArquivo[]>("walk_vault", { path: salvo });
}

// escolher outro vault
const escolhido = await open({ directory: true, multiple: false });
if (escolhido) {
  await invoke("permitir_vault", { path: escolhido });
  await store.set("vaultPath", escolhido);
  await store.save();
}
```

**Critério de pronto:** fecha o app, abre de novo, e ele lista os arquivos do vault sem pedir a pasta nem dar erro de permissão. **Teste isso de verdade, com o app fechado e reaberto** — é exatamente aqui que o escopo não persistente aparece.

### 5.4 Spike do canvas — meia hora, e não pule

O único risco de arquitetura que pode invalidar decisões já tomadas.

Monte o Excalidraw numa rota de teste, gere 500 retângulos programaticamente e meça pan e zoom.

```tsx
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
```

Antes de montar, em `index.html`, **antes** de qualquer script de módulo:

```html
<script>window.EXCALIDRAW_ASSET_PATH = "/";</script>
```

E copie **o conteúdo** de `node_modules/@excalidraw/excalidraw/dist/prod/fonts` para a raiz de `public/` — não a pasta, o conteúdo. Um script de `postinstall` resolve:

```js
// scripts/copiar-assets-excalidraw.mjs
import { cp } from "node:fs/promises";
await cp("node_modules/@excalidraw/excalidraw/dist/prod/fonts", "public", { recursive: true });
```

Sem isso, as fontes vêm de CDN e o app quebra offline — **em silêncio**, o que é pior.

**Critério de pronto:** um número anotado. Pan e zoom com 500 elementos: fluido, aceitável ou travando. Anote o número de FPS ou a impressão concreta no `docs/09` como resultado do spike, junto com a versão do WebView2 da máquina.

Se travar, **pare e avise** antes de seguir. Não é motivo para trocar Tauri por Electron (WebView2 é Chromium, Electron também) — é motivo para conversar sobre reduzir a cena.

### 5.5 Estrutura de pastas

Crie a árvore do documento 05, seção 2, com os arquivos vazios e um comentário de uma linha em cada dizendo o que ele faz. Isso evita que os módulos nasçam no lugar errado nas fatias seguintes.

### Definição de pronto da Fatia 0

- [ ] `npm run tauri dev` abre a janela
- [ ] tokens do design system aplicados, tema claro e escuro trocando
- [ ] fontes carregando do pacote, sem rede
- [ ] escolher vault funciona
- [ ] reabrir o app **não** pede a pasta de novo e **não** dá erro de permissão
- [ ] `walk_vault` devolve a lista correta, ignorando as pastas certas
- [ ] número do spike do canvas anotado
- [ ] estrutura de pastas criada
- [ ] commit único, mensagem "Fatia 0: andaime, acesso ao vault e tokens"

---

## 6. Armadilhas que vão custar tempo

Estão espalhadas pelos documentos. Reunidas aqui porque as seis primeiras aparecem já na Fatia 1.

| Armadilha | O que fazer |
|---|---|
| **Loop watcher ↔ autosave** apagando texto do usuário | Mapa `path → hash` das gravações próprias, evento ignorado quando o path está no mapa e o conteúdo bate, entradas expirando em 2 s. **Não** use flag booleano nem só timestamp: no Windows o `notify` emite 2–3 eventos por gravação. Documento 02, seção 10. |
| **`.excalisidian-tmp` disparando o watcher** | Ignorar por extensão, não só por pasta. Cada salvamento gera um par create/remove. |
| **Escrita não atômica** truncando nota | Sempre `.excalisidian-tmp` + rename. Sem `fsync` — o `plugin-fs` não expõe, e o rename no NTFS já resolve. |
| **`readDir` recursivo via IPC** | Não faça. Um `walk_vault` em Rust, uma chamada. |
| **Nomes de arquivo do Windows** | Validar `< > : " / \ \| ? *`, controle 0–31, `CON PRN AUX NUL COM1-9 LPT1-9` (inclusive `CON.md`), não terminar em ponto ou espaço, caminho até 240 caracteres. |
| **Normalização Unicode** | `.normalize("NFC")` em todo caminho e nome antes de comparar. Sem isso `ação.md` não casa com `[[ação]]`. |
| **BOM em arquivos criados por ferramentas Windows** | Remover `\uFEFF` na leitura e **não** reescrever. |
| **`updateScene` na 0.18** | Trocou `commitToHistory` por `captureUpdate`, e o default é `EVENTUALLY`. Recarregar do disco precisa de `NEVER`; inserir post-it precisa de `IMMEDIATELY`. |
| **`ref` no Excalidraw** | Foi removido na 0.17. Use a prop `excalidrawAPI`. |
| **Ordem de chaves na serialização da cena** | Alfabética fixa, e omitir `version`, `versionNonce`, `updated`. Sem isso, abrir e fechar um desenho gera diff no Git. |
| **`Ctrl+Delete` no canvas** | Limpa a cena inteira. Bloquear em fase de captura. Desligar o item de menu por `UIOptions` **não** desliga o atalho. |
| **Lixeira do sistema** | O `plugin-fs` não tem. Exige o crate `trash`. No MVP a lixeira é a pasta do vault e isso não é necessário. |

---

## 7. Os testes que importam

Não é para buscar cobertura. É para ter estes dez, cada um escrito na fatia que o torna possível:

1. `parseDesenho(serializarDesenho(x)) === x` para uma cena com texto, imagem, link e post-it.
2. Serializar duas vezes a mesma cena produz bytes idênticos.
3. Resolução de link com nomes duplicados escolhe o esperado, e `[[Arquitetura]]` resolve para a nota quando existem `Arquitetura.md` e `Arquitetura.draw.md`.
4. Rename atualiza links em nota e dentro de desenho.
5. Escrita atômica seguida de evento do watcher não dispara recarga.
6. Validação de nome recusa `CON.md`, `a:b.md` e nome terminado em ponto.
7. Restaurar da lixeira com colisão de nome gera `(restaurado)`.
8. `blockId` gerado a partir do id do elemento é estável e nunca contém `_`.
9. Texto de canvas contendo `%%`, três crases, uma linha `## Scene`, uma linha começando com `^` e uma linha em branco no meio sobrevive a um ciclo de gravação e leitura.
10. `Ctrl+Delete` dentro do canvas não apaga a cena.

---

## 8. O que fazer quando a especificação não responde

Nesta ordem:

1. Procure no documento 09, Parte 3 — pode já estar registrado como incerteza conhecida.
2. Procure no documento 04 — comportamentos e casos de borda moram lá.
3. Se for uma decisão de produto, **pergunte**. Não escolha em silêncio.
4. Se for detalhe de implementação sem consequência para o disco nem para a interface, decida e registre em uma linha no commit.

**Nunca** mude o documento 02 ou o 06 sem falar — os dois são normativos.

---

## 9. Ordem das fatias depois desta

Do `docs/08-roadmap.md`, com o que dá para adiantar:

| Fatia | O que entrega |
|---|---|
| 1 | Ler e escrever uma nota, sidebar, autosave |
| 2 | Live preview — **a mais cara.** Gaste meio dia testando `@atomic-editor/editor` 0.6.2 antes de escrever do zero |
| 3 | Wikilinks, índice, backlinks, rename em lote |
| 4 | Abas e divisão de tela com dockview |
| 5 | Watcher e conflitos |
| 6 | Canvas e o formato `.draw.md` |
| 7 | Integração nota ↔ desenho |
| 8 | Busca, lixeira, acabamento |

Cada fatia termina em algo usável. Não comece a próxima antes do critério de pronto da atual.
