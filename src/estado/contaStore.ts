// Estado da conta. Só o TOKEN é persistido: email e plano vêm do `renovar` na abertura,
// porque o plano muda no servidor (o usuário assina pelo site) e um valor velho em disco
// mentiria para o medidor de créditos.
//
// Toda transição espelha o token em `definirTokenDaSessao` — é de lá que `cliente.ts` puxa
// a credencial do provedor próprio. Esquecer um caminho deixa o agente com token morto.

import { create } from "zustand";
import { load } from "@tauri-apps/plugin-store";
import { emit } from "@tauri-apps/api/event";

import type { ServicoConta } from "../conta/ServicoConta";
import { ServicoContaHttp } from "../conta/ServicoContaHttp";
import type { CofreToken } from "../conta/cofreToken";
import { CofreTokenSistema } from "../conta/cofreToken";
import { lerTokenComMigracao, type TokenLegado } from "../conta/migracaoToken";
import { FalhaConta, type ErroConta, type PlanoAssinatura, type Sessao } from "../conta/tipos";
import { definirTokenDaSessao } from "../servico/sessao";

// Legado, só para migração (ADR-34): antes do cofre do sistema, o token morava em texto puro
// nesta chave do settings.json. `carregar()` lê essa chave uma vez, migra para o cofre e apaga
// — ver `lerTokenComMigracao`. Nenhum código novo grava aqui.
const CHAVE_TOKEN_LEGADO = "tokenConta";
// Doc 12 §6 / doc 04 §5.1: mesmo evento que prefsStore.ts e agenteStore.ts emitem depois de
// gravar uma mudança compartilhada no settings.json (literal repetido nos três arquivos — ver
// comentário em flushEntreJanelas.ts sobre por que não virou uma constante importada). Só as
// ações que o usuário decide (entrar/criar/sair) emitem; `carregar()` é a metade "recebe" do
// contrato, igual ao `carregar()` dos outros dois stores, e nunca emite de volta.
const EVENTO_PREFS_MUDOU = "app://prefs-mudou";

async function abrirStore() {
  return load("settings.json", { autoSave: false });
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
  cofre: CofreToken;
  definirCofre(c: CofreToken): void;
  plano(): PlanoAssinatura;
  carregar(): Promise<void>;
  entrar(email: string, senha: string): Promise<boolean>;
  criar(email: string, senha: string): Promise<boolean>;
  sair(): Promise<void>;
}

export const useContaStore = create<ContaState>((set, get) => {
  // Contador monotônico. `carregar()` não bloqueia a abertura e pode levar o tempo de uma
  // ida à rede (o `renovar`); nesse meio-tempo o usuário pode ter decidido algo mais recente
  // (entrar, criar ou sair) que já mudou a sessão. Cada uma dessas decisões incrementa;
  // `carregar()` guarda o valor de quando começou e, antes de aplicar o que descobriu,
  // confere se ele ainda é o mesmo — se não for, alguém mais recente já decidiu e o
  // resultado do `carregar()` é descartado em silêncio, sem tocar em estado, disco ou
  // porta-token. Sem isso: (a) um `entrar` bem-sucedido podia ser sobrescrito pelo `renovar`
  // do token velho quando ele finalmente resolvesse, e (b) pior, um `renovar` que falhasse
  // (token velho morto) deslogava em silêncio quem tinha acabado de entrar.
  let geracao = 0;

  // Decisão 2 do plano (ADR-34): gravar/apagar no cofre nunca rejeita para quem chama. Se o
  // cofre falhar (loja ausente, permissão negada, token maior que o limite do Windows), a
  // sessão desta abertura continua valendo em memória — só um aviso técnico no console, nunca
  // um erro de login para o usuário.
  async function gravarToken(token: string | null): Promise<void> {
    try {
      if (token) await get().cofre.gravar(token);
      else await get().cofre.apagar();
    } catch (e) {
      console.warn("Não foi possível gravar o token da conta no cofre do sistema.", e);
    }
  }

  return {
    sessao: null,
    carregado: false,
    ocupado: false,
    erro: null,
    servico: new ServicoContaHttp(),
    cofre: new CofreTokenSistema(),

    definirServico(servico) {
      set({ servico });
    },

    definirCofre(cofre) {
      set({ cofre });
    },

    plano() {
      return get().sessao?.plano ?? "gratis";
    },

    async carregar() {
      const minhaGeracao = geracao;
      const legadoStore = await abrirStore();
      const legado: TokenLegado = {
        ler: async () => (await legadoStore.get<string>(CHAVE_TOKEN_LEGADO)) ?? null,
        apagar: async () => {
          await legadoStore.delete(CHAVE_TOKEN_LEGADO);
          await legadoStore.save();
        },
      };
      const token = await lerTokenComMigracao(get().cofre, legado);
      if (!token) {
        if (geracao !== minhaGeracao) return;
        definirTokenDaSessao(null);
        set({ carregado: true });
        return;
      }
      try {
        const sessao = await get().servico.renovar(token);
        if (geracao !== minhaGeracao) return;
        definirTokenDaSessao(sessao.token);
        await gravarToken(sessao.token);
        set({ sessao, carregado: true });
      } catch (e) {
        if (geracao !== minhaGeracao) return;
        // Só o servidor dizendo "essa sessão não vale mais" pode apagar o cofre. `rede` (não
        // deu pra falar com o servidor — app offline, rotina num local-first) e `servidor`
        // (erro inesperado, ou o token rotativo já foi consumido por OUTRA janela — `renovar`
        // é de uso único e todas as janelas leem o mesmo token do cofre compartilhado) não são
        // prova de que a sessão morreu. Apagar nesses casos desloga em silêncio quem só abriu
        // o app sem internet, ou builda uma corrida entre janelas onde a mais lenta apaga o
        // token que a mais rápida acabou de renovar.
        if (codigoDe(e) === "expirada") {
          definirTokenDaSessao(null);
          await gravarToken(null);
        }
        // Silêncio mantido nos dois casos: o usuário não pediu nada, só abriu o app. `sessao`
        // fica null nesta execução (indefinida até a próxima tentativa), sem tocar em `erro`.
        set({ sessao: null, carregado: true });
      }
    },

    async entrar(email, senha) {
      set({ ocupado: true, erro: null });
      try {
        const sessao = await get().servico.entrar(email, senha);
        geracao++;
        definirTokenDaSessao(sessao.token);
        await gravarToken(sessao.token);
        set({ sessao, ocupado: false });
        await emit(EVENTO_PREFS_MUDOU);
        return true;
      } catch (e) {
        // Falha ao entrar preserva a sessão anterior (se havia uma): só `erro` muda. Sem
        // isso, alguém já logado que errasse a senha tentando trocar de conta perdia a
        // sessão válida que tinha, e o `sair` nunca seria chamado no servidor pra aquele
        // token, que ficava pendurado.
        set({ ocupado: false, erro: codigoDe(e) });
        return false;
      }
    },

    async criar(email, senha) {
      set({ ocupado: true, erro: null });
      try {
        const sessao = await get().servico.criar(email, senha);
        geracao++;
        definirTokenDaSessao(sessao.token);
        await gravarToken(sessao.token);
        set({ sessao, ocupado: false });
        await emit(EVENTO_PREFS_MUDOU);
        return true;
      } catch (e) {
        set({ ocupado: false, erro: codigoDe(e) });
        return false;
      }
    },

    async sair() {
      set({ ocupado: true, erro: null });
      try {
        geracao++;
        const token = get().sessao?.token;
        set({ sessao: null });
        definirTokenDaSessao(null);
        await gravarToken(null);
        await emit(EVENTO_PREFS_MUDOU);
        // Melhor-esforço: `sair` do serviço nunca propaga erro (ver ServicoContaHttp), mas o
        // `finally` abaixo desmarca `ocupado` mesmo que uma implementação futura lance.
        if (token) await get().servico.sair(token);
      } finally {
        set({ ocupado: false });
      }
    },
  };
});
