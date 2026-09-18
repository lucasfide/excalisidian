// Mantém o mapa `customOrder` (pasta -> ordem dos filhos, doc: ordenacao-arvore design)
// consistente com criar/mover/renomear/excluir. Puro: nenhuma função aqui toca disco nem
// conhece o vaultStore — quem chama (vaultStore) decide quando persistir o resultado.

function copiar(customOrder: Record<string, string[]>): Record<string, string[]> {
  const novo: Record<string, string[]> = {};
  for (const [pasta, lista] of Object.entries(customOrder)) novo[pasta] = [...lista];
  return novo;
}

/** 6 caracteres alfanuméricos minúsculos, mesmo formato dos block ids gerados (doc 02 §5). */
export function gerarIdSeparador(): string {
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return `sep-${id}`;
}

export function inserirNoTopo(
  customOrder: Record<string, string[]>,
  pasta: string,
  nomeBase: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  novo[pasta] = [nomeBase, ...(novo[pasta] ?? [])];
  return novo;
}

export function removerItem(
  customOrder: Record<string, string[]>,
  pasta: string,
  nomeBase: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  if (novo[pasta]) novo[pasta] = novo[pasta].filter((n) => n !== nomeBase);
  return novo;
}

export function renomearItem(
  customOrder: Record<string, string[]>,
  pasta: string,
  nomeAntigo: string,
  nomeNovo: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  const lista = novo[pasta];
  if (!lista) return novo;
  const i = lista.indexOf(nomeAntigo);
  if (i !== -1) lista[i] = nomeNovo;
  return novo;
}

export function moverItem(
  customOrder: Record<string, string[]>,
  pastaOrigem: string,
  pastaDestino: string,
  nomeBase: string,
): Record<string, string[]> {
  const semOrigem = removerItem(customOrder, pastaOrigem, nomeBase);
  return inserirNoTopo(semOrigem, pastaDestino, nomeBase);
}

export function adicionarSeparador(
  customOrder: Record<string, string[]>,
): { customOrder: Record<string, string[]>; id: string } {
  const id = gerarIdSeparador();
  const novo = copiar(customOrder);
  novo[""] = [...(novo[""] ?? []), id];
  return { customOrder: novo, id };
}

export function removerSeparador(
  customOrder: Record<string, string[]>,
  id: string,
): Record<string, string[]> {
  const novo = copiar(customOrder);
  if (novo[""]) novo[""] = novo[""].filter((e) => e !== id);
  return novo;
}

export function reordenarNivel(
  customOrder: Record<string, string[]>,
  pasta: string,
  novaOrdem: string[],
): Record<string, string[]> {
  const novo = copiar(customOrder);
  novo[pasta] = [...novaOrdem];
  return novo;
}
