# A senha nunca sai do computador — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cumprir a consequência 1 do ADR-39. Como a senha da conta também vai proteger o
vault, o servidor nunca pode recebê-la. O app deriva dela, no computador, uma **prova de
identidade** (é o que vai para o servidor) e uma **chave de envelope** (vai proteger a chave do
vault quando a sincronização existir; nunca sai do computador). E cumpre o que o ADR-33 manda
dizer na tela de criação de conta.

**Architecture:** um módulo puro `src/conta/derivacaoSenha.ts` faz a derivação lenta
(Argon2id) e separa as duas chaves (HKDF-SHA256). `ServicoContaHttp.entrar`/`criar` passam a
mandar `{ email, provaDeIdentidade, kdf }` em vez de `{ email, senha }`. A interface
`ServicoConta` **não muda** (continua recebendo a senha): a derivação é detalhe do transporte
HTTP, e o fake e o `contaStore` ficam intactos.

**Tech Stack:** `hash-wasm` (Argon2id, WASM, MIT), `@noble/hashes` (HKDF, SHA-256 e o teste cruzado do Argon2id, MIT), vitest.

**Spec:** ADR-39 e ADR-33 em `docs/09-decisoes-e-incertezas.md`; `docs/16-codigo-de-recuperacao.md`.

## Pesquisa que sustenta o plano (23/09/2026)

- `@noble/hashes` 2.4.0: `argon2id` / `argon2idAsync` em `@noble/hashes/argon2.js` (opções
  `t`, `m` em KiB, `p`, `dkLen`, `maxmem`, `asyncTick`) e `hkdf(sha256, ikm, salt, info, len)`
  em `@noble/hashes/hkdf.js`. Mantida, TypeScript puro, roda igual no vitest (node) e no
  WebView — não aumenta a superfície Rust (ADR-5). **Ressalva:** a auditoria da Cure53 (2022)
  cobriu a biblioteca mas **não** o Argon2. Por isso o teste com os vetores oficiais da RFC
  9106 é obrigatório (Task 2), e não opcional.
- `hash-wasm` 4.12.0 (implementação de referência em C compilada para WASM) foi considerada;
  última publicação em nov/2024. Fica como alternativa se o `@noble` se mostrar lento demais.
- Referência de tempo: `argon2id(t=1, m=128MB)` ≈ 276 ms num Apple M4 (README do noble). Os
  parâmetros escolhidos abaixo devem ficar perto de 1 s num notebook Windows comum.
- **Medição real (23/09/2026, Intel i7-1355U, node):** com `m=65536, t=3, p=4`, o Argon2id do
  `@noble/hashes` levou **3,75–3,93 s** (até 19 s com a máquina ocupada) — acima do limite de
  3 s da Task 2. O `hash-wasm` 4.12.0, com os mesmos parâmetros, levou **0,30–0,34 s**.
  **Decisão (revisão do plano):** o Argon2id passa a ser do `hash-wasm` (implementação de
  referência dos autores do algoritmo, compilada para WASM); o `@noble/hashes` fica para HKDF e
  SHA-256 (partes auditadas) e para o teste. Os parâmetros **não** mudam. O `hash-wasm` não aceita
  o campo *associated data* do vetor da RFC 9106, então o teste passa a ser: vetor da RFC no
  Argon2id do noble **e** igualdade byte a byte entre noble e `hash-wasm` para os parâmetros do
  app — duas implementações independentes concordando. O `tauri.conf.json` tem `csp: null`,
  então o WebView executa WASM sem ajuste.

## Decisões técnicas (registradas no ADR-39 pela Task 1)

1. **Parâmetros:** Argon2id, `m = 65536` KiB (64 MiB), `t = 3`, `p = 4`, 32 bytes — os padrões do
   Bitwarden. Identificados pela etiqueta `argon2id-m65536-t3-p4-v1`, enviada ao servidor junto
   com a prova, para que um dia os parâmetros possam subir sem quebrar quem já tem conta.
2. **Sal:** `sha256("excalisidian-sal-da-conta-v1:" + emailNormalizado)`. O prefixo é uma
   **string literal congelada**, e **não** o `APP_ID` — se o nome do produto mudar (ADR-9), o sal
   não pode mudar, senão ninguém mais consegue entrar. Consequência: trocar o e-mail da conta
   exige derivar tudo de novo (anotado no ADR-39; não há tela de trocar e-mail hoje).
3. **Normalização:** e-mail com `trim()`, minúsculas e NFC; senha só com NFC (a mesma senha
   digitada em teclados diferentes precisa dar o mesmo resultado; espaços da senha são
   respeitados).
4. **Separação:** `chaveMestra = Argon2id(senha, sal)`. Dela saem, por HKDF-SHA256 com `info`
   diferentes e congelados: `provaDeIdentidade` (`"excalisidian/prova-de-identidade/v1"`,
   enviada em base64) e `chaveDeEnvelope` (`"excalisidian/envelope-do-vault/v1"`, nunca sai do
   computador; hoje ninguém a usa — é exportada para fixar o contrato e ter teste).
5. **Contrato novo com o servidor** (anotado no ADR-39): `POST /sessoes` e `POST /contas`
   recebem `{ email, provaDeIdentidade, kdf }`. O servidor trata a prova como trataria uma
   senha — guarda só um hash lento dela — porque quem tiver a prova consegue entrar.
6. **Não travar a tela:** o `argon2id` do `hash-wasm` é assíncrono e leva ~0,3 s. O
   `contaStore` já mostra "ocupado" enquanto `entrar`/`criar` roda.
7. **Mínimo de 12 caracteres ao criar conta**, validado antes de qualquer derivação ou rede,
   com mensagem do catálogo. Só no **criar**: no **entrar**, qualquer senha vai para a
   derivação (quem já tem conta não pode ficar trancado por uma regra nova).
8. **Aviso na criação de conta** (ADR-33, até hoje não implementado): texto fixo, visível só
   no modo "criar conta", dizendo sem eufemismo que a senha não pode ser recuperada, que as
   notas no computador continuam a salvo, e recomendando guardá-la num gerenciador de senhas.

## Global Constraints

- Português do Brasil em nomes e comentários. Texto de interface só pelo catálogo
  (`src/i18n/catalogo/conta.ts`), pt-BR e inglês, sentence case, sem emoji.
- Nenhum valor visual fora dos tokens de `globals.css`; nenhuma classe de cor padrão do
  Tailwind. Copiar o padrão de texto auxiliar que a seção Conta já usa.
- Testes só de módulos puros — sem jsdom, sem `.test.tsx`.
- A senha e a chave mestra nunca vão para disco, log, `console` nem mensagem de erro.
- **Guarda de higiene de commit:** há trabalho não commitado do usuário em `src/editor/`,
  `src/layout/AbaDocumento.tsx`, arquivos não rastreados do glossário e documentos não
  rastreados em `docs/superpowers/`. Não toque. Antes de cada commit, `git status --short` e
  `git diff --cached --stat`; `git add` só com caminho explícito; nunca `git add -A`,
  `git add .` ou `git commit -a`.
- Documentação antes do código: a Task 1 não toca em código.

---

### Task 1: Documentação (sonnet, low)

**Files:** `docs/09-decisoes-e-incertezas.md` (só ADR-39), `docs/05-arquitetura-e-stack.md`
(tabela de stack, se listar bibliotecas JS; se não listar, nada).

- [ ] ADR-39: acrescentar "Como será implementado (plano de 23/09/2026)" com as decisões 1–8,
  em linguagem para quem não é técnico, citando este plano. Trocar "Ainda não existe plano
  escrito para essa mudança" por referência a ele. Estado continua "nada implementado".
- [ ] docs/05: `@noble/hashes` na tabela de stack, marcado como planejado.
- [ ] Commit: `docs: plano da senha que nunca sai do computador (ADR-39)`.

### Task 2: Derivação pura com vetores oficiais (sonnet, medium)

**Files:** `package.json`/`package-lock.json` (`@noble/hashes`, versão exata fixada);
criar `src/conta/derivacaoSenha.ts` e `src/conta/derivacaoSenha.test.ts`.

- [ ] Instalar `@noble/hashes` com versão exata (sem `^`), no mesmo estilo das dependências
  fixadas do `package.json`.
- [ ] Testes ANTES da implementação, vistos falhando:
  - **Vetor da RFC 9106, seção 5.3 (Argon2id)**, passando pelo `argon2id` do noble com os
    parâmetros do vetor (inclusive `secret` e `associated data`, se o noble aceitar; se não
    aceitar, use o vetor sem eles de uma fonte oficial — p. ex. os testes da implementação de
    referência `phc-winner-argon2` — e registre a fonte no relatório). Isto é o que cobre a
    lacuna da auditoria.
  - Determinismo: mesma entrada → mesmas saídas.
  - Normalização: `" Ana@Exemplo.com "` e `"ana@exemplo.com"` dão o mesmo resultado; senha em
    NFD e em NFC dão o mesmo resultado; senha com espaço no fim dá resultado **diferente** da
    sem espaço.
  - E-mails diferentes com a mesma senha → provas diferentes.
  - `provaDeIdentidade` ≠ `chaveDeEnvelope` (separação de domínio).
  - Um **vetor fixo do próprio app**: para `("ana@exemplo.com", "correto cavalo bateria grampo")`
    a prova em base64 é X. Calcule X uma vez, depois de o vetor da RFC passar, e cole no teste
    — ele trava os parâmetros, o sal e as etiquetas `info` contra mudança acidental. Comentário
    no teste: mudar este valor quebra o login de todas as contas existentes.
  - Os testes que rodam o Argon2 com os parâmetros reais podem ser lentos; se passarem de
    alguns segundos cada, use um só cálculo compartilhado (`beforeAll`).
- [ ] Implementar `derivacaoSenha.ts`: constantes congeladas (parâmetros, etiqueta `kdf`,
  prefixo do sal, as duas `info`), `normalizarEmail`, e
  `derivarDaSenha(email, senha): Promise<{ provaDeIdentidade: string; chaveDeEnvelope:
  Uint8Array; kdf: string }>` usando `argon2idAsync`. A chave mestra não sai da função.
  Comentário no topo explicando, em português simples, por que o servidor nunca recebe a senha
  (ADR-39) e que as constantes são contrato com o servidor.
- [ ] **Medir o tempo** de uma derivação real no node e registrar no relatório. Se passar de
  3 s, **não reduza os parâmetros por conta própria**: pare e responda `NEEDS_CONTEXT` com a
  medição.
- [ ] `npm test`, `npm run build`. Commit: `feat(conta): derivacao da senha no computador (argon2id + hkdf)`.

### Task 3: Login e criação mandam a prova, não a senha (sonnet, medium)

**Files:** `src/conta/ServicoContaHttp.ts`, `src/conta/ServicoContaHttp.test.ts`,
`src/conta/tipos.ts` (se precisar de código de erro novo), `src/i18n/catalogo/conta.ts`,
`src/ui/excalisidian/DialogoPreferencias.tsx` (seção Conta).

- [ ] `ServicoContaHttp.entrar`/`criar`: derivar com `derivarDaSenha` e mandar
  `{ email: normalizarEmail(email), provaDeIdentidade, kdf }`. Atualizar o comentário do topo
  (hoje diz que "a senha não passa pelo WebView" — agora ela nem sai do computador).
- [ ] `criar`: senha com menos de 12 caracteres (contando depois do NFC) rejeita com um código
  de erro novo `senhaCurta`, **antes** de derivar e antes de qualquer rede. `entrar` não tem
  mínimo. O `contaStore` já repassa o código; confira se `ErroConta` e o mapeamento de mensagens
  da seção Conta precisam do caso novo.
- [ ] Testes (dublê de `fetch` como os existentes; para não rodar o Argon2 real em todo teste,
  injete a função de derivação pelo construtor com padrão `derivarDaSenha`, igual ao `fetchImpl`):
  o corpo enviado **não contém** a senha em lugar nenhum (procure a string da senha no corpo
  serializado); contém `provaDeIdentidade` e `kdf`; o e-mail vai normalizado; `criar` com senha
  de 11 caracteres rejeita `senhaCurta` sem chamar o `fetch` nem a derivação; `entrar` com senha
  curta chama normalmente. Os testes existentes continuam passando, adaptados sem afrouxar.
- [ ] Catálogo (`conta.ts`, pt-BR e inglês): a mensagem de `senhaCurta` e o aviso da decisão 8.
  Proposta de texto pt-BR (ajuste só se a regra de sentence case pedir):
  - `"Use pelo menos 12 caracteres."`
  - `"Sua senha também protege as notas sincronizadas e não pode ser recuperada — nem por nós. As notas neste computador continuam a salvo. Guarde a senha num gerenciador de senhas."`
- [ ] Seção Conta: o aviso aparece só quando a ação é "criar conta", usando o mesmo estilo de
  texto auxiliar que a seção já tem. Nenhum valor visual novo. O `cobertura.test.ts` tem que
  passar.
- [ ] `npm test`, `npm run build`. Commit: `feat(conta): login manda prova de identidade, nunca a senha`.

### Task 4: Fechamento da documentação (sonnet, low)

- [ ] ADR-39: estado passa a "implementado em <data>, commits <hashes>" para a consequência 1
  e o aviso da criação de conta; a sincronização (que vai usar a `chaveDeEnvelope`) continua não
  implementada. docs/05: tirar "planejado" do `@noble/hashes`.
- [ ] ADR-33: a frase "A tela de criação de conta diz, sem eufemismo..." passa a citar que isso
  está implementado.
- [ ] Commit: `docs: senha nunca sai do computador, implementado (ADR-39)`.

### Fora deste plano

- Guardar a `chaveDeEnvelope` no cofre do sistema e usá-la para envelopar a chave do vault —
  isso é da sincronização (ADR-32/33).
- Trocar senha e trocar e-mail — não há tela para isso hoje.
- O servidor: ele precisa aceitar o contrato da decisão 5 e guardar só um hash lento da prova.
