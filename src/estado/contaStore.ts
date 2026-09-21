// Estado da conta. Só o TOKEN é persistido: email e plano vêm do `renovar` na abertura,
// porque o plano muda no servidor (o usuário assina pelo site) e um valor velho em disco
// mentiria para o medidor de créditos.
//
// Toda transição espelha o token em `definirTokenDaSessao` — é de lá que `cliente.ts` puxa
// a credencial do provedor próprio. Esquecer um caminho deixa o agente com token morto.

import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";

import type { ServicoConta } from "../conta/ServicoConta";
import { ServicoContaHttp } from "../conta/ServicoContaHttp";
import { FalhaConta, type ErroConta, type PlanoAssinatura, type Sessao } from "../conta/tipos";
import { definirTokenDaSessao } from "../servico/sessao";

const CHAVE_TOKEN = "tokenConta";

async function abrirStore() {
  return load("settings.json", { autoSave: false });
}

async function gravarToken(token: string | null): Promise<void> {
  const store = await abrirStore();
  if (token) await store.set(CHAVE_TOKEN, token);
  else await store.delete(CHAVE_TOKEN);
  await store.save();
}

function codigoDe(e: unknown): ErroConta {
  return e instanceof FalhaConta ? e.codigo : "servidor";
}

interface ContaState {
  sessao: Sessao | null;
  /** true assim que `carregar()` terminou. Antes disso, "sem sessão" ainda não é conclusão. */
  carregado: boolean;
  ocupado: boolean;
  erro: ErroConta | null;
  servico: ServicoConta;
  definirServico(s: ServicoConta): void;
  plano(): PlanoAssinatura;
  carregar(): Promise<void>;
  entrar(email: string, senha: string): Promise<boolean>;
  criar(email: string, senha: string): Promise<boolean>;
  sair(): Promise<void>;
}

export const useContaStore = create<ContaState>((set, get) => ({
  sessao: null,
  carregado: false,
  ocupado: false,
  erro: null,
  servico: new ServicoContaHttp(),

  definirServico(servico) {
    set({ servico });
  },

  plano() {
    return get().sessao?.plano ?? "gratis";
  },

  async carregar() {
    const store = await abrirStore();
    const token = await store.get<string>(CHAVE_TOKEN);
    if (!token) {
      definirTokenDaSessao(null);
      set({ carregado: true });
      return;
    }
    try {
      const sessao = await get().servico.renovar(token);
      definirTokenDaSessao(sessao.token);
      await gravarToken(sessao.token);
      set({ sessao, carregado: true });
    } catch {
      // Token morto na abertura NÃO é erro de tela: o usuário não pediu nada. Limpa e
      // segue — o app inteiro funciona sem conta.
      definirTokenDaSessao(null);
      await gravarToken(null);
      set({ sessao: null, carregado: true });
    }
  },

  async entrar(email, senha) {
    set({ ocupado: true, erro: null });
    try {
      const sessao = await get().servico.entrar(email, senha);
      definirTokenDaSessao(sessao.token);
      await gravarToken(sessao.token);
      set({ sessao, ocupado: false });
      return true;
    } catch (e) {
      definirTokenDaSessao(null);
      set({ sessao: null, ocupado: false, erro: codigoDe(e) });
      return false;
    }
  },

  async criar(email, senha) {
    set({ ocupado: true, erro: null });
    try {
      const sessao = await get().servico.criar(email, senha);
      definirTokenDaSessao(sessao.token);
      await gravarToken(sessao.token);
      set({ sessao, ocupado: false });
      return true;
    } catch (e) {
      definirTokenDaSessao(null);
      set({ sessao: null, ocupado: false, erro: codigoDe(e) });
      return false;
    }
  },

  async sair() {
    const token = get().sessao?.token;
    set({ sessao: null, erro: null });
    definirTokenDaSessao(null);
    await gravarToken(null);
    if (token) await get().servico.sair(token);
  },
}));
