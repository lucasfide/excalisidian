import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useContaStore } from "../estado/contaStore";
import { consultarCreditos, type ResultadoCreditos } from "../servico/saldoCreditos";
import { decidirModoServidor } from "../servico/modoServidor";
import {
  estadoInicialCreditosConta,
  falhaRecuperacaoCreditos,
  podeConcluirAgentePorCreditos,
  podeAplicarResultadoCreditos,
  recuperarSessaoApos401ComOperacoes,
  resultadoConsultaCreditos,
  estadoSeguroParaSessao,
} from "../servico/estado-creditos-conta";
import type {
  ContaAtualCreditos,
  EstadoCreditoApresentacao,
  EstadoSaldoCreditosConta,
  ResultadoRecuperacaoSessao,
} from "../types/creditos-conta";

const TIMEOUT_APRESENTACAO_MS = 20_000;
const consultasEmAndamento = new Map<string, Promise<ResultadoCreditos>>();

export interface ResultadoHookSaldoCreditosConta extends EstadoSaldoCreditosConta {
  tentarNovamente(): void;
}

function comTimeout<T>(operacao: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    operacao,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function consultarUmaVez(token: string, geracaoRede: number): Promise<ResultadoCreditos> {
  const chave = `${geracaoRede}:${token}`;
  const atual = consultasEmAndamento.get(chave);
  if (atual) return atual;
  const consulta = comTimeout(consultarCreditos(token), TIMEOUT_APRESENTACAO_MS).then(
    (resultado): ResultadoCreditos => resultado ?? { ok: false, motivo: "rede" },
  );
  consultasEmAndamento.set(chave, consulta);
  void consulta.finally(() => {
    if (consultasEmAndamento.get(chave) === consulta) consultasEmAndamento.delete(chave);
  });
  return consulta;
}

function contaAtual(): ContaAtualCreditos {
  const estado = useContaStore.getState();
  return { carregado: estado.carregado, sessao: estado.sessao };
}

/** Revalida uma recusa 401 sem renovar, deslogar ou apagar o cofre. */
export async function recuperarSessaoApos401(tokenEsperado: string): Promise<ResultadoRecuperacaoSessao> {
  return recuperarSessaoApos401ComOperacoes(
    tokenEsperado,
    {
      sincronizarComCofre: () => useContaStore.getState().sincronizarComCofre(),
      atualizarPlano: () => useContaStore.getState().atualizarPlano(),
      contaAtual,
    },
    TIMEOUT_APRESENTACAO_MS,
  );
}

async function consultarComRecuperacao(
  token: string,
  geracaoRede: number,
  aoReceber401: () => void,
): Promise<EstadoCreditoApresentacao> {
  const primeira = await consultarUmaVez(token, geracaoRede);
  if (!primeira.ok && primeira.motivo === "sessao") {
    aoReceber401();
    const recuperacao = await recuperarSessaoApos401(token);
    if (recuperacao.estado === "expirada") {
      return falhaRecuperacaoCreditos("sem-sessao", null);
    }
    if (recuperacao.estado === "acesso-nao-confirmado") {
      return falhaRecuperacaoCreditos("acesso-nao-confirmado", token);
    }
    const atual = contaAtual();
    if (!atual.carregado || !atual.sessao || atual.sessao.token !== recuperacao.sessao.token) {
      return falhaRecuperacaoCreditos("acesso-nao-confirmado", token);
    }
    if (atual.sessao.plano !== "premium") {
      return falhaRecuperacaoCreditos("plano-insuficiente", atual.sessao.token);
    }
    const segunda = await consultarUmaVez(atual.sessao.token, geracaoRede);
    if (!segunda.ok && segunda.motivo === "sessao") {
      return falhaRecuperacaoCreditos("acesso-nao-confirmado", atual.sessao.token);
    }
    return resultadoConsultaCreditos(atual.sessao.token, segunda);
  }
  return resultadoConsultaCreditos(token, primeira);
}

/** Consulta o saldo para apresentação independente de configuração ou ativação do agente. */
export function useSaldoCreditosConta(ativo: boolean): ResultadoHookSaldoCreditosConta {
  const carregado = useContaStore((estado) => estado.carregado);
  const sessao = useContaStore((estado) => estado.sessao);
  const [estadoSalvo, setEstadoSalvo] = useState<EstadoCreditoApresentacao>({
    estado: "inativo",
    saldo: null,
    identidadeSessao: null,
  });
  const [tentativa, setTentativa] = useState(0);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const onlineRef = useRef(online);
  const geracaoRedeRef = useRef(0);
  const servidorReal =
    decidirModoServidor({ dev: import.meta.env.DEV, variavelServidor: import.meta.env.VITE_SERVIDOR }) === "real";
  const inicial = useMemo(
    () => estadoInicialCreditosConta({ ativo, carregado, sessao, servidorReal }),
    [ativo, carregado, sessao, servidorReal],
  );
  const identidade = inicial.identidadeSessao;

  useEffect(() => {
    const aoFicarOffline = () => {
      geracaoRedeRef.current += 1;
      onlineRef.current = false;
      setOnline(false);
    };
    const aoFicarOnline = () => {
      onlineRef.current = true;
      setOnline(true);
    };
    window.addEventListener("offline", aoFicarOffline);
    window.addEventListener("online", aoFicarOnline);
    return () => {
      window.removeEventListener("offline", aoFicarOffline);
      window.removeEventListener("online", aoFicarOnline);
    };
  }, []);

  useEffect(() => {
    if (inicial.estado !== "consultando" || !identidade) {
      setEstadoSalvo(inicial);
      return;
    }
    if (!online) {
      setEstadoSalvo((salvo) => estadoSeguroParaSessao(salvo, inicial, false));
      return;
    }
    let vigente = true;
    setEstadoSalvo(inicial);
    const marcarRecusaPendente = () => {
      if (contaAtual().sessao?.token !== identidade) return;
      setEstadoSalvo(falhaRecuperacaoCreditos("acesso-nao-confirmado", identidade));
    };
    void consultarComRecuperacao(identidade, geracaoRedeRef.current, marcarRecusaPendente).then((resultado) => {
      const atual = contaAtual();
      if (!podeAplicarResultadoCreditos(ativo, vigente, onlineRef.current, atual, resultado)) return;
      setEstadoSalvo(resultado);
    });
    return () => {
      vigente = false;
    };
  }, [inicial, identidade, tentativa, online]);

  const estadoVisivel = estadoSeguroParaSessao(estadoSalvo, inicial, online);
  const tentarNovamente = useCallback(() => {
    setEstadoSalvo({ estado: "consultando", saldo: null, identidadeSessao: identidade });
    setTentativa((valor) => valor + 1);
  }, [identidade]);

  return { ...estadoVisivel, tentarNovamente };
}

export { podeConcluirAgentePorCreditos };
