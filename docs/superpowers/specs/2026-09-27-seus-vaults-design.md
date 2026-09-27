# "Seus vaults" e sincronização automática — desenho

Aprovado pelo dono do produto em 27/09/2026. Substitui a experiência da seção Sincronização
entregue no plano 10, e corrige o defeito da chave de envelope.

## Intenção (palavras e pedidos do dono do produto)

- "Falta informação": escolher um vault para sincronizar e depois "baixar um vault sincronizado"
  que já está no próprio computador é confuso.
- Quer, nas Configurações, **um lugar que mostre os vaults do usuário, se estão sincronizados ou
  não, e o caminho deles**.
- **Não pedir a senha de novo** quando a pessoa já está conectada.
- **O vault precisa sincronizar automaticamente**, sem a pessoa pedir.

## 1. Chave de envelope nasce no login e pertence a uma conta

Defeito que motivou: a `chaveDeEnvelope` guardada no cofre tinha sido derivada da conta de teste
e foi reaproveitada ao entrar com a conta de verdade — o vault subiu trancado com a chave errada.

- Ao **entrar** ou **criar conta**, com a senha em mãos, o app deriva a `chaveDeEnvelope` (a mesma
  derivação que já produz a prova — uma derivação só por login, não duas) e guarda no cofre
  **junto com o e-mail normalizado da conta**.
- Ao ler, se o e-mail guardado não for o da sessão atual, ou se a entrada for do formato antigo
  (sem e-mail), a chave é **descartada**.
- Sair da conta apaga a chave (já é assim).
- A senha só é pedida de novo num caso: sessão restaurada pelo token (sem senha digitada) e sem
  chave válida no cofre. A seção mostra "Confirme sua senha para sincronizar neste computador".
- Muda a regra do ADR-33 "senha pedida ao conectar à sincronização" para "ao entrar na conta";
  registrar no ADR-39.

## 2. A lista "Seus vaults"

Na seção Sincronização das Configurações. Topo: conta, plano, "Nome deste computador" (editável).
Abaixo, cada vault **uma vez**, juntando três fontes: vaults recentes deste computador (caminho),
estados de sincronização deste computador (`EstadoSync` por caminho → id no servidor) e vaults da
conta no servidor (nome decifrado).

| Estado | Mostra | Ações |
|---|---|---|
| Sincronizado | nome, caminho, "Sincronizado há X min" / "Sincronizando…" / erro; "N conflitos — abra o vault para resolver" se houver | Abrir · Sincronizar agora · Parar neste computador · Apagar da nuvem… |
| Só neste computador | nome, caminho | Sincronizar |
| Só na nuvem | nome | Baixar para este computador… |
| Pasta não encontrada | nome, caminho antigo | Esquecer neste computador |
| Criado com outra senha | nome desconhecido ("Vault sem nome") | Apagar da nuvem… |

- **Baixar para este computador…**: o diálogo nativo escolhe a **pasta onde colocar**; o app cria
  dentro dela uma pasta com o nome do vault (numerada se já existir, padrão ADR-15), baixa e
  abre. Some o conceito "pasta vazia".
- **Criado com outra senha**: o envelope não abre com a chave desta conta (é o caso do vault de
  teste de 27/09). O conteúdo não pode ser recuperado; a única ação é apagar da nuvem.
- Rodapé da lista: "Os vaults sincronizados atualizam sozinhos enquanto o app está aberto."
- Textos pelo catálogo, pt-BR e inglês; tokens do doc 06; sem jargão.

## 3. Sincronização automática de todos os vaults sincronizados

Hoje só o vault aberto numa janela sincroniza. Passa a ser:

- **Vault aberto numa janela**: sincroniza como hoje, pela janela dele (efeitos na tela, fila de
  conflitos).
- **Vault sincronizado e fechado**: sincroniza em segundo plano, a cada 60 s e ao abrir o app,
  por **uma única janela designada** (a primeira janela aberta). Em segundo plano:
  - os efeitos de tela são nulos (não há árvore nem aba desse vault nesta janela);
  - conflito não entra na fila da tela — fica só em `conflitosPendentes` (persistido) e aparece
    na lista como "N conflitos — abra o vault para resolver"; ao abrir o vault, a janela dele
    re-registra os pendentes (já é assim);
  - o escopo de arquivo do vault é concedido pelo mesmo comando que já concede ao abrir
    (`permitir_vault`).
- **Nunca dois ciclos no mesmo vault ao mesmo tempo**: antes de cada ciclo em segundo plano, a
  janela designada confere no registro de janelas (Rust, doc 12 §2) se o vault está aberto em
  alguma janela; se estiver, pula (a janela dele sincroniza). Um vault que acabou de abrir numa
  janela espera o ciclo em segundo plano terminar antes de começar o seu (trava por vault, em
  memória do processo Rust ou por arquivo — decisão do plano).
- Com o app fechado, nada sincroniza (programa de computador); isso está dito na lista.

## 4. O vault enviado com a chave errada

Depois da correção, o vault de teste enviado em 27/09 aparece como "Criado com outra senha". O
orquestrador apaga essa cópia do servidor (com o dono do produto ciente), e o dono do produto liga
a sincronização de novo pela lista. Os arquivos no computador não são tocados.

## Testes exigidos

- Chave: login grava chave com e-mail; login com outra conta descarta a anterior; formato antigo
  descartado; sessão restaurada sem chave pede senha uma vez; derivação roda uma vez por login.
- Lista: cada estado da tabela a partir de combinações das três fontes (módulo puro).
- Segundo plano: vault aberto em alguma janela é pulado; conflito em segundo plano não vai para a
  fila da tela e aparece na contagem; efeitos nulos (nenhuma árvore de outra janela recarregada);
  nunca dois ciclos simultâneos no mesmo vault.
- Todos os caminhos de chegada à seção (engrenagem, Ctrl+,, ícone do rodapé, "Entrar na conta"
  do assistente), inclusive com Configurações já abertas.
