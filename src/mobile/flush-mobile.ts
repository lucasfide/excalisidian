export interface ResultadoFlushMobile {
  falhas: string[];
  bloqueados: string[];
  tarefasOk: boolean;
}

/** Só permite navegação quando documentos, conflitos e tarefas terminaram sem pendências. */
export function flushMobileConcluido(resultado: ResultadoFlushMobile): boolean {
  return resultado.falhas.length === 0 && resultado.bloqueados.length === 0 && resultado.tarefasOk;
}
