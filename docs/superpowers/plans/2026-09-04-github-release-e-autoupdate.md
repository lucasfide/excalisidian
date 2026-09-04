# GitHub, instalador e auto-update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar o Excalisidian como projeto open source em `github.com/lucasfide/excalisidian`, com CI, um pipeline de release que gera e assina o instalador do Windows, e um mecanismo de auto-update dentro do app.

**Architecture:** `tauri-apps/tauri-action` compila e assina o instalador em CI a cada tag `v*`, publicando um Release (rascunho) com o `.exe`, o `.sig` e um `latest.json`. Dentro do app, `@tauri-apps/plugin-updater` consulta esse `latest.json`, e um store + diálogo dedicados conduzem oferta → download → reinício, com confirmação do usuário em cada atualização.

**Tech Stack:** Tauri v2 (`tauri-plugin-updater`, `tauri-plugin-process`), React 19 + zustand, GitHub Actions (`tauri-apps/tauri-action`), vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-github-release-e-autoupdate-design.md`

## Global Constraints

- Português do Brasil em nomes de arquivo, componentes, variáveis e comentários (`CLAUDE.md`).
- Interface em português do Brasil, sentence case, sem emoji (`CLAUDE.md`).
- Nenhuma classe de cor Tailwind padrão (`bg-background`, `text-foreground`, `border-input`); só tokens de `globals.css` via os componentes de `src/ui` (`CLAUDE.md`).
- Todos os textos de interface novos entram em `docs/04-regras-de-negocio.md` (`CLAUDE.md`).
- Não tocar na versão pinada de `@excalidraw/excalidraw` (0.18.1) (`CLAUDE.md`).
- Plataforma: só Windows, bundle `nsis` (decisão do usuário, spec).
- Licença: MIT, `Copyright (c) 2026 Lucas Fidelis de Cristo` (decisão do usuário, spec).
- Repositório: `github.com/lucasfide/excalisidian` (decisão do usuário, spec).
- Assinatura Authenticode fora de escopo; instalador não assinado, aviso do SmartScreen aceito (decisão do usuário, spec).
- Progresso do download: só texto (`"Baixando atualização… NN%"`), sem barra — não existe componente de barra em `docs/06-design-system.md` (decisão do usuário, spec).
- Verificar atualização: só paleta de comandos + Preferências, sem terceiro local (decisão do usuário, spec).
- Chave pública minisign já gerada: `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEE3Q0Q5RjM2REFCMDYyNjcKUldSbllyRGFOcC9OcDkxZDZ3V0lFeE83dHFidXVFVlRET2VNY2lmZmhVYmk4VkZmeUJYd1kydkIK` (spec).
- Secrets `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` já cadastrados no repositório GitHub pelo usuário (spec).

---

### Task 1: Licenciamento e andaime open source

**Files:**
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `THIRD_PARTY_LICENSES.md`
- Modify: `README.md`
- Modify: `docs/09-decisoes-e-incertezas.md:679`
- Modify: `docs/05-arquitetura-e-stack.md:274-282`

**Interfaces:** Nenhuma — só arquivos de texto, sem código.

- [ ] **Step 1: Criar `LICENSE`**

```text
MIT License

Copyright (c) 2026 Lucas Fidelis de Cristo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Criar `THIRD_PARTY_LICENSES.md`**

Resolve o item 17 do `docs/09-decisoes-e-incertezas.md` (licença da fonte precisava ser
confirmada antes de distribuir o instalador — confirmado: OFL-1.1).

```markdown
# Licenças de terceiros

O Excalisidian é MIT (`LICENSE`). Ele embute o seguinte software de terceiros:

## @excalidraw/excalidraw

MIT License. https://github.com/excalidraw/excalidraw/blob/master/LICENSE

## Fontes copiadas do pacote do Excalidraw

Copiadas em tempo de build (`scripts/copiar-assets-excalidraw.mjs`) para funcionar offline.
Todas sob a SIL Open Font License 1.1 (https://openfontlicense.org):

- Excalifont
- Virgil
- Cascadia Code
- Comic Shanns
- Nunito
- Lilita One
- Liberation Sans
- Xiaolai
- Assistant

A OFL permite uso, modificação e redistribuição livres, inclusive embutidas num app
distribuído, desde que a fonte em si não seja vendida separadamente — não é o caso aqui.
```

- [ ] **Step 3: Criar `CONTRIBUTING.md`**

```markdown
# Contribuindo com o Excalisidian

## Pré-requisitos

Node 20+, Rust (via rustup), Visual Studio Build Tools com "Desktop development with C++",
WebView2 Runtime.

```
npm install
npm run tauri dev
```

## Antes de mexer no código

Leia, nesta ordem:

1. `docs/02-modelo-de-dados.md` — normativo. Formato dos arquivos, resolução de links.
2. `docs/05-arquitetura-e-stack.md` — stack e estrutura de pastas.
3. `docs/06-design-system.md` — normativo. Nenhuma cor, tamanho ou espaçamento fora dos
   tokens.
4. `docs/04-regras-de-negocio.md` — comportamento em erro e todos os textos de interface.

`CLAUDE.md`, na raiz, tem a lista completa de regras do projeto (nomes em português do
Brasil, nunca escrever direto no disco fora de `escritaAtomica.ts`, etc.).

## Antes de abrir um PR

```
npm run build
npm test
```

Os dois precisam passar. A CI roda a mesma coisa, mais `cargo check` no `src-tauri`.

## Releases

Só o mantenedor publica releases — veja o fluxo em
`docs/superpowers/specs/2026-09-04-github-release-e-autoupdate-design.md`.
```

- [ ] **Step 4: Atualizar `README.md`**

Adicionar, depois da seção "Desenvolvimento" e antes de "Documentação":

```markdown
Projeto em desenvolvimento ativo (MVP). Espere bugs.

## Instalação

Baixe o instalador mais recente (`Excalisidian_x.y.z_x64-setup.exe`) em
[Releases](https://github.com/lucasfide/excalisidian/releases). O instalador ainda não é
assinado digitalmente: o Windows mostra "O Windows protegeu o computador" na primeira
instalação — clique em "Mais informações" e depois em "Executar assim mesmo".

## Atualizações

O app verifica sozinho se há uma versão nova ao abrir e avisa quando encontra. Também dá
para checar na hora pelo comando "Verificar atualizações" (`Ctrl+P`) ou em
Configurações → Atualizações.

## Contribuindo

Veja `CONTRIBUTING.md`.

## Licença

MIT — veja `LICENSE`. Licenças de terceiros embutidos em `THIRD_PARTY_LICENSES.md`.
```

- [ ] **Step 5: Atualizar `docs/09-decisoes-e-incertezas.md:679`**

Trocar:
```
17. **Fontes do Excalidraw empacotadas.** Excalifont vem com o pacote e o projeto é MIT, mas confirme a licença da fonte especificamente antes de distribuir o instalador.
```
por:
```
17. **Fontes do Excalidraw empacotadas.** ~~Excalifont vem com o pacote e o projeto é MIT, mas confirme a licença da fonte especificamente antes de distribuir o instalador.~~ **Resolvido** (2026-09-04): todas as fontes copiadas são OFL-1.1, listadas em `THIRD_PARTY_LICENSES.md`.
```

- [ ] **Step 6: Atualizar `docs/05-arquitetura-e-stack.md:274-282`**

Trocar o bloco:
```
## 11. Empacotamento

Fora do MVP funcional, mas precisa existir antes de instalar em outra máquina:

- `tauri.conf.json` com identificador, ícones e bundle `nsis` para Windows.
- `src-tauri/capabilities/main.json` declarando as permissões dos plugins fs, dialog e store. As permissões são declaradas ali; o **escopo** de caminho é concedido em runtime pelo `escolher_vault`.
- Assinatura de código no Windows: sem certificado, o SmartScreen avisa a cada instalação. Para uso pessoal, aceitável; para distribuir, não.
- Updater: fora do MVP.
- Licenças: Excalidraw é MIT; Fraunces, Instrument Sans e IBM Plex Mono são OFL. Confirme a licença da Excalifont antes de distribuir o instalador.
```
por:
```
## 11. Empacotamento

Fora do MVP funcional, mas precisa existir antes de instalar em outra máquina:

- `tauri.conf.json` com identificador, ícones e bundle `nsis` para Windows.
- `src-tauri/capabilities/main.json` declarando as permissões dos plugins fs, dialog e store. As permissões são declaradas ali; o **escopo** de caminho é concedido em runtime pelo `escolher_vault`.
- Assinatura de código no Windows: sem certificado, o SmartScreen avisa na primeira instalação. Decisão do usuário (2026-09-04): aceitável por ora, mesmo distribuindo — ver `docs/superpowers/specs/2026-09-04-github-release-e-autoupdate-design.md`.
- Updater: implementado (2026-09-04) via `tauri-plugin-updater`, assinatura minisign própria — ver o spec acima.
- Licenças: Excalidraw é MIT; as fontes copiadas do pacote (Excalifont incluída) são OFL-1.1 — ver `THIRD_PARTY_LICENSES.md`.
```

- [ ] **Step 7: Commit**

```bash
git add LICENSE CONTRIBUTING.md THIRD_PARTY_LICENSES.md README.md docs/09-decisoes-e-incertezas.md docs/05-arquitetura-e-stack.md
git commit -m "Licença MIT, README e andaime de contribuição para o open source"
```

---

### Task 2: CI de verificação

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** Nenhuma — só configuração de CI.

- [ ] **Step 1: Criar `.github/workflows/ci.yml`**

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
      - run: npm run build
      - run: npm test
      - run: cargo fmt --manifest-path src-tauri/Cargo.toml --check
      - run: cargo check --manifest-path src-tauri/Cargo.toml
```

`npm run build` roda antes do `cargo check` de propósito: `tauri-build` (`src-tauri/build.rs`)
aborta se `frontendDist` (`../dist`) não existir.

- [ ] **Step 2: Verificar localmente os mesmos comandos, na ordem**

```bash
npm ci
npm run build
npm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: os cinco passam. Se `cargo fmt --check` falhar por formatação (não por erro), rode
`cargo fmt --manifest-path src-tauri/Cargo.toml` para corrigir antes de commitar.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "CI: build, testes e cargo check em push e PR"
```

---

### Task 3: Script de sincronização de versão

Hoje a versão está triplicada em `package.json`, `src-tauri/tauri.conf.json` e
`src-tauri/Cargo.toml` — se divergirem, a comparação do updater quebra.

**Files:**
- Create: `scripts/lancar-versao.mjs`
- Create: `scripts/lancar-versao.test.mjs`
- Modify: `vitest.config.ts`
- Modify: `package.json` (script `versao`)

**Interfaces:**
- Produces: `versaoDoPackageJson(conteudo: string, novaVersao: string): string`,
  `versaoDoTauriConf(conteudo: string, novaVersao: string): string`,
  `versaoDoCargoToml(conteudo: string, novaVersao: string): string` — usadas só pelo teste
  deste arquivo; nenhuma outra task depende delas.

- [ ] **Step 1: Ensinar o vitest a rodar testes em `scripts/`**

Em `vitest.config.ts`, trocar:
```ts
    include: ["src/**/*.test.ts"],
```
por:
```ts
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
```

- [ ] **Step 2: Escrever o teste (vai falhar — o arquivo ainda não existe)**

Criar `scripts/lancar-versao.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import {
  versaoDoPackageJson,
  versaoDoTauriConf,
  versaoDoCargoToml,
} from "./lancar-versao.mjs";

describe("lancar-versao", () => {
  it("troca a versão no package.json mantendo o resto", () => {
    const original =
      JSON.stringify({ name: "excalisidian", version: "0.1.0", private: true }, null, 2) +
      "\n";
    const resultado = versaoDoPackageJson(original, "0.2.0");
    expect(JSON.parse(resultado)).toEqual({
      name: "excalisidian",
      version: "0.2.0",
      private: true,
    });
  });

  it("troca a versão no tauri.conf.json mantendo o resto", () => {
    const original =
      JSON.stringify({ productName: "Excalisidian", version: "0.1.0" }, null, 2) + "\n";
    const resultado = versaoDoTauriConf(original, "0.2.0");
    expect(JSON.parse(resultado)).toEqual({ productName: "Excalisidian", version: "0.2.0" });
  });

  it("troca só a versão do pacote no Cargo.toml, sem tocar versão de dependência", () => {
    const original = [
      "[package]",
      'name = "excalisidian"',
      'version = "0.1.0"',
      "",
      "[dependencies]",
      'tauri = { version = "2", features = [] }',
      "",
    ].join("\n");
    const resultado = versaoDoCargoToml(original, "0.2.0");
    expect(resultado).toContain('tauri = { version = "2", features = [] }');
    expect(resultado.match(/^version = "0\.2\.0"$/m)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run scripts/lancar-versao.test.mjs`
Expected: FAIL — `Cannot find module './lancar-versao.mjs'` (ou equivalente).

- [ ] **Step 4: Implementar `scripts/lancar-versao.mjs`**

```js
// Sincroniza a versão nos três arquivos que a carregam: package.json, tauri.conf.json e
// Cargo.toml. Sem isso divergem e a comparação de versão do updater quebra (spec
// 2026-09-04). Uso: node scripts/lancar-versao.mjs 0.2.0

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function versaoDoPackageJson(conteudo, novaVersao) {
  const dados = JSON.parse(conteudo);
  dados.version = novaVersao;
  return JSON.stringify(dados, null, 2) + "\n";
}

export function versaoDoTauriConf(conteudo, novaVersao) {
  const dados = JSON.parse(conteudo);
  dados.version = novaVersao;
  return JSON.stringify(dados, null, 2) + "\n";
}

export function versaoDoCargoToml(conteudo, novaVersao) {
  return conteudo.replace(/^version = "[^"]*"/m, `version = "${novaVersao}"`);
}

const ALVOS = [
  { caminho: "package.json", transformar: versaoDoPackageJson },
  { caminho: "src-tauri/tauri.conf.json", transformar: versaoDoTauriConf },
  { caminho: "src-tauri/Cargo.toml", transformar: versaoDoCargoToml },
];

function main() {
  const novaVersao = process.argv[2];
  if (!novaVersao || !/^\d+\.\d+\.\d+$/.test(novaVersao)) {
    console.error("Uso: node scripts/lancar-versao.mjs <versão semver, ex.: 0.2.0>");
    process.exit(1);
  }

  for (const { caminho, transformar } of ALVOS) {
    const conteudo = readFileSync(caminho, "utf8");
    writeFileSync(caminho, transformar(conteudo, novaVersao));
  }

  console.log(`Versão sincronizada em ${novaVersao}. Agora:`);
  console.log(`  git commit -am "v${novaVersao}"`);
  console.log(`  git tag v${novaVersao}`);
  console.log(`  git push && git push --tags`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run scripts/lancar-versao.test.mjs`
Expected: PASS — 3 testes.

- [ ] **Step 6: Adicionar o script npm**

Em `package.json`, dentro de `"scripts"`, acrescentar:
```json
    "versao": "node scripts/lancar-versao.mjs",
```

- [ ] **Step 7: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — inclui os testes novos junto com os existentes.

- [ ] **Step 8: Commit**

```bash
git add scripts/lancar-versao.mjs scripts/lancar-versao.test.mjs vitest.config.ts package.json
git commit -m "Script para sincronizar a versão nos três arquivos que a carregam"
```

---

### Task 4: Backend do updater no Tauri

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `package.json` (dependências)

**Interfaces:**
- Produces: plugin `updater` e `process` registrados no app Tauri; permissões
  `updater:default`, `process:allow-restart`, `core:app:allow-version` concedidas à janela
  `main`. A Task 6/7 consome isso via `@tauri-apps/plugin-updater` (`check`) e
  `@tauri-apps/plugin-process` (`relaunch`) no frontend.

- [ ] **Step 1: Instalar as dependências npm**

```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

- [ ] **Step 2: Adicionar as dependências Rust**

Em `src-tauri/Cargo.toml`, depois de `tauri-plugin-store = "2"`:
```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 3: Registrar os plugins em `src-tauri/src/lib.rs`**

Trocar o arquivo inteiro por:

```rust
mod sistema;
mod vault;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Updater e reinício do processo só existem em desktop — o plugin não compila para mobile.
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

- [ ] **Step 4: Configurar o updater em `src-tauri/tauri.conf.json`**

No bloco `"bundle"`, acrescentar `createUpdaterArtifacts` e `windows.nsis.installMode`:
```jsonc
  "bundle": {
    "active": true,
    "targets": "nsis",
    "createUpdaterArtifacts": true,
    "windows": {
      "nsis": {
        "installMode": "currentUser"
      }
    },
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
```

Depois do bloco `"bundle"` (novo bloco irmão, no nível raiz do JSON):
```jsonc
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/lucasfide/excalisidian/releases/latest/download/latest.json"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEE3Q0Q5RjM2REFCMDYyNjcKUldSbllyRGFOcC9OcDkxZDZ3V0lFeE83dHFidXVFVlRET2VNY2lmZmhVYmk4VkZmeUJYd1kydkIK"
    }
  }
```

(a chave é a pública, gerada com `tauri signer generate` — pode ficar no repositório aberto)

- [ ] **Step 5: Declarar as permissões em `src-tauri/capabilities/main.json`**

No array `"permissions"`, depois de `"fs:allow-watch"`, acrescentar:
```json
    "core:app:allow-version",
    "updater:default",
    "process:allow-restart"
```

- [ ] **Step 6: Gerar `dist/` e verificar que o backend compila**

```bash
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: os dois passam sem erro. Se `cargo check` reclamar de `tauri_plugin_updater` ou
`tauri_plugin_process` não encontrados, rode `cargo fetch --manifest-path src-tauri/Cargo.toml`
primeiro.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/tauri.conf.json src-tauri/capabilities/main.json
git commit -m "Backend do updater: plugins updater e process, endpoint e chave pública"
```

---

### Task 5: Textos de atualização em `docs/04-regras-de-negocio.md`

**Files:**
- Modify: `docs/04-regras-de-negocio.md`

**Interfaces:** Nenhuma — as tasks 8 e 9 usam estes textos literalmente na UI.

- [ ] **Step 1: Acrescentar duas linhas na tabela da seção "10. Erros e mensagens"**

Depois da linha `| Lixeira vazia | "A lixeira está vazia." |`, acrescentar:
```markdown
| Falha ao baixar atualização | "Não foi possível baixar a atualização. Tente de novo mais tarde." |
| Falha ao verificar atualização (comando manual) | "Não foi possível verificar atualizações." |
```

- [ ] **Step 2: Acrescentar a seção "12. Atualizações" no fim do arquivo**

Depois do item 8 da seção "11. Decisões de produto que já estão tomadas" (o último conteúdo
do arquivo), acrescentar:

```markdown

## 12. Atualizações

O app verifica sozinho se há uma versão nova ao abrir — silenciosa: se não achar nada ou a
rede falhar, não interrompe o usuário — e também por um comando manual, "Verificar
atualizações" (paleta de comandos e em Configurações).

| Contexto | Texto |
|---|---|
| Diálogo de oferta — título | "Atualização disponível" |
| Diálogo de oferta — descrição | "A versão {versão} está pronta para instalar." |
| Diálogo de oferta — aceitar | "Atualizar agora" |
| Diálogo de oferta — adiar | "Depois" |
| Diálogo de download — título | "Baixando atualização…" |
| Diálogo de download — progresso | "{porcentagem}%" |
| Diálogo de erro — título | "Não foi possível atualizar" |
| Diálogo de erro — botão | "Fechar" |
| Comando manual sem novidade | "Você já está na versão mais recente." |
| Comando na paleta de comandos | "Verificar atualizações" |
| Preferências — seção | "Atualizações" |
| Preferências — versão atual | "Versão {versão}" |

Os erros de rede ("Não foi possível baixar a atualização…" e "Não foi possível verificar
atualizações.") estão na tabela da seção 10, junto com as demais mensagens de erro do app.
```

- [ ] **Step 3: Commit**

```bash
git add docs/04-regras-de-negocio.md
git commit -m "Textos de interface do fluxo de atualização"
```

---

### Task 6: Store de atualização (`atualizacaoStore.ts`)

**Files:**
- Create: `src/estado/atualizacaoStore.ts`
- Test: `src/estado/atualizacaoStore.test.ts`

**Interfaces:**
- Consumes: `relaunch(): Promise<void>` de `@tauri-apps/plugin-process`; o tipo `Update` de
  `@tauri-apps/plugin-updater` (com `version: string`, `body?: string | null`,
  `downloadAndInstall(onEvent?: (e) => void): Promise<void>`).
- Produces: `useAtualizacaoStore` (zustand) com estado
  `{ fase: "oculto" | "disponivel" | "baixando" | "erro", versao: string | null,
  notas: string | null, progresso: number, mensagemErro: string | null }` e ações
  `oferecer(update: Update): void`, `aplicar(): Promise<void>`, `adiar(): void`,
  `fechar(): void`. A Task 7 chama `oferecer`; a Task 8 lê o estado e chama `aplicar`,
  `adiar`, `fechar`.

- [ ] **Step 1: Escrever o teste (vai falhar — o store ainda não existe)**

Criar `src/estado/atualizacaoStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const relaunchMock = vi.fn();
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: () => relaunchMock(),
}));

import { useAtualizacaoStore } from "./atualizacaoStore";

const store = () => useAtualizacaoStore.getState();

beforeEach(() => {
  relaunchMock.mockClear();
  useAtualizacaoStore.setState({
    fase: "oculto",
    versao: null,
    notas: null,
    progresso: 0,
    mensagemErro: null,
  });
});

function updateFalso(overrides: { downloadAndInstall: (onEvent?: (e: unknown) => void) => Promise<void> }) {
  return {
    version: "0.2.0",
    body: "Notas do release.",
    ...overrides,
  } as never;
}

describe("atualizacaoStore", () => {
  it("oferecer() guarda a versão e as notas, e abre a fase 'disponivel'", () => {
    store().oferecer(updateFalso({ downloadAndInstall: async () => {} }));

    expect(store().fase).toBe("disponivel");
    expect(store().versao).toBe("0.2.0");
    expect(store().notas).toBe("Notas do release.");
  });

  it("aplicar() acompanha o progresso, chega a 100% e reinicia o app", async () => {
    const update = updateFalso({
      downloadAndInstall: async (onEvent) => {
        onEvent?.({ event: "Started", data: { contentLength: 200 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
        onEvent?.({ event: "Progress", data: { chunkLength: 100 } });
        onEvent?.({ event: "Finished" });
      },
    });
    store().oferecer(update);

    await store().aplicar();

    expect(store().progresso).toBe(1);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });

  it("aplicar() com falha no download vai para a fase 'erro' e não reinicia", async () => {
    const update = updateFalso({
      downloadAndInstall: async () => {
        throw new Error("rede caiu");
      },
    });
    store().oferecer(update);

    await store().aplicar();

    expect(store().fase).toBe("erro");
    expect(store().mensagemErro).toBe(
      "Não foi possível baixar a atualização. Tente de novo mais tarde.",
    );
    expect(relaunchMock).not.toHaveBeenCalled();
  });

  it("adiar() esconde o diálogo sem mudar versão/notas", () => {
    store().oferecer(updateFalso({ downloadAndInstall: async () => {} }));

    store().adiar();

    expect(store().fase).toBe("oculto");
  });

  it("fechar() esconde o diálogo de erro e limpa a mensagem", () => {
    useAtualizacaoStore.setState({ fase: "erro", mensagemErro: "algo deu errado" });

    store().fechar();

    expect(store().fase).toBe("oculto");
    expect(store().mensagemErro).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/estado/atualizacaoStore.test.ts`
Expected: FAIL — `Cannot find module './atualizacaoStore'` (ou equivalente).

- [ ] **Step 3: Implementar `src/estado/atualizacaoStore.ts`**

```ts
// Estado do fluxo de atualização (spec 2026-09-04): guarda a oferta vinda do updater do
// Tauri e conduz a instalação. Textos do diálogo em docs/04, seção "Atualizações".

import { create } from "zustand";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";

type Fase = "oculto" | "disponivel" | "baixando" | "erro";

interface AtualizacaoState {
  fase: Fase;
  versao: string | null;
  notas: string | null;
  /** 0..1, só relevante durante "baixando". */
  progresso: number;
  mensagemErro: string | null;
  oferecer(update: Update): void;
  aplicar(): Promise<void>;
  adiar(): void;
  fechar(): void;
}

// Guardado fora do zustand: é uma instância de classe do plugin, não um dado serializável de
// UI. Um só por vez — o app nunca oferece duas atualizações ao mesmo tempo.
let updateAtual: Update | null = null;

export const useAtualizacaoStore = create<AtualizacaoState>((set, get) => ({
  fase: "oculto",
  versao: null,
  notas: null,
  progresso: 0,
  mensagemErro: null,

  oferecer(update) {
    updateAtual = update;
    set({
      fase: "disponivel",
      versao: update.version,
      notas: update.body ?? null,
      mensagemErro: null,
    });
  },

  async aplicar() {
    const update = updateAtual;
    if (!update) return;

    set({ fase: "baixando", progresso: 0 });
    let total = 0;
    let baixado = 0;

    try {
      await update.downloadAndInstall((evento) => {
        switch (evento.event) {
          case "Started":
            total = evento.data.contentLength ?? 0;
            break;
          case "Progress":
            baixado += evento.data.chunkLength;
            set({
              progresso: total > 0 ? Math.min(baixado / total, 1) : get().progresso,
            });
            break;
          case "Finished":
            set({ progresso: 1 });
            break;
        }
      });
      await relaunch();
    } catch {
      set({
        fase: "erro",
        mensagemErro: "Não foi possível baixar a atualização. Tente de novo mais tarde.",
      });
    }
  },

  adiar() {
    set({ fase: "oculto" });
  },

  fechar() {
    set({ fase: "oculto", mensagemErro: null });
  },
}));
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/estado/atualizacaoStore.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/estado/atualizacaoStore.ts src/estado/atualizacaoStore.test.ts
git commit -m "Store do fluxo de atualização: oferta, download e erro"
```

---

### Task 7: Orquestrador de checagem (`atualizacao.ts`)

**Files:**
- Create: `src/app/atualizacao.ts`
- Test: `src/app/atualizacao.test.ts`

**Interfaces:**
- Consumes: `useAtualizacaoStore.getState().oferecer(update)` (Task 6); `check(): Promise<Update | null>`
  de `@tauri-apps/plugin-updater`; `toast(msg: string)` e `toast.error(msg: string)` de
  `sonner`.
- Produces: `verificarAtualizacao(opcoes: { silencioso: boolean }): Promise<void>`. A Task 8
  chama com `{ silencioso: true }` no boot; a Task 9 chama com `{ silencioso: false }` no
  comando manual e no botão de Preferências.

- [ ] **Step 1: Escrever o teste (vai falhar — o módulo ainda não existe)**

Criar `src/app/atualizacao.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const checkMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => checkMock(),
}));

const toastErrorMock = vi.fn();
const toastMock = Object.assign(vi.fn(), { error: toastErrorMock });
vi.mock("sonner", () => ({ toast: toastMock }));

const oferecerMock = vi.fn();
vi.mock("../estado/atualizacaoStore", () => ({
  useAtualizacaoStore: { getState: () => ({ oferecer: oferecerMock }) },
}));

import { verificarAtualizacao } from "./atualizacao";

beforeEach(() => {
  checkMock.mockReset();
  toastMock.mockClear();
  toastErrorMock.mockClear();
  oferecerMock.mockClear();
});

describe("verificarAtualizacao", () => {
  it("silenciosa + sem atualização: não mostra nada", async () => {
    checkMock.mockResolvedValue(null);

    await verificarAtualizacao({ silencioso: true });

    expect(toastMock).not.toHaveBeenCalled();
    expect(oferecerMock).not.toHaveBeenCalled();
  });

  it("manual + sem atualização: avisa que já está atualizado", async () => {
    checkMock.mockResolvedValue(null);

    await verificarAtualizacao({ silencioso: false });

    expect(toastMock).toHaveBeenCalledWith("Você já está na versão mais recente.");
  });

  it("com atualização disponível: oferece, silenciosa ou não", async () => {
    const update = { version: "0.2.0" } as never;
    checkMock.mockResolvedValue(update);

    await verificarAtualizacao({ silencioso: true });

    expect(oferecerMock).toHaveBeenCalledWith(update);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("silenciosa + erro: não lança e não avisa", async () => {
    checkMock.mockRejectedValue(new Error("rede caiu"));

    await expect(verificarAtualizacao({ silencioso: true })).resolves.toBeUndefined();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("manual + erro: avisa com toast.error", async () => {
    checkMock.mockRejectedValue(new Error("rede caiu"));

    await verificarAtualizacao({ silencioso: false });

    expect(toastErrorMock).toHaveBeenCalledWith("Não foi possível verificar atualizações.");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/app/atualizacao.test.ts`
Expected: FAIL — `Cannot find module './atualizacao'` (ou equivalente).

- [ ] **Step 3: Implementar `src/app/atualizacao.ts`**

```ts
// Orquestra a checagem de atualização (spec 2026-09-04): chama o updater do Tauri e decide
// o que mostrar dependendo de ser a checagem silenciosa do boot ou o comando manual.

import { check } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";

import { useAtualizacaoStore } from "../estado/atualizacaoStore";

export async function verificarAtualizacao(opcoes: { silencioso: boolean }): Promise<void> {
  try {
    const update = await check();
    if (update) {
      useAtualizacaoStore.getState().oferecer(update);
      return;
    }
    if (!opcoes.silencioso) {
      toast("Você já está na versão mais recente.");
    }
  } catch (erro) {
    if (opcoes.silencioso) {
      console.warn("Falha ao verificar atualizações:", erro);
      return;
    }
    toast.error("Não foi possível verificar atualizações.");
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/app/atualizacao.test.ts`
Expected: PASS — 5 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — todos os testes, incluindo os das tasks 3, 6 e 7.

- [ ] **Step 6: Commit**

```bash
git add src/app/atualizacao.ts src/app/atualizacao.test.ts
git commit -m "Orquestrador de checagem de atualização (silenciosa e manual)"
```

---

### Task 8: Diálogo de atualização e checagem no boot

**Files:**
- Create: `src/ui/excalisidian/DialogoAtualizacao.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `useAtualizacaoStore` (Task 6), `verificarAtualizacao` (Task 7), `Dialog` e
  `Botao` de `../index` (design system existente).
- Produces: componente `<DialogoAtualizacao />`, montado uma vez no `App`.

- [ ] **Step 1: Criar `src/ui/excalisidian/DialogoAtualizacao.tsx`**

```tsx
// Diálogo do fluxo de atualização (spec 2026-09-04): oferta, download e erro num componente
// só, montado uma vez no App. Fases e textos vêm do docs/04, seção "Atualizações". Sem barra
// de progresso — não existe componente de barra no docs/06, e a decisão foi não inventar um.

import { Botao, Dialog } from "../index";
import { useAtualizacaoStore } from "../../estado/atualizacaoStore";

export default function DialogoAtualizacao() {
  const fase = useAtualizacaoStore((s) => s.fase);
  const versao = useAtualizacaoStore((s) => s.versao);
  const notas = useAtualizacaoStore((s) => s.notas);
  const progresso = useAtualizacaoStore((s) => s.progresso);
  const mensagemErro = useAtualizacaoStore((s) => s.mensagemErro);
  const aplicar = useAtualizacaoStore((s) => s.aplicar);
  const adiar = useAtualizacaoStore((s) => s.adiar);
  const fechar = useAtualizacaoStore((s) => s.fechar);

  if (fase === "oculto") return null;

  if (fase === "disponivel") {
    return (
      <Dialog
        titulo="Atualização disponível"
        descricao={`A versão ${versao} está pronta para instalar.`}
        onFechar={adiar}
        acoes={
          <>
            <Botao onClick={adiar}>Depois</Botao>
            <Botao variante="primario" onClick={() => void aplicar()}>
              Atualizar agora
            </Botao>
          </>
        }
      >
        {notas && (
          <p className="max-h-40 overflow-y-auto text-pequeno text-tinta-media [text-wrap:pretty]">
            {notas}
          </p>
        )}
      </Dialog>
    );
  }

  if (fase === "baixando") {
    return (
      <Dialog titulo="Baixando atualização…" onFechar={() => {}}>
        <p className="text-pequeno text-tinta-media">{Math.round(progresso * 100)}%</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      titulo="Não foi possível atualizar"
      descricao={mensagemErro ?? undefined}
      onFechar={fechar}
      acoes={
        <Botao variante="primario" onClick={fechar}>
          Fechar
        </Botao>
      }
    />
  );
}
```

- [ ] **Step 2: Importar e montar em `src/app/App.tsx`**

No bloco de imports, depois de `import DialogoPreferencias from "../ui/excalisidian/DialogoPreferencias";`, acrescentar:
```tsx
import DialogoAtualizacao from "../ui/excalisidian/DialogoAtualizacao";
import { verificarAtualizacao } from "./atualizacao";
```

Depois do `useEffect` que faz `TauriVaultAdapter.doBoot()` (o que termina em
`return () => { ativo = false; };\n  }, []);`), acrescentar um novo efeito:
```tsx

  // Checagem silenciosa de atualização: só depois que o vault carregou, fora do caminho
  // crítico do boot (spec 2026-09-04, "Ao abrir + item de menu manual").
  useEffect(() => {
    if (boot !== "pronto") return;
    const id = window.setTimeout(() => {
      void verificarAtualizacao({ silencioso: true });
    }, 3000);
    return () => window.clearTimeout(id);
  }, [boot]);
```

No JSX final, trocar:
```tsx
      <BarraStatus />
      <RaizDialogos />
      <RaizSobreposicoes />
```
por:
```tsx
      <BarraStatus />
      <RaizDialogos />
      <RaizSobreposicoes />
      <DialogoAtualizacao />
```

- [ ] **Step 3: Verificar que o app builda**

Run: `npm run build`
Expected: PASS, sem erro de tipo (`tsc`) nem de bundle (`vite build`).

- [ ] **Step 4: Verificação manual**

```
npm run tauri dev
```

Abrir o app e confirmar que ele sobe normalmente (sem diálogo de atualização, já que não há
updater configurado ainda no ambiente de dev — nenhuma tela quebrada, nenhum erro no console
além de um possível aviso de falha ao checar, que é esperado sem um release publicado).

- [ ] **Step 5: Commit**

```bash
git add src/ui/excalisidian/DialogoAtualizacao.tsx src/app/App.tsx
git commit -m "Diálogo de atualização e checagem silenciosa no boot"
```

---

### Task 9: Comando na paleta e seção em Preferências

**Files:**
- Modify: `src/ui/excalisidian/PaletaComandos.tsx`
- Modify: `src/ui/excalisidian/DialogoPreferencias.tsx`

**Interfaces:**
- Consumes: `verificarAtualizacao` (Task 7); `getVersion(): Promise<string>` de
  `@tauri-apps/api/app`.

- [ ] **Step 1: Adicionar o comando em `PaletaComandos.tsx`**

Trocar:
```tsx
import { FilePlus, SquarePen, FolderPlus, Home, Columns2, Rows2, X } from "lucide-react";
```
por:
```tsx
import { FilePlus, SquarePen, FolderPlus, Home, Columns2, Rows2, X, RefreshCw } from "lucide-react";
```

Depois de `import { comandoNovaNota, comandoNovoDesenho, comandoNovaPasta } from "../../app/comandos/criacao";`, acrescentar:
```tsx
import { verificarAtualizacao } from "../../app/atualizacao";
```

Na lista de comandos, depois de:
```tsx
    { id: "fechar-aba", rotulo: "Fechar aba", Icone: X, atalho: "CTRL W", executar: () => ws.fecharAtivo() },
```
acrescentar:
```tsx
    {
      id: "verificar-atualizacoes",
      rotulo: "Verificar atualizações",
      Icone: RefreshCw,
      executar: () => void verificarAtualizacao({ silencioso: false }),
    },
```

- [ ] **Step 2: Adicionar a seção "Atualizações" em `DialogoPreferencias.tsx`**

Trocar:
```tsx
import type { ReactNode } from "react";

import { Dialog, GrupoBotoes, type OpcaoGrupo } from "../index";
import { usePrefsStore, type Tema, type LarguraNota } from "../../estado/prefsStore";
```
por:
```tsx
import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";

import { Botao, Dialog, GrupoBotoes, type OpcaoGrupo } from "../index";
import { usePrefsStore, type Tema, type LarguraNota } from "../../estado/prefsStore";
import { verificarAtualizacao } from "../../app/atualizacao";
```

Trocar:
```tsx
export default function DialogoPreferencias({ onFechar }: Props) {
  const tema = usePrefsStore((s) => s.tema);
  const larguraNota = usePrefsStore((s) => s.larguraNota);
  const definirTema = usePrefsStore((s) => s.definirTema);
  const definirLarguraNota = usePrefsStore((s) => s.definirLarguraNota);

  return (
```
por:
```tsx
export default function DialogoPreferencias({ onFechar }: Props) {
  const tema = usePrefsStore((s) => s.tema);
  const larguraNota = usePrefsStore((s) => s.larguraNota);
  const definirTema = usePrefsStore((s) => s.definirTema);
  const definirLarguraNota = usePrefsStore((s) => s.definirLarguraNota);
  const [versao, setVersao] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void getVersion().then((v) => {
      if (ativo) setVersao(v);
    });
    return () => {
      ativo = false;
    };
  }, []);

  return (
```

Trocar:
```tsx
        <Secao titulo="Largura da nota">
          <GrupoBotoes
            rotuloGrupo="Largura da nota"
            opcoes={OPCOES_LARGURA}
            valor={larguraNota}
            onEscolher={definirLarguraNota}
          />
        </Secao>
      </div>
    </Dialog>
```
por:
```tsx
        <Secao titulo="Largura da nota">
          <GrupoBotoes
            rotuloGrupo="Largura da nota"
            opcoes={OPCOES_LARGURA}
            valor={larguraNota}
            onEscolher={definirLarguraNota}
          />
        </Secao>
        <Secao titulo="Atualizações">
          <div className="flex items-center justify-between gap-2">
            <span className="text-pequeno text-tinta-media">
              {versao ? `Versão ${versao}` : ""}
            </span>
            <Botao
              tamanho="compacto"
              onClick={() => void verificarAtualizacao({ silencioso: false })}
            >
              Verificar atualizações
            </Botao>
          </div>
        </Secao>
      </div>
    </Dialog>
```

- [ ] **Step 3: Verificar que o app builda**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Verificação manual**

```
npm run tauri dev
```

`Ctrl+P` → digitar "atualiz" → o comando "Verificar atualizações" aparece e, ao rodar, mostra
o toast "Você já está na versão mais recente." (sem updater publicado ainda, o `check()` do
Tauri em dev deve devolver `null` ou falhar — nos dois casos o app não trava). Abrir
Configurações (ícone de engrenagem) → seção "Atualizações" mostra "Versão 0.1.0" e o botão
funciona do mesmo jeito.

- [ ] **Step 5: Commit**

```bash
git add src/ui/excalisidian/PaletaComandos.tsx src/ui/excalisidian/DialogoPreferencias.tsx
git commit -m "Comando 'Verificar atualizações' na paleta e em Preferências"
```

---

### Task 10: Pipeline de release

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:** Nenhuma — só configuração de CI. Depende do `createUpdaterArtifacts` da
Task 4 e dos secrets já cadastrados pelo usuário (`TAURI_SIGNING_PRIVATE_KEY`,
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).

- [ ] **Step 1: Criar `.github/workflows/release.yml`**

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
          releaseBody: 'Baixe o instalador em Assets, abaixo. O app já instalado se atualiza sozinho quando este release for publicado.'
          releaseDraft: true
          prerelease: false
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "Pipeline de release: tauri-action compila, assina e publica rascunho"
```

Este workflow só roda de verdade quando uma tag `v*` é empurrada — a Task 11 é o primeiro
disparo real.

---

### Task 11: Publicar no GitHub e primeira release de verificação

Esta task é **manual e outward-facing** — publica código e um release público. Confirmar
com o usuário antes do primeiro `git push` para o repositório remoto, mesmo que o
repositório já exista.

**Files:** Nenhum arquivo novo — só comandos de git/GitHub.

- [ ] **Step 1: Conectar o remote (se ainda não estiver conectado)**

```bash
git remote -v
```

Se não houver `origin`, e só depois de confirmar com o usuário:
```bash
git remote add origin https://github.com/lucasfide/excalisidian.git
```

- [ ] **Step 2: Push do branch com todo o trabalho das tasks 1–10**

Confirmar com o usuário antes de rodar (primeiro push para um repositório público):
```bash
git push -u origin github-release-autoupdater
```

Abrir um Pull Request de `github-release-autoupdater` para `main` (ou pedir para o usuário
abrir, se preferir revisar pela interface do GitHub) e mesclar.

- [ ] **Step 3: Cortar a primeira tag de verificação**

Com `main` atualizado localmente (`git checkout main && git pull`):
```bash
npm run versao 0.1.1
git commit -am "v0.1.1"
git tag v0.1.1
git push && git push --tags
```

- [ ] **Step 4: Acompanhar a Action e publicar o release**

Na aba **Actions** do repositório, confirmar que o workflow "Release" termina verde. Na aba
**Releases**, abrir o rascunho `v0.1.1`, conferir que carrega
`Excalisidian_0.1.1_x64-setup.exe`, o `.sig` e `latest.json`, e clicar em **Publish release**.

- [ ] **Step 5: Testar a atualização ponta a ponta**

1. Baixar e instalar o `.exe` de um release **anterior** a este (ou compilar e instalar a
   `0.1.0` local antes de dar o push, se esta for a primeira tag).
2. Abrir o app instalado — dentro de alguns segundos, o diálogo "Atualização disponível"
   deve aparecer oferecendo `0.1.1`.
3. Clicar em "Atualizar agora" — acompanhar "Baixando atualização… NN%" até 100%, o app
   fecha e reabre já em `0.1.1`.
4. Abrir de novo: nenhum diálogo aparece. `Ctrl+P` → "Verificar atualizações" → toast "Você
   já está na versão mais recente."

- [ ] **Step 6: Rodar os testes mínimos da seção 10 do `docs/05-arquitetura-e-stack.md`**

```bash
npm test
```

Expected: PASS — inclui os 10 testes mínimos já existentes mais os desta fatia.

Nada para commitar nesta task além do que as tasks 1–10 já commitaram — ela só publica e
verifica.
