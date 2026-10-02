// Onde o convite do agente aparece (decisão do dono, 01/10): com o painel do agente fechado,
// como aviso discreto no canto (ConviteAgente); com ele aberto, só dentro do painel
// (PainelAgente), nunca nos dois ao mesmo tempo.

export interface CondicaoConvite {
  habilitado: boolean;
  painelAberto: boolean;
  /** Nota do convite pendente; null sem convite. */
  caminhoConvite: string | null;
  /** Chave da conversa da nota ativa (`chaveConversaAgente`). */
  caminhoConversa: string;
}

export function deveMostrarConviteEmAviso(c: CondicaoConvite): boolean {
  return (
    c.habilitado &&
    !c.painelAberto &&
    c.caminhoConvite !== null &&
    c.caminhoConvite === c.caminhoConversa
  );
}
