// Textos do domínio "conflito": `FaixaConflitos` (aviso discreto) e `ComparadorNotas`
// (as duas versões lado a lado). Fatia de `catalogo.ts` — ver o comentário de topo dele para
// as regras gerais (fonte da verdade, queda pro português, redação).

export const PT_BR_CONFLITO = {
  "conflito.faixa.um": "Uma nota foi editada em dois lugares.",
  "conflito.faixa.varias": "{contagem} notas foram editadas em dois lugares.",
  "conflito.faixa.resolver": "Resolver",
  "conflito.titulo": "Duas versões de {nome}",
  "conflito.explicacao":
    "Esta nota foi editada em dois computadores. Nada foi apagado — escolha o que manter.",
  "conflito.estaMaquina": "Nesta máquina",
  "conflito.outraMaquina": "Em {dispositivo}",
  "conflito.editadoEm": "Editado em {data}",
  "conflito.ficarComEsta": "Ficar com esta",
  "conflito.manterAmbas": "Manter as duas",
  "conflito.manterAmbasExplicacao":
    "A outra versão é salva ao lado, com o nome marcado como conflito.",
  "conflito.semDiferenca": "As duas versões têm o mesmo conteúdo.",
} as const;

// Partial, como o EN geral em catalogo.ts: uma tradução faltando não trava a edição, cai no
// português em tempo de execução (tradutor.ts). cobertura.test.ts cobra a completude.
export const EN_CONFLITO: Partial<Record<keyof typeof PT_BR_CONFLITO, string>> = {
  "conflito.faixa.um": "A note was edited in two places.",
  "conflito.faixa.varias": "{contagem} notes were edited in two places.",
  "conflito.faixa.resolver": "Resolve",
  "conflito.titulo": "Two versions of {nome}",
  "conflito.explicacao":
    "This note was edited on two computers. Nothing was deleted — choose what to keep.",
  "conflito.estaMaquina": "On this computer",
  "conflito.outraMaquina": "On {dispositivo}",
  "conflito.editadoEm": "Edited on {data}",
  "conflito.ficarComEsta": "Keep this one",
  "conflito.manterAmbas": "Keep both",
  "conflito.manterAmbasExplicacao":
    "The other version is saved alongside, with the name marked as a conflict.",
  "conflito.semDiferenca": "Both versions have the same content.",
};
