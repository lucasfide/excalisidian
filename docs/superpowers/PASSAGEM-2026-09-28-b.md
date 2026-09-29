# Passagem de sessão — 28/09/2026 (parte b)

Leia isto antes de qualquer coisa numa sessão nova, depois de `PASSAGEM-2026-09-28.md`. As memórias
do projeto (`~/.claude/projects/C--Excalisidian/memory/`) já carregam as preferências do dono do
produto: não é técnico; Opus planeja e revisa, agentes Sonnet (low/medium) executam; commit por
caminho explícito; testar o efeito visível; funcionalidade simples primeiro; sem captura de tela
automática.

## Onde estamos

- Branch de trabalho: `servicos-online` (não juntada à `main`).
- A IA do Excalisidian está **no ar** em `https://api.excalisidian.com/v1`: `POST /chat/completions`
  e `GET /creditos`. Fornecedor OpenRouter (ADR-44), modelo `deepseek/deepseek-v4.1-flash`, chave em
  `/etc/excalisidian/ia.env`, gravada pelo dono do produto.
- Créditos pelo custo informado pelo fornecedor × 1,055 (taxa de compra do OpenRouter). Cotas:
  3.000 (`excalisidian-admin premium`) e 10.000 (`excalisidian-admin superior`). No máximo 3 pedidos
  simultâneos e 30 por minuto por conta. `excalisidian-admin uso <email>` mostra consumo e custo.
- App: código de erro `creditos` e medidor de créditos ligado ao saldo real.
- Testes: app 1455; servidor 134 (135 com as edições alheias, ver pendência b).

## Planos e preços decididos (ADR-43)

- Premium: 3.000 créditos. US$ 8/mês ou US$ 59/ano; R$ 35/mês ou R$ 249/ano.
- Superior: 10.000 créditos. US$ 18/mês ou US$ 149/ano; R$ 99/mês ou R$ 779/ano.
- A cobrança ainda é manual.

## Documentos que mandam

- `docs/18-servidor.md` §5, `docs/11-agente-ia.md` §3.2 e §7, `docs/09-decisoes-e-incertezas.md`
  (ADR-43 e ADR-44).
- Plano executado: `docs/superpowers/plans/2026-09-28-14-ia-no-servidor.md`.

## VPS

- Mesmas regras da passagem anterior: acesso só pelo Tailscale, nunca mudar nada sem mostrar a lista
  de comandos e ter autorização do dono do produto, serviços dele intocáveis.
- Acesso: `ssh -i ~/.ssh/excalisidian_vps lucas@100.88.85.127`. O dono do produto usa `root` na
  mesma máquina (`vps157534-knw`).
- A implantação de 28/09 foi feita a partir de uma cópia limpa (worktree em
  `.superpowers/implantacao`, já removida), porque havia edições alheias na árvore. Backup manual
  `2026-09-28_213633` feito antes.

## Pendências

- (a) Teste manual do dono do produto no app com `VITE_SERVIDOR=real`: medidor de créditos e
  `excalisidian-admin uso`.
- (b) Edições alheias não commitadas em `servidor/src/rotas.ts`, `servidor/src/armazenamentoSync.ts`
  e `servidor/src/sync.test.ts` (proteção do id do vault contra caminho fora da pasta; aparentemente
  de uma revisão de segurança paralela; o dono ainda não confirmou de quem é). **Não implantadas.**
  Decidir, commitar e implantar.
- (c) Menores adiados: créditos esgotados tratados como falha momentânea pelo gateiro; 503 sem chave
  mostra "verifique a conexão"; respostas fora de ordem do saldo.
- (d) Pendências antigas da passagem anterior: cobrança, backup fora da VPS, retrato de sincronização
  em partes, tradução das telas, termos de uso e privacidade, juntar `servicos-online` na `main`.
  Somam-se o GDPR do fornecedor (item 31 do doc 09) e o nome comercial do plano superior.
