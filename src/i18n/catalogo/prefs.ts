// Textos do domínio "preferências": `DialogoPreferencias`. Fatia de `catalogo.ts` — ver o
// comentário de topo dele para as regras gerais (fonte da verdade, queda pro português,
// redação).

export const PT_BR_PREFS = {
  "prefs.titulo": "Configurações",
  "prefs.fechar": "Fechar",
  "prefs.aba.geral": "Geral",
  "prefs.aba.aparencia": "Aparência",
  "prefs.aba.agente": "Agente de IA",

  "prefs.geral.nome.titulo": "Seu nome",
  "prefs.geral.nome.descricao": "Aparece na saudação da tela de início.",
  "prefs.idioma.rotulo": "Idioma",
  "prefs.idioma.descricao": "Muda o idioma da interface. Suas notas não são afetadas.",
  "prefs.idioma.ptBR": "Português do Brasil",
  "prefs.idioma.en": "English",
  "prefs.geral.atalhos.titulo": "Atalhos e símbolos",
  "prefs.geral.atalhos.descricao":
    "Tudo o que dá pra fazer pelo teclado e os símbolos que formatam o texto.",
  "prefs.geral.atalhos.botao": "Abrir glossário",
  "prefs.geral.atualizacoes.titulo": "Atualizações",
  "prefs.geral.atualizacoes.descricao": "Versão {versao}",
  "prefs.geral.atualizacoes.botao": "Verificar atualizações",

  // ADR-42 (doc 09): atribuição de terceiros — o MIT exige o aviso de copyright e o texto da
  // licença junto das cópias distribuídas (o instalador já leva LICENSE e
  // THIRD_PARTY_LICENSES.md via bundle.resources); isto aqui é a versão curta, visível.
  "prefs.geral.licencas.titulo": "Licenças e créditos",
  "prefs.geral.licencas.linha1":
    "Excalisidian — MIT · Copyright (c) 2026 Lucas Fidelis de Cristo",
  "prefs.geral.licencas.linha2":
    "Diagramas: Excalidraw embutido via @excalidraw/excalidraw — MIT · Copyright (c) 2020 Excalidraw.",
  "prefs.geral.licencas.linha3":
    "Editor de notas: @atomic-editor/editor — MIT · Copyright (c) 2026 Kenny Bergquist.",
  "prefs.geral.licencas.linha4": "Tipografia: fontes sob SIL Open Font License 1.1.",
  "prefs.geral.licencas.aviso":
    "Excalidraw é marca dos seus titulares; este app não é afiliado nem endossado por ele. Textos completos das licenças em THIRD_PARTY_LICENSES.md, distribuído com o app.",

  "prefs.aparencia.tema.titulo": "Tema",
  "prefs.aparencia.tema.descricao": "Sistema acompanha o tema do computador.",
  "prefs.aparencia.tema.sistema": "Sistema",
  "prefs.aparencia.tema.claro": "Claro",
  "prefs.aparencia.tema.escuro": "Escuro",
  "prefs.aparencia.largura.titulo": "Largura da nota",
  "prefs.aparencia.largura.descricao": "Até onde o texto da nota se estende na tela.",
  "prefs.aparencia.largura.estreita": "Estreita",
  "prefs.aparencia.largura.media": "Média",
  "prefs.aparencia.largura.inteira": "Inteira",

  // Doc 11 §6.3: mesmo texto do aviso sem configuração do assistente do agente.
  "prefs.agente.aviso":
    "Opcional. Nada é enviado sem a sua configuração, e o agente só acompanha uma nota depois que você aceita o convite.",
  "prefs.agente.configurar": "Configurar agente",
  "prefs.agente.linha.agente.titulo": "Agente",
  "prefs.agente.linha.agente.descricaoAtivo": "Ativo · {provedor}",
  "prefs.agente.linha.agente.descricaoDesligado": "Desligado · {provedor}",
  "prefs.agente.linha.agente.ligar": "Ligar agente",
  "prefs.agente.linha.agente.desligar": "Desligar agente",
  "prefs.agente.linha.modelos.titulo": "Modelos",
  "prefs.agente.linha.modelos.botao": "Reconfigurar",
  "prefs.agente.linha.conexao.titulo": "Conexão",
  "prefs.agente.linha.conexao.descricao": "Confere se o provedor responde com a sua chave.",
  "prefs.agente.linha.conexao.botao": "Testar conexão",
  "prefs.agente.linha.conexao.sucesso": "Conexão funcionando.",
  "prefs.agente.linha.pasta.titulo": "Pasta do agente",
  "prefs.agente.linha.pasta.descricao": "Arquivos do agente neste computador.",
  "prefs.agente.linha.pasta.botao": "Abrir pasta",
  "prefs.agente.linha.memoria.titulo": "Memória",
  "prefs.agente.linha.memoria.descricao":
    "Resumos, fatos, participações e conversas. As notas não são afetadas.",
  "prefs.agente.linha.memoria.botao": "Limpar memória",
  // Doc 11 §7 / doc 04 §15: texto exato da confirmação destrutiva.
  "prefs.agente.memoria.confirmarTitulo": "Limpar memória",
  "prefs.agente.memoria.confirmarDescricao":
    "Apagar resumos, fatos, participações e conversas do agente? As notas não são afetadas.",
  "prefs.agente.memoria.confirmarBotao": "Apagar memória",
  "prefs.agente.memoria.toast": "Memória do agente apagada.",

  "prefs.busca.rotulo": "Buscar nas configurações",
  "prefs.busca.placeholder": "Buscar",
  "prefs.busca.resultados": "Resultados",
  "prefs.busca.vazio": "Nada encontrado para «{consulta}».",
  // Termos extras por entrada da busca — só para casar consulta, nunca aparecem na tela
  // (catalogo.test.ts cobra "nenhum texto vazio", não redação: aqui é lista de palavras).
  "prefs.busca.termos.nome": "nome saudação apelido",
  "prefs.busca.termos.idioma": "idioma língua inglês português language english",
  "prefs.busca.termos.glossario": "atalhos teclado símbolos markdown glossário",
  "prefs.busca.termos.atualizacoes": "versão atualizar update",
  "prefs.busca.termos.tema": "tema escuro claro modo noturno dark light",
  "prefs.busca.termos.largura": "largura coluna texto",
  "prefs.busca.termos.conta": "conta login entrar sair e-mail senha",
  "prefs.busca.termos.sincronizacao": "sincronização sync nuvem backup computadores vault",
  "prefs.busca.termos.licencas": "licenças créditos open source mit terceiros excalidraw",
  "prefs.busca.termos.agente": "ia inteligência artificial agente chave api provedor modelo",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_PREFS: Partial<Record<keyof typeof PT_BR_PREFS, string>> = {
  "prefs.titulo": "Settings",
  "prefs.fechar": "Close",
  "prefs.aba.geral": "General",
  "prefs.aba.aparencia": "Appearance",
  "prefs.aba.agente": "AI agent",

  "prefs.geral.nome.titulo": "Your name",
  "prefs.geral.nome.descricao": "Shown in the greeting on the home screen.",
  "prefs.idioma.rotulo": "Language",
  "prefs.idioma.descricao": "Changes the interface language. Your notes are not affected.",
  "prefs.idioma.ptBR": "Português do Brasil",
  "prefs.idioma.en": "English",
  "prefs.geral.atalhos.titulo": "Shortcuts and symbols",
  "prefs.geral.atalhos.descricao":
    "Everything you can do from the keyboard and the symbols that format text.",
  "prefs.geral.atalhos.botao": "Open glossary",
  "prefs.geral.atualizacoes.titulo": "Updates",
  "prefs.geral.atualizacoes.descricao": "Version {versao}",
  "prefs.geral.atualizacoes.botao": "Check for updates",

  "prefs.geral.licencas.titulo": "Licenses and credits",
  "prefs.geral.licencas.linha1": "Excalisidian — MIT · Copyright (c) 2026 Lucas Fidelis de Cristo",
  "prefs.geral.licencas.linha2":
    "Diagrams: Excalidraw embedded via @excalidraw/excalidraw — MIT · Copyright (c) 2020 Excalidraw.",
  "prefs.geral.licencas.linha3":
    "Note editor: @atomic-editor/editor — MIT · Copyright (c) 2026 Kenny Bergquist.",
  "prefs.geral.licencas.linha4": "Typography: fonts under the SIL Open Font License 1.1.",
  "prefs.geral.licencas.aviso":
    "Excalidraw is a trademark of its owners; this app is not affiliated with nor endorsed by them. Full license texts are in THIRD_PARTY_LICENSES.md, shipped with the app.",

  "prefs.aparencia.tema.titulo": "Theme",
  "prefs.aparencia.tema.descricao": "System follows your computer's theme.",
  "prefs.aparencia.tema.sistema": "System",
  "prefs.aparencia.tema.claro": "Light",
  "prefs.aparencia.tema.escuro": "Dark",
  "prefs.aparencia.largura.titulo": "Note width",
  "prefs.aparencia.largura.descricao": "How far the note text stretches across the screen.",
  "prefs.aparencia.largura.estreita": "Narrow",
  "prefs.aparencia.largura.media": "Medium",
  "prefs.aparencia.largura.inteira": "Full",

  "prefs.agente.aviso":
    "Optional. Nothing is sent without your configuration, and the agent only follows a note after you accept the invitation.",
  "prefs.agente.configurar": "Configure agent",
  "prefs.agente.linha.agente.titulo": "Agent",
  "prefs.agente.linha.agente.descricaoAtivo": "On · {provedor}",
  "prefs.agente.linha.agente.descricaoDesligado": "Off · {provedor}",
  "prefs.agente.linha.agente.ligar": "Turn on agent",
  "prefs.agente.linha.agente.desligar": "Turn off agent",
  "prefs.agente.linha.modelos.titulo": "Models",
  "prefs.agente.linha.modelos.botao": "Reconfigure",
  "prefs.agente.linha.conexao.titulo": "Connection",
  "prefs.agente.linha.conexao.descricao": "Checks that the provider answers with your key.",
  "prefs.agente.linha.conexao.botao": "Test connection",
  "prefs.agente.linha.conexao.sucesso": "Connection successful.",
  "prefs.agente.linha.pasta.titulo": "Agent folder",
  "prefs.agente.linha.pasta.descricao": "The agent's files on this computer.",
  "prefs.agente.linha.pasta.botao": "Open folder",
  "prefs.agente.linha.memoria.titulo": "Memory",
  "prefs.agente.linha.memoria.descricao":
    "Summaries, facts, participations and conversations. Your notes are not affected.",
  "prefs.agente.linha.memoria.botao": "Clear memory",
  "prefs.agente.memoria.confirmarTitulo": "Clear memory",
  "prefs.agente.memoria.confirmarDescricao":
    "Delete the agent's summaries, facts, participations and conversations? Your notes are not affected.",
  "prefs.agente.memoria.confirmarBotao": "Delete memory",
  "prefs.agente.memoria.toast": "Agent memory cleared.",

  "prefs.busca.rotulo": "Search settings",
  "prefs.busca.placeholder": "Search",
  "prefs.busca.resultados": "Results",
  "prefs.busca.vazio": "Nothing found for “{consulta}”.",
  "prefs.busca.termos.nome": "name greeting nickname",
  "prefs.busca.termos.idioma": "language idioma português portuguese english",
  "prefs.busca.termos.glossario": "shortcuts keyboard symbols markdown glossary",
  "prefs.busca.termos.atualizacoes": "version update upgrade",
  "prefs.busca.termos.tema": "theme dark light mode night",
  "prefs.busca.termos.largura": "width column text",
  "prefs.busca.termos.conta": "account login sign in sign out email password",
  "prefs.busca.termos.sincronizacao": "sync cloud backup computers vault",
  "prefs.busca.termos.licencas": "licenses credits open source mit third party excalidraw",
  "prefs.busca.termos.agente": "ai artificial intelligence agent key api provider model",
};
