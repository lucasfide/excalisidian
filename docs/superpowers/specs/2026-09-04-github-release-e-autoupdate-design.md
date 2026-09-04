# GitHub, release e auto-update — design

Data: 2026-09-04
Branch: `github-release-autoupdater`

## Objetivo

1. Publicar o Excalisidian como projeto open source em `github.com/lucasfide/excalisidian`.
2. Cada release do GitHub carrega um instalador do Windows que o usuário baixa e roda.
3. O app instalado detecta novas versões publicadas no GitHub e se atualiza sozinho, com
   confirmação do usuário.

## Decisões (respondidas pelo usuário em 2026-09-04)

| Assunto | Decisão |
|---|---|
| Licença | MIT, `Copyright (c) 2026 Lucas Fidelis de Cristo` |
| Plataformas | Só Windows (bundle `nsis`), como já está |
| Mecanismo de update | Plugin updater oficial do Tauri v2 (baixa, verifica assinatura minisign, instala, reinicia) |
| Gatilho | Checagem silenciosa ao abrir + comando manual "Verificar atualizações" |
| Assinatura Authenticode | Fora de escopo. Instalador não assinado; usuário vê aviso do SmartScreen na 1ª instalação |
| Assinatura do updater | Par de chaves minisign — obrigatório, já gerado pelo mantenedor |
| Idioma do README/CONTRIBUTING | Português do Brasil, como o resto do projeto |
| Release | Sai como **rascunho** (`releaseDraft: true`); o mantenedor revisa e publica na mão |
| Diálogo de atualização | Componente dedicado (`DialogoAtualizacao.tsx`), não um tipo novo no `dialogoStore` |
| Chave pública minisign | `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEE3Q0Q5RjM2REFCMDYyNjcKUldSbllyRGFOcC9OcDkxZDZ3V0lFeE83dHFidXVFVlRET2VNY2lmZmhVYmk4VkZmeUJYd1kydkIK` |

## Não-objetivos (YAGNI)

- Builds para macOS e Linux.
- Assinatura Authenticode / notarização.
- Updates delta (baixa sempre o instalador completo).
- Canais de release (beta/estável).
- Atualização forçada ou silenciosa sem o usuário confirmar.
- Rollback de versão.
- Visualizador de changelog além do corpo do release (`update.body`).
- Templates de issue/PR do GitHub (pode vir depois).

## Fluxo geral

### Publicar uma versão (mantenedor)

```
npm run versao 0.2.0          # sincroniza package.json + tauri.conf.json + Cargo.toml
git commit -am "v0.2.0"
git tag v0.2.0
git push && git push --tags
        │
        ▼
GitHub Actions (.github/workflows/release.yml, dispara em tag v*)
  runs-on: windows-latest
  npm ci → tauri-apps/tauri-action
    compila o app
    assina o instalador NSIS com TAURI_SIGNING_PRIVATE_KEY
    gera latest.json
    cria um Release RASCUNHO com: Excalisidian_0.2.0_x64-setup.exe,
      Excalisidian_0.2.0_x64-setup.exe.sig, latest.json
        │
        ▼
Mantenedor abre o release rascunho no GitHub, confere e clica em "Publish release"
```

### Atualizar (usuário)

```
App abre → após o boot do vault, verificarAtualizacao({ silencioso: true })
        │
        ▼
plugin-updater check() baixa
  https://github.com/lucasfide/excalisidian/releases/latest/download/latest.json
  compara a versão do manifesto com a versão atual do app
        │
   ┌────┴────┐
   sem nova   tem versão nova
   (nada)         │
                  ▼
        DialogoAtualizacao: "Atualização disponível" + versão + notas
        [Atualizar agora] [Depois]
                  │
             Atualizar agora
                  ▼
        update.downloadAndInstall() — mostra "Baixando atualização… NN%"
        verifica a assinatura contra a pubkey embutida
        executa o instalador (fecha o app) → app reabre na versão nova
```

O comando manual "Verificar atualizações" chama `verificarAtualizacao({ silencioso: false })`:
mesma coisa, mas com retorno visível quando não há nada ("Você já está na versão mais
recente.") e quando falha ("Não foi possível verificar atualizações.").

---

## Seção 1 — Andaime open source

### Arquivos novos

**`LICENSE`** — texto MIT padrão, ano 2026, titular "Lucas Fidelis de Cristo".

**`CONTRIBUTING.md`** (pt-BR, curto):
- Pré-requisitos (Node 20+, Rust, VS Build Tools + C++, WebView2) — reaproveita o README.
- Ordem de leitura dos `docs/` (copiar de `CLAUDE.md`).
- Regra do português do Brasil em nomes e interface.
- `npm test` e `npm run build` verdes antes de abrir PR.
- Como funciona um release (aponta para a Seção 2 deste doc / uma nota em `docs/`).

### Arquivos alterados

**`README.md`** — manter o conteúdo atual e acrescentar:
- Linha de status: "Projeto em desenvolvimento ativo (MVP). Espere bugs."
- Seção "Instalação": baixar o `Excalisidian_x.y.z_x64-setup.exe` mais recente em
  `github.com/lucasfide/excalisidian/releases`. Nota sobre o SmartScreen: como o instalador
  ainda não é assinado, o Windows mostra "O Windows protegeu o computador" — clicar em
  "Mais informações" → "Executar assim mesmo".
- Seção "Atualizações": o app verifica sozinho e avisa quando há versão nova; dá pra checar
  na hora em Configurações → Atualizações ou pelo comando "Verificar atualizações".
- Seção "Licença": MIT, link para `LICENSE`.
- Link para `CONTRIBUTING.md`.

**`.gitignore`** — conferir que cobre tudo que não vai pro repo. Já cobre `src-tauri/target`,
`dist`, `node_modules`, `src-tauri/gen/schemas`. As chaves minisign moram em
`~/.tauri/` (fora do repo) — nada a fazer. Sem mudança prevista; só verificar.

### CI — `.github/workflows/ci.yml`

Dispara em `push` para `main` e em `pull_request`. Um job só, `windows-latest`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verificar:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - run: npm run build          # tsc + vite; também cria dist/ que o tauri-build exige
      - run: npm test               # vitest run
      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --check
      - run: cargo check --manifest-path src-tauri/Cargo.toml
```

`npm run build` roda antes de `cargo check` de propósito: `tauri-build` (no `build.rs`) aborta
se `frontendDist` (`../dist`) não existir. Clippy fica de fora por enquanto para não travar
PR em lint pedante; pode entrar depois.

---

## Seção 2 — Pipeline de release

### `scripts/lancar-versao.mjs` + script npm

Fonte única de verdade da versão hoje está triplicada (`package.json`,
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`), todas em `0.1.0`. Se divergirem, a
comparação do updater quebra. O script recebe um semver e sincroniza os três.

- `node scripts/lancar-versao.mjs 0.2.0`
- Valida o argumento com `/^\d+\.\d+\.\d+$/`; sai com erro se não bater.
- `package.json`: `JSON.parse` → `.version` → grava com 2 espaços de indentação e `\n` final.
- `src-tauri/tauri.conf.json`: idem no campo `.version`.
- `src-tauri/Cargo.toml`: regex trocando a **primeira** linha `^version = "..."` (a de
  `[package]`, que é a primeira do arquivo).
- Não commita nem cria tag. Imprime os próximos passos:
  ```
  Versão sincronizada em 0.2.0. Agora:
    git commit -am "v0.2.0"
    git tag v0.2.0
    git push && git push --tags
  ```
- `package.json` `scripts`: adicionar `"versao": "node scripts/lancar-versao.mjs"`.

### `.github/workflows/release.yml`

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'
jobs:
  release:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - uses: swatinem/rust-cache@v2
        with:
          workspaces: src-tauri
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Excalisidian ${{ github.ref_name }}'
          releaseBody: 'Baixe o instalador em Assets, abaixo. O app existente se atualiza sozinho quando este release for publicado.'
          releaseDraft: true
          prerelease: false
```

- `tauri-action` lê a versão de `src-tauri/tauri.conf.json`, compila, e — porque
  `createUpdaterArtifacts` está ligado (Seção 3) — emite `latest.json` e o `.sig`, subindo
  tudo como assets do release.
- Release sai rascunho. O endpoint `releases/latest/download/latest.json` só resolve depois
  que o mantenedor **publica** o release (rascunho e prerelease não contam para `/latest/`).
  Isso é intencional: nada chega aos usuários sem o mantenedor publicar.

### Secrets no repositório (já criados pelo mantenedor)

- `TAURI_SIGNING_PRIVATE_KEY` — conteúdo de `~/.tauri/excalisidian.key`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — senha da chave.
  **Verificar:** se a chave foi gerada sem senha, confirmar que a `tauri-action` aceita o
  secret vazio; se der problema, regerar a chave com senha e refazer os dois secrets.

---

## Seção 3 — Configuração do updater (Tauri)

### `src-tauri/Cargo.toml`

```toml
[dependencies]
# ...as atuais...
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

### `src-tauri/src/lib.rs`

Registrar os dois plugins só no desktop. A cadeia atual vira:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(watcher::EstadoWatcher::default())
        .invoke_handler(tauri::generate_handler![
            vault::escolher_vault,
            vault::permitir_vault,
            vault::walk_vault,
            watcher::observar_vault,
            sistema::nome_usuario,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Excalisidian");
}
```

### `src-tauri/tauri.conf.json`

```jsonc
{
  "bundle": {
    "active": true,
    "targets": "nsis",
    "createUpdaterArtifacts": true,
    "windows": {
      "nsis": { "installMode": "currentUser" }
    },
    "icon": [ /* ...as atuais... */ ]
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/lucasfide/excalisidian/releases/latest/download/latest.json"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEE3Q0Q5RjM2REFCMDYyNjcKUldSbllyRGFOcC9OcDkxZDZ3V0lFeE83dHFidXVFVlRET2VNY2lmZmhVYmk4VkZmeUJYd1kydkIK"
    }
  }
}
```

`installMode: "currentUser"` (explícito) garante instalação por usuário — sem prompt de UAC
a cada atualização. É o padrão do Tauri, mas fixamos para não depender disso.

### `src-tauri/capabilities/main.json`

Acrescentar às `permissions`:

```json
"updater:default",
"process:allow-restart"
```

### npm

```
npm i @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

### A verificar durante a implementação

- `getVersion()` de `@tauri-apps/api/app` precisa de `core:app:allow-version`. Confirmar que
  `core:default` já cobre; se não, adicionar `core:app:allow-version` às capabilities.
- Nome exato do artefato NSIS que a `tauri-action` gera (para a doc do README).

---

## Seção 4 — Módulo de atualização e interface

Nomes em português, seguindo `docs/05`.

### `src/estado/atualizacaoStore.ts` (zustand)

```ts
type Fase = "oculto" | "disponivel" | "baixando" | "erro";

interface AtualizacaoStore {
  fase: Fase;
  versao: string | null;      // versão nova oferecida
  notas: string | null;       // update.body
  progresso: number;          // 0..1 durante "baixando"
  mensagemErro: string | null;
  oferecer(update: Update): void;   // fase -> "disponivel"
  aplicar(): Promise<void>;         // "baixando" -> download -> relaunch; erro -> "erro"
  adiar(): void;                    // "disponivel" -> "oculto"
  fechar(): void;                   // "erro" -> "oculto"
}
```

- Guarda o objeto `Update` do plugin em uma referência interna (não serializado — ok no
  zustand).
- `aplicar()`:
  - `fase = "baixando"`, `progresso = 0`.
  - `await update.downloadAndInstall(ev => { ... })` acumulando bytes:
    `Started` → guarda `contentLength`; `Progress` → soma `chunkLength`, atualiza
    `progresso = baixado / total`; `Finished` → `progresso = 1`.
  - `await relaunch()` (fallback — no Windows o instalador NSIS já fecha e reabre o app).
  - `catch` → `fase = "erro"`, `mensagemErro = "Não foi possível baixar a atualização. Tente de novo mais tarde."`

### `src/app/atualizacao.ts`

```ts
export async function verificarAtualizacao(opcoes: { silencioso: boolean }): Promise<void>
```

- `const update = await check();`
- `update` nulo:
  - `silencioso` → retorna sem UI.
  - manual → `toast("Você já está na versão mais recente.")` (sonner, já montado no App).
- `update` presente → `useAtualizacaoStore.getState().oferecer(update)`.
- `catch`:
  - `silencioso` → `console.warn` e retorna (sem incomodar o usuário no boot).
  - manual → `toast.error("Não foi possível verificar atualizações.")`.

### `src/ui/excalisidian/DialogoAtualizacao.tsx`

Componente montado uma vez em `App.tsx`. Lê o `atualizacaoStore`. Renderiza `null` quando
`fase === "oculto"`. Usa `Dialog`, `Botao` e tokens do design system — **nada de valor visual
novo**.

- `fase === "disponivel"`: `Dialog` título "Atualização disponível", descrição
  "A versão {versao} está pronta para instalar.", corpo com as `notas` (texto simples, com
  rolagem se longo — usando as classes já existentes de conteúdo), ações
  `[Depois]` (`adiar`) e `[Atualizar agora]` (`variante="primario"`, chama `aplicar`).
- `fase === "baixando"`: `Dialog` sem ações fecháveis, título "Baixando atualização…",
  texto "{Math.round(progresso * 100)}%". **Sem barra de progresso** — não existe componente
  nem tokens de barra em `docs/06`. Se o mantenedor quiser barra depois, é tarefa à parte
  com o design system.
- `fase === "erro"`: `Dialog` título "Não foi possível atualizar", descrição
  `mensagemErro`, ação única `[Fechar]` (`fechar`).

### `src/app/App.tsx`

- Importar `DialogoAtualizacao` e montar junto de `RaizDialogos` / `RaizSobreposicoes`.
- Depois do boot do vault ficar `"pronto"`, agendar (uns 3 s de `setTimeout`, limpo no
  unmount) uma chamada `verificarAtualizacao({ silencioso: true })`. Fora do caminho crítico
  de carregamento.
- Só no desktop/Tauri (o app só roda em Tauri, mas o `check()` lança fora dele — o `catch`
  silencioso já cobre).

### `src/ui/excalisidian/PaletaComandos.tsx`

Novo comando na lista:

```ts
{ id: "verificar-atualizacoes", rotulo: "Verificar atualizações", Icone: RefreshCw,
  executar: () => void verificarAtualizacao({ silencioso: false }) }
```

(`RefreshCw` de `lucide-react`, se estiver disponível na versão pinada; senão outro ícone já
usado.)

### `src/ui/excalisidian/DialogoPreferencias.tsx`

Nova `Secao` "Atualizações":
- Linha com "Versão {getVersion()}" — `getVersion` resolvido em `useEffect` e guardado em
  estado local; enquanto não resolve, não mostra número.
- `Botao` "Verificar atualizações" → `verificarAtualizacao({ silencioso: false })`.

---

## Seção 5 — Textos de interface (`docs/04-regras-de-negocio.md`)

Regra do projeto: todos os textos de interface moram no `docs/04`. Adicionar uma seção
"Atualizações" com as strings abaixo (pt-BR, sentence case, sem emoji):

| Contexto | Texto |
|---|---|
| Título do diálogo de oferta | Atualização disponível |
| Descrição da oferta | A versão {versao} está pronta para instalar. |
| Botão aceitar | Atualizar agora |
| Botão adiar | Depois |
| Título durante download | Baixando atualização… |
| Progresso | {porcentagem}% |
| Título do erro de update | Não foi possível atualizar |
| Erro de download | Não foi possível baixar a atualização. Tente de novo mais tarde. |
| Botão fechar erro | Fechar |
| Sem novidade (comando manual) | Você já está na versão mais recente. |
| Falha ao verificar (comando manual) | Não foi possível verificar atualizações. |
| Comando na paleta | Verificar atualizações |
| Preferências: seção | Atualizações |
| Preferências: versão | Versão {versao} |

---

## Seção 6 — Testes

### `src/app/atualizacao.test.ts` (vitest)

Mockar `@tauri-apps/plugin-updater` (`check`), `@tauri-apps/plugin-process` (`relaunch`) e
`sonner` (`toast`).

Casos:
1. `check` devolve `null` + `silencioso: true` → nenhum `toast`, store intacto.
2. `check` devolve `null` + `silencioso: false` → `toast` com "Você já está na versão mais
   recente.".
3. `check` devolve um `Update` → `atualizacaoStore.fase === "disponivel"` com `versao` e
   `notas` preenchidos; nenhum `toast`.
4. `check` lança + `silencioso: true` → não relança, nenhum `toast`.
5. `check` lança + `silencioso: false` → `toast.error` com "Não foi possível verificar
   atualizações.".

### `src/estado/atualizacaoStore.test.ts` (vitest)

6. `aplicar()` com um `Update` falso cujo `downloadAndInstall` emite `Started`/`Progress`/
   `Finished` → `progresso` chega a 1 e `relaunch` é chamado.
7. `aplicar()` com `downloadAndInstall` que rejeita → `fase === "erro"` e `mensagemErro`
   definida; não relança.

### Verificação manual (documentar no PR)

1. `npm run versao 0.1.0`, `npm run tauri build`, instalar o `.exe`.
2. `npm run versao 0.1.1`, commit, tag `v0.1.1`, push — CI gera o release rascunho.
3. Publicar o release no GitHub.
4. Abrir a versão 0.1.0 instalada → diálogo "Atualização disponível" aparece → "Atualizar
   agora" → baixa, instala, reabre em 0.1.1.
5. Abrir de novo → nenhum diálogo; comando "Verificar atualizações" → "Você já está na versão
   mais recente.".

### Ao fim da fatia

Rodar os testes mínimos da seção 10 do `docs/05`.

---

## Seção 7 — Passos manuais do mantenedor

Já feitos:
- [x] Chave minisign gerada em `~/.tauri/excalisidian.key` (+ `.key.pub`).
- [x] Secrets `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` no repo.
- [x] Repositório `github.com/lucasfide/excalisidian` criado.

A fazer:
- [ ] Adicionar o remote e dar push do branch: `git remote add origin
      https://github.com/lucasfide/excalisidian.git`.
- [ ] Confirmar se a chave foi gerada com senha (afeta a nota da Seção 2).
- [ ] Backup de `~/.tauri/excalisidian.key` + senha em local seguro e separado (se perder a
      chave, apps já instalados não aceitam updates futuros).
- [ ] Após o merge: primeira tag `v0.1.1` para exercitar o pipeline ponta a ponta.
- [ ] Tornar o repositório público (se ainda estiver privado).

---

## Riscos e incertezas

| # | Risco | Mitigação |
|---|---|---|
| 1 | Update silencioso do NSIS pedindo UAC a cada vez | `installMode: "currentUser"` explícito |
| 2 | Secret de senha vazio quebrar a `tauri-action` | Verificar; se falhar, regerar chave com senha |
| 3 | `getVersion()` sem permissão | Verificar `core:default`; adicionar `core:app:allow-version` se preciso |
| 4 | `/releases/latest/` não resolver enquanto o release é rascunho | Comportamento esperado e desejado; documentado. Publicar o release é o gatilho |
| 5 | `cargo check` no CI falhar por falta de `dist/` | `npm run build` roda antes no mesmo job |
| 6 | Nome do artefato NSIS mudar entre versões do Tauri | README aponta para a página de Releases, não para uma URL fixa de `.exe` |
| 7 | `@tauri-apps/api` 2.11.x sem submódulo `app` com `getVersion` | Confirmar na implementação; alternativa: expor a versão via comando Rust |

---

## Ordem de implementação sugerida

1. **Andaime open source** — `LICENSE`, `README.md`, `CONTRIBUTING.md`; `git remote add` +
   push.
2. **CI** — `.github/workflows/ci.yml`.
3. **Script de versão** — `scripts/lancar-versao.mjs` + script npm `versao`.
4. **Backend do updater** — `Cargo.toml`, `lib.rs`, `tauri.conf.json`, `capabilities/main.json`,
   `npm i`.
5. **Textos** — seção "Atualizações" no `docs/04`.
6. **Frontend** — `atualizacaoStore.ts`, `atualizacao.ts`, `DialogoAtualizacao.tsx`, fios em
   `App.tsx`, `PaletaComandos.tsx`, `DialogoPreferencias.tsx`.
7. **Testes** — `atualizacao.test.ts`, `atualizacaoStore.test.ts`; testes mínimos do `docs/05`.
8. **Release** — `.github/workflows/release.yml`.
9. **Verificação manual** ponta a ponta com uma tag de teste.
