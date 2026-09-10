// Renormalização de `ordem` dentro de uma seção (doc 10 §2.1). O store chama isto depois de
// qualquer arrasto: recebe os ids da seção afetada na ordem visual nova e devolve id -> ordem
// em passos de 10. Mantém os valores limpos sem acoplar o formato à lógica de data.

export function renormalizarSecao(idsNaOrdem: string[]): Record<string, number> {
  const r: Record<string, number> = {};
  idsNaOrdem.forEach((id, i) => {
    r[id] = (i + 1) * 10;
  });
  return r;
}
