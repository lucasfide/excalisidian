import type {
  ContaAtualCreditos,
  EstadoCreditoApresentacao,
  EstadoCreditosConta,
  ResultadoRecuperacaoSessao,
} from "../types/creditos-conta";
import type { SaldoCreditos } from "./creditos";

export interface EntradaEstadoCreditos {
  ativo: boolean;
  carregado: boolean;
  sessao: ContaAtualCreditos["sessao"];
  servidorReal: boolean;
}

export function estadoInicialCreditosConta(entrada: EntradaEstadoCreditos): EstadoCreditoApresentacao {
  if (!entrada.ativo) return { estado: "inativo", saldo: null, identidadeSessao: null };
  if (!entrada.carregado) return { estado: "verificando", saldo: null, identidadeSessao: null };
  const sessao = entrada.sessao;
  if (!sessao) return { estado: "sem-sessao", saldo: null, identidadeSessao: null };
  if (sessao.plano !== "premium") {
    return { estado: "plano-insuficiente", saldo: null, identidadeSessao: sessao.token };
  }
  // Em DEV local não existe saldo real para consultar. A sessão premium local pode seguir sem
  // número, como uma consulta de apresentação indisponível por rede.
  if (!entrada.servidorReal) {
    return { estado: "indisponivel-rede", saldo: null, identidadeSessao: sessao.token };
  }
  return { estado: "consultando", saldo: null, identidadeSessao: sessao.token };
}

export function podeConcluirAgentePorCreditos(
  estado: EstadoCreditoApresentacao,
  contaAtual: ContaAtualCreditos,
): boolean {
  const sessao = contaAtual.sessao;
  if (!contaAtual.carregado || !sessao || sessao.plano !== "premium") return false;
  if (estado.identidadeSessao !== sessao.token) return false;
  return estado.estado === "disponivel" || estado.estado === "indisponivel-rede";
}

export interface OperacoesRecuperacaoSessao {
  sincronizarComCofre(): Promise<void>;
  atualizarPlano(): Promise<void>;
  contaAtual(): ContaAtualCreditos;
}

export async function recuperarSessaoApos401ComOperacoes(
  tokenEsperado: string,
  operacoes: OperacoesRecuperacaoSessao,
  timeoutMs = 20_000,
): Promise<ResultadoRecuperacaoSessao> {
  const estadoInicial = operacoes.contaAtual();
  if (estadoInicial.sessao?.token !== tokenEsperado) {
    return classificarRecuperacao(tokenEsperado, estadoInicial.sessao);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelada = false;
  const confirmou = await Promise.race([
    (async () => {
      try {
        await operacoes.sincronizarComCofre();
        if (cancelada) return false;
        await operacoes.atualizarPlano();
        return true;
      } catch {
        return false;
      }
    })(),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => {
        cancelada = true;
        resolve(false);
      }, timeoutMs);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);

  const sessaoAtual = operacoes.contaAtual().sessao;
  if (!confirmou) {
    return { estado: "acesso-nao-confirmado", sessao: sessaoAtual };
  }
  return classificarRecuperacao(tokenEsperado, sessaoAtual);
}

function classificarRecuperacao(tokenEsperado: string, sessao: ContaAtualCreditos["sessao"]): ResultadoRecuperacaoSessao {
  if (!sessao) return { estado: "expirada" };
  if (sessao.token !== tokenEsperado) return { estado: "token-atualizado", sessao };
  return { estado: "acesso-nao-confirmado", sessao };
}

export function resultadoConsultaCreditos(
  identidadeSessao: string,
  resultado: { ok: true; saldo: SaldoCreditos } | { ok: false; motivo: "sessao" | "plano" | "rede" },
): EstadoCreditoApresentacao {
  if (resultado.ok) return { estado: "disponivel", saldo: resultado.saldo, identidadeSessao };
  if (resultado.motivo === "plano") {
    return { estado: "plano-insuficiente", saldo: null, identidadeSessao };
  }
  if (resultado.motivo === "sessao") {
    return { estado: "acesso-nao-confirmado", saldo: null, identidadeSessao };
  }
  return { estado: "indisponivel-rede", saldo: null, identidadeSessao };
}

export function falhaRecuperacaoCreditos(
  estado: EstadoCreditosConta,
  identidadeSessao: string | null,
): EstadoCreditoApresentacao {
  return { estado, saldo: null, identidadeSessao };
}

/** Estado derivado da conta atual antes dos efeitos do React rodarem. */
export function estadoSeguroParaSessao(
  estadoSalvo: EstadoCreditoApresentacao,
  inicial: EstadoCreditoApresentacao,
  online = true,
): EstadoCreditoApresentacao {
  if (inicial.estado !== "consultando") return inicial;
  if (estadoSalvo.identidadeSessao !== inicial.identidadeSessao) return inicial;
  if (!online && (estadoSalvo.estado === "acesso-nao-confirmado" || estadoSalvo.estado === "plano-insuficiente")) {
    return estadoSalvo;
  }
  if (!online) return { estado: "indisponivel-rede", saldo: null, identidadeSessao: inicial.identidadeSessao };
  return estadoSalvo;
}

export function podeAplicarResultadoCreditos(
  ativo: boolean,
  vigente: boolean,
  online: boolean,
  contaAtual: ContaAtualCreditos,
  resultado: EstadoCreditoApresentacao,
): boolean {
  return Boolean(
    ativo &&
      vigente &&
      online &&
      contaAtual.carregado &&
      contaAtual.sessao?.plano === "premium" &&
      resultado.identidadeSessao === contaAtual.sessao.token,
  );
}
