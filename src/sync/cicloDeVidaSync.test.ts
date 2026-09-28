// src/sync/cicloDeVidaSync.test.ts
// Testes da "casca" que liga `iniciarSincronizacaoDoVaultAberto` (`ligarAoVault.ts`) ao ciclo
// de vida do vault e da conta desta janela (plano 10 Task 5, doc 17 §5/§7): abrir/trocar/
// fechar o vault, a conta terminar de carregar, entrar/criar/renovar (sessão chega tarde), e
// sair da conta. `useVaultStore`/`useContaStore`/`useSyncStore` entram como pub-subs falsos
// (mesmo padrão de zustand `subscribe`) — `ligarAoVault.ts` inteiro é mockado: este arquivo só
// testa QUANDO ele é chamado e QUANDO `syncStore.parar()` é chamado, não o que
// `iniciarSincronizacaoDoVaultAberto` faz por dentro (isso é `ligarAoVault.test.ts`).

import { describe, it, expect, beforeEach, vi } from "vitest";

type Ouvinte<T> = (estado: T, anterior: T) => void;

function criarStoreFalso<T extends object>(inicial: T) {
  let estado = inicial;
  const ouvintes: Ouvinte<T>[] = [];
  return {
    getState: () => estado,
    subscribe: (ouvinte: Ouvinte<T>) => {
      ouvintes.push(ouvinte);
      return () => {
        const i = ouvintes.indexOf(ouvinte);
        if (i >= 0) ouvintes.splice(i, 1);
      };
    },
    setState: (parcial: Partial<T>) => {
      const anterior = estado;
      estado = { ...estado, ...parcial };
      for (const ouvinte of [...ouvintes]) ouvinte(estado, anterior);
    },
  };
}

// `vi.mock` é hoisted para o topo do arquivo — as fábricas só podem referenciar variáveis
// declaradas via `vi.hoisted` (também hoisted, antes dos mocks). Sem isso, `vaultStoreFalso`
// etc. seriam `undefined` no momento em que a fábrica roda.
const {
  vaultStoreFalso,
  contaStoreFalso,
  pararMock,
  iniciarMock,
  pararSegundoPlanoMock,
  iniciarSegundoPlanoRealMock,
} = vi.hoisted(() => {
  return {
    vaultStoreFalso: criarStoreFalso<{ adapter: unknown }>({ adapter: null }),
    contaStoreFalso: criarStoreFalso<{ carregado: boolean; sessao: unknown }>({
      carregado: false,
      sessao: null,
    }),
    pararMock: vi.fn(),
    iniciarMock: vi.fn(async () => {}),
    pararSegundoPlanoMock: vi.fn(),
    iniciarSegundoPlanoRealMock: vi.fn(),
  };
});

vi.mock("../estado/vaultStore", () => ({
  useVaultStore: vaultStoreFalso,
}));
vi.mock("../estado/contaStore", () => ({
  useContaStore: contaStoreFalso,
}));
vi.mock("../estado/syncStore", () => ({
  useSyncStore: { getState: () => ({ parar: pararMock }) },
}));
vi.mock("./ligarAoVault", () => ({
  iniciarSincronizacaoDoVaultAberto: () => iniciarMock(),
}));
// Segundo plano (plano 12 Task 5): mockado inteiro — este arquivo só testa QUE
// `instalarCicloDeVidaSync` instala e pára o segundo plano nos momentos certos, não o que ele
// faz por dentro (isso é `segundoPlano.test.ts`). `iniciarSegundoPlanoReal` é chamado sem
// argumentos; devolve a função "parar" que os testes espionam.
iniciarSegundoPlanoRealMock.mockImplementation(() => pararSegundoPlanoMock);
vi.mock("./segundoPlano", () => ({
  iniciarSegundoPlanoReal: () => iniciarSegundoPlanoRealMock(),
}));

import { instalarCicloDeVidaSync } from "./cicloDeVidaSync";

async function drenar(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("instalarCicloDeVidaSync", () => {
  beforeEach(() => {
    vaultStoreFalso.setState({ adapter: null });
    contaStoreFalso.setState({ carregado: false, sessao: null });
    pararMock.mockClear();
    iniciarMock.mockClear();
    pararSegundoPlanoMock.mockClear();
    iniciarSegundoPlanoRealMock.mockClear();
  });

  it("instala o segundo plano ao iniciar", () => {
    const cancelar = instalarCicloDeVidaSync();

    expect(iniciarSegundoPlanoRealMock).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it("vault abre nesta janela: para qualquer sincronização anterior e tenta ligar a nova", async () => {
    const cancelar = instalarCicloDeVidaSync();
    pararMock.mockClear();
    iniciarMock.mockClear();

    vaultStoreFalso.setState({ adapter: { raiz: () => "C:/v1" } });
    await drenar();

    expect(pararMock).toHaveBeenCalledTimes(1);
    expect(iniciarMock).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it("vault fecha (adapter volta a null): para a sincronização e NÃO tenta ligar de novo sem vault", async () => {
    vaultStoreFalso.setState({ adapter: { raiz: () => "C:/v1" } });
    const cancelar = instalarCicloDeVidaSync();
    pararMock.mockClear();
    iniciarMock.mockClear();

    vaultStoreFalso.setState({ adapter: null });
    await drenar();

    expect(pararMock).toHaveBeenCalledTimes(1);
    // Chama `iniciarSincronizacaoDoVaultAberto` de novo mesmo sem vault: é responsabilidade
    // dela decidir que não há nada a fazer (decidirLigar → "sem-vault"), sem duplicar aqui a
    // mesma checagem.
    expect(iniciarMock).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it("troca de vault (um adapter por outro): para o antigo e tenta ligar o novo", async () => {
    vaultStoreFalso.setState({ adapter: { raiz: () => "C:/v1" } });
    const cancelar = instalarCicloDeVidaSync();
    pararMock.mockClear();
    iniciarMock.mockClear();

    vaultStoreFalso.setState({ adapter: { raiz: () => "C:/v2" } });
    await drenar();

    expect(pararMock).toHaveBeenCalledTimes(1);
    expect(iniciarMock).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it("conta termina de carregar: tenta ligar (sessão pode ter chegado, ou não)", async () => {
    const cancelar = instalarCicloDeVidaSync();
    iniciarMock.mockClear();

    contaStoreFalso.setState({ carregado: true });
    await drenar();

    expect(iniciarMock).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it("entrar na conta depois (sessão chega tarde): tenta ligar de novo", async () => {
    contaStoreFalso.setState({ carregado: true });
    const cancelar = instalarCicloDeVidaSync();
    iniciarMock.mockClear();

    contaStoreFalso.setState({ sessao: { plano: "premium" } });
    await drenar();

    expect(iniciarMock).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it("sair da conta (sessão existia e sumiu): para a sincronização", async () => {
    contaStoreFalso.setState({ carregado: true, sessao: { plano: "premium" } });
    const cancelar = instalarCicloDeVidaSync();
    pararMock.mockClear();
    iniciarMock.mockClear();

    contaStoreFalso.setState({ sessao: null });
    await drenar();

    expect(pararMock).toHaveBeenCalledTimes(1);
    // Sair não tenta ligar de novo — não há mais sessão premium pra ligar nada.
    expect(iniciarMock).not.toHaveBeenCalled();
    // Sair da conta também pára o segundo plano (plano 12 Task 5).
    expect(pararSegundoPlanoMock).toHaveBeenCalledTimes(1);
    cancelar();
  });

  it("cancelar() desliga as duas assinaturas e o segundo plano: mudanças depois disso não chamam mais nada", async () => {
    const cancelar = instalarCicloDeVidaSync();
    pararMock.mockClear();
    iniciarMock.mockClear();
    pararSegundoPlanoMock.mockClear();
    cancelar();

    vaultStoreFalso.setState({ adapter: { raiz: () => "C:/v1" } });
    contaStoreFalso.setState({ carregado: true });
    await drenar();

    expect(pararMock).not.toHaveBeenCalled();
    expect(iniciarMock).not.toHaveBeenCalled();
    expect(pararSegundoPlanoMock).toHaveBeenCalledTimes(1);
  });

  it("instalar com o vault já aberto tenta ligar imediatamente (instalação tardia, defensivo)", () => {
    vaultStoreFalso.setState({ adapter: { raiz: () => "C:/v1" } });
    iniciarMock.mockClear();

    const cancelar = instalarCicloDeVidaSync();

    expect(iniciarMock).toHaveBeenCalledTimes(1);
    cancelar();
  });
});
