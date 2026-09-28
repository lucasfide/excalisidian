# Sincronização mais simples e duas correções — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a lista "Seus vaults" fica com três situações e poucas ações, como o dono do produto
pediu no teste de 29/09; a sessão para de cair ao reabrir o app; um vault que não abre com a
chave da conta para de apagar a chave boa.

**Decisões do dono do produto (29/09/2026):**
- "O usuário só precisa acessar os seus vaults: se já tem sincronizado no PC, aparece que está
  sincronizado. Ele pode apagar o vault e forçar a sincronização. Se não tem no PC, pode baixar,
  definir onde vai ficar, e pronto." Nada de baixar no mesmo computador, parar, esquecer.
- **Apagar** remove só a cópia da nuvem; os arquivos continuam em todos os computadores.

**Causas confirmadas pelo planejador:**
- *Sessão cai ao reabrir:* o log do servidor mostra `POST /v1/sessoes/renovar` 200 seguido de
  vários 401 — várias partes do app (janelas, efeitos) chamam `renovar` com o mesmo token; o
  primeiro troca o token e os outros recebem 401 → o `contaStore` trata como `expirada` e apaga a
  sessão.
- *Senha pedida de novo:* `src/sync/ligarAoVault.ts`, quando `abrirEnvelope` falha, apaga a chave
  do cofre (regra da época em que a chave podia ser de outra senha). Hoje a chave pertence à conta
  (plano 12); falha de envelope significa "vault criado com outra senha", não "chave errada".

## Global Constraints

- Português do Brasil em nomes e comentários; texto de interface só pelo catálogo, pt-BR e
  inglês, sentence case, sem emoji; `cobertura.test.ts` passa. Tokens do doc 06. Hooks antes de
  `return`. Testes antes, vistos falhando; sem jsdom, sem `.test.tsx`.
- Commit com pathspec; nunca `git add -A`, `git add .`, `git commit -a`. Não suba o app. Não
  acesse a VPS (a implantação é do orquestrador).

---

### Task 1: Servidor — renovar tolerante e administração de vaults (sonnet, medium)

**Files:** `servidor/src/banco.ts` (migração), `servidor/src/sessao.ts`, `servidor/src/rotas.ts`,
`servidor/src/admin.ts`, testes.

- [ ] Ao renovar, a sessão antiga não é apagada na hora: fica marcada com `substituida_por`
  (id da nova) e `substituida_em`. Um `renovar` com um token **substituído há até 120 s** devolve
  200 com a MESMA sessão nova (mesmo token novo, mesma validade) — idempotente. Depois de 120 s, ou
  com token substituído por uma sessão já encerrada, 401. `sair` apaga a sessão e as substituídas
  dela. A limpeza de sessões vencidas continua.
- [ ] Testes com o `ServicoContaHttp` real: dois `renovar` com o mesmo token em sequência → os
  dois 200 e o mesmo token novo; três "janelas" renovando ao mesmo tempo (`Promise.all`) → todas
  200 com o mesmo token; após 120 s (relógio injetado) → 401; o token novo continua renovável
  normalmente; `sair` invalida os dois.
- [ ] `excalisidian-admin vaults <email>` (id, bytes, lotes, última atividade — nunca nome, que é
  cifrado) e `excalisidian-admin apagar-vault <email> <id>` (confere que o vault é da conta; apaga
  metadados e arquivos). Testes.
- [ ] `cd servidor && npm test`, `npx tsc --noEmit`, `npm run empacotar`.
  Commit: `fix(servidor): renovar tolerante a chamadas simultaneas e administracao de vaults`.

### Task 2: App — lista simples e envelope que não abre (sonnet, medium)

**Files:** `src/sync/ligarAoVault.ts`, `src/sync/segundoPlano.ts`, `src/sync/motor.ts` (tipo de
erro, se preciso), `src/sync/listaDeVaults.ts`, `src/sync/fluxoSecao.ts`,
`src/ui/excalisidian/SecaoSincronizacao.tsx`, `src/i18n/catalogo/sync.ts`, testes;
`docs/04-regras-de-negocio.md` §17, `docs/17-sincronizacao.md` §7/§8.

- [ ] Envelope que não abre (em `ligarAoVault` e em `segundoPlano`): **não** apaga a chave; grava no
  `EstadoSync` do vault `ultimoErro: "outra-senha"` (acrescente o código ao tipo de erro do ciclo)
  e não liga a sincronização daquele vault. Teste: a chave continua no cofre depois de um envelope
  que não abre.
- [ ] Lista com **três** situações:
  | Situação | Mostra | Ações |
  |---|---|---|
  | Sincronizado | nome, caminho, "Sincronizado há…" / erro | Sincronizar agora · Apagar |
  | Só neste computador | nome, caminho | Sincronizar |
  | Na nuvem | nome | Baixar… |
  - Pasta de um vault sincronizado que não existe mais → o vínculo local é esquecido
    (`esquecer(caminho)`) e o vault aparece como **Na nuvem**.
  - Vault com `ultimoErro: "outra-senha"`, ou da nuvem cujo nome não decifra: aparece como
    Sincronizado/Na nuvem com o texto "Este vault foi criado com outra senha e não abre com esta
    conta." e só a ação **Apagar**.
  - Saem as ações "Abrir", "Parar neste computador", "Esquecer neste computador" e os estados
    "pasta não encontrada" e "criado com outra senha" como estados próprios.
  - **Apagar**: `Dialog` "Apagar «{vault}» da nuvem? Os arquivos continuam em todos os
    computadores; só a cópia da nuvem e a sincronização são removidas." → apaga do servidor,
    esquece o vínculo local (+ `syncStore.parar()` se for o vault aberto nesta janela).
    `nao-encontrado` do servidor conta como sucesso.
  - **Baixar…**: escolher onde; o app cria a pasta com o nome (numera se existir); baixa; abre.
  - Textos: atualize doc 04 §17 e o catálogo (remova as chaves que saíram).
- [ ] Testes (antes, vistos falhando): os três estados; pasta sumida vira "Na nuvem" e esquece o
  vínculo; "outra-senha" só com Apagar; quais ações cada estado mostra.
- [ ] Doc 17 §7/§8 com o modelo simples.
- [ ] `npm test`, `npm run build`. Commit: `feat(sync): lista seus vaults simplificada`.

### Task 3: Implantação e limpeza (orquestrador)

- [ ] Implantar o servidor (LEIAME, seção Atualização) e verificar `/v1/saude`.
- [ ] Com `excalisidian-admin vaults lucasfidecris@hotmail.com`, apagar da nuvem os vaults de teste
  que não abrem com a chave da conta (dono do produto ciente — eram de teste).
- [ ] Roteiro de teste curto.
