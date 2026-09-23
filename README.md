# Excalisidian

Um caderno de trabalho local para Windows onde notas em Markdown e desenhos moram na mesma
pasta de arquivos e se referenciam entre si. Existe porque unir Markdown e um canvas de desenho (como o plugin
Excalidraw faz dentro do Obsidian) hoje custa instalar um app de notas, um plugin e um
marketplace inteiro — a aposta do Excalisidian é que dá para tratar os dois como cidadãos de
primeira classe desde o início, num app menor e local-first.

Recursos hoje:

- Vault: uma pasta no disco escolhida pelo usuário, com subpastas livres.
- Notas `.md` com live preview (a sintaxe some quando o cursor sai da linha), wikilinks,
  embeds e frontmatter.
- Desenhos `.draw.md` — Markdown de verdade com a cena do Excalidraw dentro, referenciados
  como `[[Nome.draw]]`.
- Tabelas editáveis direto na nota, com colunas redimensionáveis.
- Abas com divisão de tela horizontal e vertical, arrastar aba para dividir.
- Vários vaults, cada um na sua janela.
- Sidebar com árvore de pastas, busca por nome e por conteúdo, backlinks.
- Lixeira com restaurar e esvaziar.
- Painel de tarefas na lateral direita.
- Agente de IA opcional, desligado por padrão (veja "Privacidade" abaixo).

Sem servidor, sem conta, sem plugin.

## Stack

Tauri v2 · Vite · React 19 · TypeScript · CodeMirror 6 · `@excalidraw/excalidraw` 0.18.1 ·
dockview · Tailwind v4 · zustand. Versões fixadas em `docs/05-arquitetura-e-stack.md`.

## Desenvolvimento

Pré-requisitos: Node 20+, Rust (rustup), Visual Studio Build Tools com "Desktop development
with C++", WebView2 Runtime.

```
npm install          # roda o postinstall que copia as fontes do Excalidraw para public/
npm run tauri dev
npm run tauri build
npm test
```

Projeto em desenvolvimento ativo (MVP). Espere bugs.

## Instalação

Baixe o instalador mais recente (`Excalisidian_x.y.z_x64-setup.exe`) em
[Releases](https://github.com/lucasfide/excalisidian/releases). Enquanto o instalador não é
assinado digitalmente (veja "Assinatura de código" abaixo), o Windows mostra "O Windows
protegeu o computador" na primeira instalação — clique em "Mais informações" e depois em
"Executar assim mesmo".

## Atualizações

O app verifica sozinho se há uma versão nova ao abrir e avisa quando encontra, consultando
`https://github.com/lucasfide/excalisidian/releases/latest/download/latest.json`. Também dá
para checar na hora pelo comando "Verificar atualizações" (`Ctrl+P`) ou em
Configurações → Atualizações. O pacote de atualização é validado por assinatura minisign
antes de ser instalado.

## Assinatura de código

O Excalisidian está em processo de adoção da assinatura de código gratuita da
[SignPath Foundation](https://signpath.org) para projetos open source. Enquanto o pedido não
é aprovado, o instalador do Windows não é assinado (veja "Instalação" acima).

Quando a assinatura estiver ativa:

- Só passam pela assinatura binários construídos pelo GitHub Actions
  (`.github/workflows/release.yml`) diretamente a partir deste repositório — nunca um build
  local.
- Cada release exige aprovação manual do mantenedor antes da assinatura ser aplicada.
- Papéis do projeto: **committers and reviewers** e **approvers** são o mantenedor
  ([@lucasfide](https://github.com/lucasfide)) — hoje um projeto de uma pessoa só, sem outros
  colaboradores com acesso de escrita.
- Assinatura gratuita fornecida por SignPath.io, certificado pela SignPath Foundation.

Este programa não transmite nenhuma informação para outros sistemas em rede além do que está
descrito na seção "Privacidade" abaixo.

## Privacidade

O Excalisidian é local-first: por padrão, o único tráfego de rede que o app faz é a checagem
de atualização descrita acima (uma leitura pública de `latest.json` no GitHub, sem enviar
dados do usuário).

O app tem um agente de IA opcional, desligado por padrão (`docs/11-agente-ia.md`). Ele só faz
alguma chamada de rede depois que o usuário liga o recurso, escolhe um provedor e cola a
própria chave de API — nenhuma chamada acontece sem essa ação explícita. Quando ativo, o
agente envia trecho da nota em edição e contexto do vault (notas relacionadas recuperadas
pelo índice local) para a API do provedor escolhido:

- OpenAI (`api.openai.com`)
- Anthropic (`api.anthropic.com`)
- Google Gemini (`generativelanguage.googleapis.com`)
- OpenRouter (`openrouter.ai`)
- Alibaba DashScope (`dashscope.aliyuncs.com` / `dashscope-intl.aliyuncs.com`)
- Ollama local (`http://localhost:11434`, não sai da máquina)

A lista de destinos permitidos para o agente está fixada em `src-tauri/capabilities/main.json`
— ele não consegue chamar nenhuma outra URL. A chave de API informada pelo usuário é gravada em texto
simples em `settings.json`, na pasta de configuração do app em `%APPDATA%` (via
`@tauri-apps/plugin-store`); não é criptografada nem enviada a nenhum lugar além do provedor
escolhido nas chamadas do próprio usuário.

O app não tem telemetria, analytics nem qualquer coleta de uso. Não há fontes, scripts ou
recursos carregados de CDN em tempo de execução — as fontes do Excalidraw são copiadas para
`public/` em tempo de build (`npm install`) e servidas localmente.

## Contribuindo

Veja `CONTRIBUTING.md`.

## Licença

MIT — veja `LICENSE`. Licenças de terceiros embutidos em `THIRD_PARTY_LICENSES.md`.

## Documentação

`docs/00-LEIA-PRIMEIRO.md` é o índice. `docs/02-modelo-de-dados.md` e
`docs/06-design-system.md` são normativos. `CLAUDE.md` tem as regras do projeto.
