// src/sync/ligarAoVault.test.ts
// Testes da "casca" que liga o `syncStore` ao vault aberto nesta janela (plano 10 Task 5).
// `vaultStore`/`conflitosStore`/`documentosStore`/`syncStore` entram como dublês (mesmo
// padrão de `syncStore.test.ts` mockando `vaultStore`) — só `contaStore` é o de verdade (já
// testável sem Tauri, como `contaStore.test.ts` prova), porque os testes precisam de
// `carregado`/`plano()`/`cofreChaveDeEnvelope` de verdade sem duplicar aquela lógica aqui.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const vaultStoreState = { adapter: null as unknown, raiz: "C:/vault-teste" };
vi.mock("../estado/vaultStore", () => ({
  useVaultStore: { getState: () => vaultStoreState },
}));

const syncStoreMock = {
  iniciar: vi.fn(async (_raiz: string, _deps: DepsSyncStore) => {}),
  iniciarPendente: vi.fn((_raiz: string) => {}),
  parar: vi.fn(),
};
vi.mock("../estado/syncStore", () => ({
  useSyncStore: { getState: () => syncStoreMock },
  assinarMudancasNoIndiceReal: vi.fn(() => () => {}),
}));

const conflitosStoreMock = { registrar: vi.fn(), conflitos: [] as { caminho: string }[] };
vi.mock("../estado/conflitosStore", () => ({
  useConflitosStore: { getState: () => conflitosStoreMock },
}));

const documentosStoreMock = { flushTudo: vi.fn(async () => ({})) };
vi.mock("../estado/documentosStore", () => ({
  useDocumentosStore: { getState: () => documentosStoreMock },
}));

const carregarEstadoSyncMock = vi.fn<(raiz: string) => Promise<unknown>>();
const lerNomeDoComputadorMock = vi.fn(async () => "Notebook do Lucas (este computador)");
vi.mock("./estadoSync", () => ({
  carregarEstadoSync: (raiz: string) => carregarEstadoSyncMock(raiz),
  lerNomeDoComputador: () => lerNomeDoComputadorMock(),
}));

const listarVaultsMock = vi.fn<() => Promise<unknown[]>>();
const servicoFake = { listarVaults: listarVaultsMock };
vi.mock("./servicoSyncAtual", () => ({
  servicoSyncAtual: () => servicoFake,
}));

const abrirEnvelopeMock = vi.fn<(...args: unknown[]) => Promise<Uint8Array>>();
vi.mock("./pacote", () => ({
  abrirEnvelope: (...args: unknown[]) => abrirEnvelopeMock(...args),
}));

import { iniciarSincronizacaoDoVaultAberto } from "./ligarAoVault";
import type { DepsSyncStore } from "../estado/syncStore";
import { useContaStore } from "../estado/contaStore";
import { CofreChaveDeEnvelopeFake } from "../conta/CofreChaveDeEnvelopeFake";
import { FalhaSync } from "./tiposServidor";
import type { Sessao } from "../conta/tipos";

const ADAPTER_FAKE = { raiz: () => "C:/vault-teste" } as never;
const ESTADO_SALVO = { idDoVault: "vault-1", cursor: 3, bases: {}, hashesConhecidos: {}, conflitosPendentes: {} };
const SESSAO_PREMIUM: Sessao = {
  token: "tok",
  email: "lucas@teste.com",
  plano: "premium",
  expiraEm: Date.now() + 1000 * 60 * 60,
};

function resetarConta(): void {
  const cofre = new CofreChaveDeEnvelopeFake();
  useContaStore.setState({
    sessao: null,
    carregado: false,
    cofreChaveDeEnvelope: cofre,
  });
}

describe("iniciarSincronizacaoDoVaultAberto", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vaultStoreState.adapter = null;
    vaultStoreState.raiz = "C:/vault-teste";
    syncStoreMock.iniciar.mockClear();
    syncStoreMock.iniciarPendente.mockClear();
    syncStoreMock.parar.mockClear();
    carregarEstadoSyncMock.mockReset();
    lerNomeDoComputadorMock.mockClear();
    listarVaultsMock.mockReset();
    abrirEnvelopeMock.mockReset();
    resetarConta();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("sem vault aberto: não faz nada", async () => {
    vaultStoreState.adapter = null;
    await iniciarSincronizacaoDoVaultAberto();
    expect(carregarEstadoSyncMock).not.toHaveBeenCalled();
    expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
  });

  it("vault aberto sem EstadoSync (nunca sincronizado neste computador): não faz nada", async () => {
    vaultStoreState.adapter = ADAPTER_FAKE;
    carregarEstadoSyncMock.mockResolvedValue(null);
    await iniciarSincronizacaoDoVaultAberto();
    expect(listarVaultsMock).not.toHaveBeenCalled();
    expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
  });

  it("conta ainda carregando: não conclui nada, não lê o cofre nem lista vaults", async () => {
    vaultStoreState.adapter = ADAPTER_FAKE;
    carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
    useContaStore.setState({ carregado: false });
    await iniciarSincronizacaoDoVaultAberto();
    expect(listarVaultsMock).not.toHaveBeenCalled();
    expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
  });

  it("conta grátis (carregada): não faz nada", async () => {
    vaultStoreState.adapter = ADAPTER_FAKE;
    carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
    useContaStore.setState({
      carregado: true,
      sessao: { token: "t", email: "a@a.com", plano: "gratis", expiraEm: Date.now() + 1000 },
    });
    await iniciarSincronizacaoDoVaultAberto();
    expect(listarVaultsMock).not.toHaveBeenCalled();
    expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
  });

  it("premium, mas este computador ainda não tem a chaveDeEnvelope: não faz nada", async () => {
    vaultStoreState.adapter = ADAPTER_FAKE;
    carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
    useContaStore.setState({ carregado: true, sessao: SESSAO_PREMIUM });
    // cofreChaveDeEnvelope fica vazio (padrão do CofreChaveDeEnvelopeFake).
    await iniciarSincronizacaoDoVaultAberto();
    expect(listarVaultsMock).not.toHaveBeenCalled();
    expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
  });

  it("tudo pronto: lista os vaults, abre o envelope certo e chama syncStore.iniciar com os deps", async () => {
    vaultStoreState.adapter = ADAPTER_FAKE;
    carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
    useContaStore.setState({ carregado: true, sessao: SESSAO_PREMIUM });
    const chave = new Uint8Array([1, 2, 3]);
    await useContaStore.getState().cofreChaveDeEnvelope.gravar(chave);
    const envelope = new Uint8Array([9, 9]);
    listarVaultsMock.mockResolvedValue([
      { id: "vault-1", nomeCifrado: new Uint8Array(), envelope },
      { id: "outro", nomeCifrado: new Uint8Array(), envelope: new Uint8Array() },
    ]);
    const chaveDoVault = new Uint8Array(32);
    abrirEnvelopeMock.mockResolvedValue(chaveDoVault);

    await iniciarSincronizacaoDoVaultAberto();

    expect(abrirEnvelopeMock).toHaveBeenCalledWith(chave, envelope, "vault-1");
    expect(syncStoreMock.iniciar).toHaveBeenCalledTimes(1);
    const [raizChamada, deps] = syncStoreMock.iniciar.mock.calls[0];
    expect(raizChamada).toBe("C:/vault-teste");
    expect(deps.chaveDoVault).toBe(chaveDoVault);
    expect(deps.adaptador).toBe(ADAPTER_FAKE);
    expect(deps.nomeDesteComputador).toBe("Notebook do Lucas (este computador)");
    expect(syncStoreMock.iniciarPendente).not.toHaveBeenCalled();
  });

  it("vault do EstadoSync não está mais na lista do servidor (apagado): não faz nada", async () => {
    vaultStoreState.adapter = ADAPTER_FAKE;
    carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
    useContaStore.setState({ carregado: true, sessao: SESSAO_PREMIUM });
    await useContaStore.getState().cofreChaveDeEnvelope.gravar(new Uint8Array([1]));
    listarVaultsMock.mockResolvedValue([]);

    await iniciarSincronizacaoDoVaultAberto();

    expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
  });

  describe("(a) listarVaults lança rede", () => {
    beforeEach(async () => {
      vaultStoreState.adapter = ADAPTER_FAKE;
      carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
      useContaStore.setState({ carregado: true, sessao: SESSAO_PREMIUM });
      await useContaStore.getState().cofreChaveDeEnvelope.gravar(new Uint8Array([1]));
    });

    it("marca sem-conexao (iniciarPendente) e não deixa o erro escapar", async () => {
      listarVaultsMock.mockRejectedValue(new FalhaSync("rede"));
      await expect(iniciarSincronizacaoDoVaultAberto()).resolves.toBeUndefined();
      expect(syncStoreMock.iniciarPendente).toHaveBeenCalledWith("C:/vault-teste");
      expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
    });

    it("tenta de novo sozinho 60s depois, até conseguir ligar", async () => {
      listarVaultsMock.mockRejectedValueOnce(new FalhaSync("rede"));
      const envelope = new Uint8Array([9]);
      listarVaultsMock.mockResolvedValueOnce([
        { id: "vault-1", nomeCifrado: new Uint8Array(), envelope },
      ]);
      abrirEnvelopeMock.mockResolvedValue(new Uint8Array(32));

      await iniciarSincronizacaoDoVaultAberto();
      expect(listarVaultsMock).toHaveBeenCalledTimes(1);
      expect(syncStoreMock.iniciarPendente).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(listarVaultsMock).toHaveBeenCalledTimes(2);
      expect(syncStoreMock.iniciar).toHaveBeenCalledTimes(1);
    });

    it("uma nova tentativa manual cancela o retry de 60s agendado (sem chamada dobrada)", async () => {
      listarVaultsMock.mockRejectedValue(new FalhaSync("rede"));
      await iniciarSincronizacaoDoVaultAberto();
      expect(listarVaultsMock).toHaveBeenCalledTimes(1);

      // Chamada manual nova (ex.: a seção chamou de novo) — cancela o timer antigo.
      await iniciarSincronizacaoDoVaultAberto();
      expect(listarVaultsMock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_000);
      // Só mais UMA (a do retry desta 2ª chamada), não duas.
      expect(listarVaultsMock).toHaveBeenCalledTimes(3);
    });
  });

  it("(a) outros códigos de listarVaults (ex.: servidor) não agendam retry nem marcam iniciarPendente", async () => {
    vaultStoreState.adapter = ADAPTER_FAKE;
    carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
    useContaStore.setState({ carregado: true, sessao: SESSAO_PREMIUM });
    await useContaStore.getState().cofreChaveDeEnvelope.gravar(new Uint8Array([1]));
    listarVaultsMock.mockRejectedValue(new FalhaSync("servidor"));

    await iniciarSincronizacaoDoVaultAberto();
    expect(syncStoreMock.iniciarPendente).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(listarVaultsMock).toHaveBeenCalledTimes(1); // nenhum retry sozinho
  });

  describe("(b) abrirEnvelope lança (senha mudou em outro computador)", () => {
    it("apaga a chaveDeEnvelope do cofre deste computador e não chama syncStore.iniciar", async () => {
      vaultStoreState.adapter = ADAPTER_FAKE;
      carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
      useContaStore.setState({ carregado: true, sessao: SESSAO_PREMIUM });
      const cofre = useContaStore.getState().cofreChaveDeEnvelope;
      await cofre.gravar(new Uint8Array([1]));
      listarVaultsMock.mockResolvedValue([
        { id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array([9]) },
      ]);
      abrirEnvelopeMock.mockRejectedValue(new Error("pacote inválido"));

      await expect(iniciarSincronizacaoDoVaultAberto()).resolves.toBeUndefined();

      expect(await cofre.ler()).toBeNull();
      expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
    });
  });

  describe("(c) nenhuma rejeição escapa", () => {
    it("um erro inesperado em qualquer passo vira no-op silencioso, sem rejeitar", async () => {
      vaultStoreState.adapter = ADAPTER_FAKE;
      carregarEstadoSyncMock.mockRejectedValue(new Error("disco explodiu"));
      await expect(iniciarSincronizacaoDoVaultAberto()).resolves.toBeUndefined();
    });

    it("lerNomeDoComputador explodindo depois de tudo certo também não escapa", async () => {
      vaultStoreState.adapter = ADAPTER_FAKE;
      carregarEstadoSyncMock.mockResolvedValue(ESTADO_SALVO);
      useContaStore.setState({ carregado: true, sessao: SESSAO_PREMIUM });
      await useContaStore.getState().cofreChaveDeEnvelope.gravar(new Uint8Array([1]));
      listarVaultsMock.mockResolvedValue([
        { id: "vault-1", nomeCifrado: new Uint8Array(), envelope: new Uint8Array([9]) },
      ]);
      abrirEnvelopeMock.mockResolvedValue(new Uint8Array(32));
      lerNomeDoComputadorMock.mockRejectedValue(new Error("settings.json sumiu"));

      await expect(iniciarSincronizacaoDoVaultAberto()).resolves.toBeUndefined();
      expect(syncStoreMock.iniciar).not.toHaveBeenCalled();
    });
  });
});
