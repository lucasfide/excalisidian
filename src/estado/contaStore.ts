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
import {
  ServicoContaFakeDev,
  EMAIL_CONTA_TESTE_DEV,
  SENHA_CONTA_TESTE_DEV,
} from "../conta/ServicoContaFakeDev";
import type { CofreToken } from "../conta/cofreToken";
import { CofreTokenSistema } from "../conta/cofreToken";
import type { CofreChaveDeEnvelope } from "../conta/cofreChaveDeEnvelope";
import { CofreChaveDeEnvelopeSistema } from "../conta/cofreChaveDeEnvelope";
import { lerTokenComMigracao, type TokenLegado } from "../conta/migracaoToken";
import { FalhaConta, type ErroConta, type PlanoAssinatura, type Sessao } from "../conta/tipos";
import { definirTokenDaSessao } from "../servico/sessao";
import { decidirModoServidor } from "../servico/modoServidor";

// Legado, só para migração (ADR-34): antes do cofre do sistema, o token morava em texto puro
// nesta chave do settings.json. `carregar()` lê essa chave uma vez, migra para o cofre e apaga
// — ver `lerTokenComMigracao`. Nenhum código novo grava aqui.
const CHAVE_TOKEN_LEGADO = "tokenConta";
// Doc 12 §6 / doc 04 §5.1: mesmo evento que prefsStore.ts e agenteStore.ts emitem depois de
// gravar uma mudança compartilhada no settings.json (literal repetido nos três arquivos — ver
// comentário em flushEntreJanelas.ts sobre por que não virou uma constante importada). Só as
// ações que o usuário decide (entrar/criar/sair) emitem; `carregar()` também emite, mas só depois de um `renovar`
// bem-sucedido (o token rotacionou e as outras janelas precisam adotar o novo). Não há laço: quem
// recebe o evento chama `sincronizarComCofre()`, que nunca renova e nunca emite.
const EVENTO_PREFS_MUDOU = "app://prefs-mudou";

// Renovação automática (Review Focus 4): a sessão vale 30 dias e o `renovar` da abertura só
// roda ao reiniciar o app. Com o app aberto o tempo todo, um timer confere a cada 6 h e renova
// quando faltam menos de 7 dias.
const INTERVALO_RENOVACAO_MS = 6 * 60 * 60 * 1000;
const RENOVAR_QUANDO_FALTAR_MENOS_DE_MS = 7 * 24 * 60 * 60 * 1000;

async function abrirStore() {
  return load("settings.json", { autoSave: false });
}

function codigoDe(e: unknown): ErroConta {
  return e instanceof FalhaConta ? e.codigo : "servidor";
}

/** Em desenvolvimento (`npm run tauri dev`), a conta de teste premium fixa (doc 17 §10,
 * doc 18 §5) — dá para entrar sem servidor de conta, inclusive testar a sincronização
 * entre duas janelas (ver ServicoContaFakeDev sobre o token determinístico). Em produção, o
 * servidor de verdade. Em DEV, `VITE_SERVIDOR=real` troca para o servidor de verdade também
 * (`decidirModoServidor`). Mesmo mecanismo de eliminação de `simularConflito.ts`/
 * `PaletaComandos.tsx`: `import.meta.env.DEV` vira uma constante literal no build e o ramo
 * `ServicoContaFakeDev` — junto com o e-mail e a senha de teste — some do bundle de produção
 * (confira com grep em dist/ depois de `npm run build`). Por isso `import.meta.env.DEV`
 * continua literal aqui, e `decidirModoServidor` só entra como condição extra dentro do mesmo
 * ramo — nunca no lugar dele.
 */
function servicoContaPadrao(): ServicoConta {
  const local =
    import.meta.env.DEV &&
    decidirModoServidor({ dev: import.meta.env.DEV, variavelServidor: import.meta.env.VITE_SERVIDOR }) ===
      "local";
  return local
    ? new ServicoContaFakeDev({
        [EMAIL_CONTA_TESTE_DEV]: { senha: SENHA_CONTA_TESTE_DEV, plano: "premium" },
      })
    : new ServicoContaHttp();
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
  /** Chave de envelope da sincronização deste computador (doc 17 §2). O `contaStore` só
   * precisa dela para apagá-la ao sair — quem grava é o fluxo de ligar a sincronização
   * (plano 10). Injetado do mesmo jeito que `cofre` (`definirCofre`), para os testes usarem
   * um fake em vez do cofre de verdade. */
  cofreChaveDeEnvelope: CofreChaveDeEnvelope;
  definirCofreChaveDeEnvelope(c: CofreChaveDeEnvelope): void;
  plano(): PlanoAssinatura;
  carregar(): Promise<void>;
  /** Adota o token que está no cofre SEM trocá-lo (`consultar`, não `renovar`). É o que as
   * janelas fazem ao receber `app://prefs-mudou`: `carregar()` renovaria e invalidaria o token
   * das outras janelas e de qualquer pedido do agente em andamento. */
  sincronizarComCofre(): Promise<void>;
  /** Reconsulta o plano da sessão atual (`consultar`, sem renovar). O plano muda no servidor
   * quando o usuário assina pelo site; chamado ao abrir o passo Conta do assistente e a seção
   * Conta das preferências. Nunca rejeita. */
  atualizarPlano(): Promise<void>;
  entrar(email: string, senha: string): Promise<boolean>;
  criar(email: string, senha: string): Promise<boolean>;
  sair(): Promise<void>;
  /** Atalho (plano 12 Task 2): `cofreChaveDeEnvelope.ler(sessao.email)` — `null` sem sessão.
   * É o único jeito correto de ler a chave; leitores diretos do cofre não sabem qual e-mail
   * conferir. */
  chaveDeEnvelopeAtual(): Promise<Uint8Array | null>;
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
  // Marca que esta janela tem uma sessão que o cofre nunca recebeu (a gravação falhou). Sem
  // ela, o evento de outra janela leria o cofre vazio e concluiria "alguém saiu", derrubando
  // uma sessão que a decisão 2 mandou manter em memória.
  let sessaoSoEmMemoria = false;

  async function gravarToken(token: string | null): Promise<void> {
    try {
      if (token) await get().cofre.gravar(token);
      else await get().cofre.apagar();
      sessaoSoEmMemoria = false;
    } catch (e) {
      if (token) sessaoSoEmMemoria = true;
      console.warn("Não foi possível gravar o token da conta no cofre do sistema.", e);
    }
  }

  // Mesma postura de `gravarToken`: quem sai não deixa a chave das notas para trás (doc 17
  // §2), mas uma falha no cofre não pode travar o `sair` — o usuário já está deslogado do
  // lado da conta de qualquer jeito.
  async function apagarChaveDeEnvelope(): Promise<void> {
    try {
      await get().cofreChaveDeEnvelope.apagar();
    } catch (e) {
      console.warn(
        "Não foi possível apagar a chave de envelope da sincronização deste computador.",
        e,
      );
    }
  }

  // Mesma postura "nunca rejeita" de `gravarToken`: a chave nasce junto da sessão (ADR-39
  // "Mudança de 27/09/2026"), mas uma falha ao gravá-la no cofre não pode derrubar um login
  // que já foi bem-sucedido no servidor — só um aviso técnico; a seção Sincronização volta a
  // pedir a senha na próxima vez que precisar da chave.
  async function gravarChaveDeEnvelope(email: string, chave: Uint8Array): Promise<void> {
    try {
      await get().cofreChaveDeEnvelope.gravar(email, chave);
    } catch (e) {
      console.warn(
        "Não foi possível gravar a chave de envelope da sincronização no cofre do sistema.",
        e,
      );
    }
  }

  // Um só timer por janela. É do módulo (não do estado) e só nasce com uma sessão adotada.
  let timerRenovacao: ReturnType<typeof setInterval> | null = null;
  // Trava de reentrada: um tique e uma adoção logo depois de entrar não renovam ao mesmo tempo
  // (o servidor toleraria, mas emitiria o evento duas vezes).
  // Guarda a geração em que começou: um sair/entrar no meio invalida a trava, para que uma
  // renovação que nunca volta (rede pendurada) não bloqueie a sessão seguinte.
  let renovandoNaGeracao: number | null = null;
  // Guarda contra tempestade: se o servidor devolve uma sessão ainda a menos de 7 dias de vencer,
  // as conferências seguintes não renovam de novo antes de um intervalo do timer (0 = nunca).
  let ultimaRenovacaoEm = 0;

  function pararTimerRenovacao(): void {
    if (timerRenovacao !== null) clearInterval(timerRenovacao);
    timerRenovacao = null;
  }

  // Rotina de renovar compartilhada por `carregar()` (modo "abertura") e pelo timer (modo
  // "timer"). Sucesso: espelha no porta-token, grava no cofre, guarda a sessão e emite
  // `app://prefs-mudou` para as outras janelas adotarem. Sempre respeita `geracao`.
  //  - "abertura": qualquer falha deixa a sessão null (comportamento histórico do carregar).
  //  - "timer": há uma sessão em uso; só `expirada` a derruba. `rede`/`servidor` mantêm tudo e o
  //    próximo tique tenta de novo.
  async function renovarEAplicar(
    token: string,
    minhaGeracao: number,
    modo: "abertura" | "timer",
  ): Promise<void> {
    const tokenAntes = get().sessao?.token ?? null;
    // No timer, se outra janela adotou/gravou nesse meio-tempo (o token em memória mudou), o
    // resultado é velho. Na abertura não havia essa guarda e continua sem.
    const velho = () => modo === "timer" && (get().sessao?.token ?? null) !== tokenAntes;
    try {
      const sessao = await get().servico.renovar(token);
      if (geracao !== minhaGeracao || velho()) return;
      definirTokenDaSessao(sessao.token);
      await gravarToken(sessao.token);
      if (geracao !== minhaGeracao) {
        // sair/entrar rodou durante a gravação no cofre: o que gravamos pode ter sobrescrito a
        // decisão mais recente. Reconcilia o cofre e o porta-token com a sessão de agora.
        const atual = get().sessao;
        definirTokenDaSessao(atual?.token ?? null);
        await gravarToken(atual?.token ?? null);
        return;
      }
      ultimaRenovacaoEm = Date.now();
      set({ sessao, carregado: true });
      // Fora do tratamento de erro do renovar: uma falha do emit não desloga ninguém.
      void emit(EVENTO_PREFS_MUDOU).catch(() => {});
    } catch (e) {
      if (geracao !== minhaGeracao || velho()) return;
      // Só o servidor dizendo "essa sessão não vale mais" pode apagar o cofre. `rede` (não
      // deu pra falar com o servidor — app offline, rotina num local-first) e `servidor`
      // (erro inesperado, ou o token rotativo já foi consumido por OUTRA janela — `renovar`
      // é de uso único e todas as janelas leem o mesmo token do cofre compartilhado) não são
      // prova de que a sessão morreu. Apagar nesses casos desloga em silêncio quem só abriu
      // o app sem internet, ou builda uma corrida entre janelas onde a mais lenta apaga o
      // token que a mais rápida acabou de renovar.
      if (codigoDe(e) === "expirada") {
        if (modo === "timer") {
          // O timer pode disputar com outra janela que renovou depois da nossa leitura: se o
          // cofre já tem outro token, o nosso é o que foi consumido — adota o do cofre em vez
          // de apagá-lo.
          let doCofre: string | null = null;
          try {
            doCofre = await get().cofre.ler();
          } catch {
            /* cofre indisponível: segue como expirada */
          }
          if (geracao !== minhaGeracao || velho()) return;
          if (doCofre && doCofre !== token) {
            await get().sincronizarComCofre();
            return;
          }
        }
        pararTimerRenovacao();
        definirTokenDaSessao(null);
        await gravarToken(null);
        set({ sessao: null, carregado: true });
        return;
      }
      // Silêncio mantido nos dois casos: o usuário não pediu nada, só abriu o app. `sessao`
      // fica null nesta execução (indefinida até a próxima tentativa), sem tocar em `erro`.
      if (modo === "abertura") set({ sessao: null, carregado: true });
    }
  }

  async function verificarRenovacao(): Promise<void> {
    const sessao = get().sessao;
    if (!sessao) {
      pararTimerRenovacao();
      return;
    }
    if (sessao.expiraEm - Date.now() >= RENOVAR_QUANDO_FALTAR_MENOS_DE_MS) return;
    const desdeUltima = Date.now() - ultimaRenovacaoEm;
    if (desdeUltima >= 0 && desdeUltima < INTERVALO_RENOVACAO_MS) return;
    if (renovandoNaGeracao === geracao) return;
    const minhaGeracao = geracao;
    renovandoNaGeracao = minhaGeracao;
    try {
      const token = sessao.token;
      // Sessão só em memória: o cofre não tem este token e nada prova que ele é mais novo.
      if (!sessaoSoEmMemoria) {
        let doCofre: string | null;
        try {
          doCofre = await get().cofre.ler();
        } catch {
          doCofre = token; // cofre indisponível: não prova nada, renova o que temos
        }
        if (geracao !== minhaGeracao || get().sessao?.token !== token) return;
        if (doCofre !== token) {
          // Outra janela renovou (ou saiu) primeiro: adota o que ela gravou em vez de gastar um
          // token velho — fora da janela de 120 s do servidor ele daria 401 e derrubaria a sessão.
          await get().sincronizarComCofre();
          return;
        }
      }
      await renovarEAplicar(token, minhaGeracao, "timer");
    } finally {
      if (renovandoNaGeracao === minhaGeracao) renovandoNaGeracao = null;
    }
  }

  // Chamado sempre que esta janela passa a ter uma sessão nova (carregar/entrar/criar/adoção):
  // liga o timer se ainda não houver (nunca duplica) e confere já se falta pouco para vencer.
  function sessaoAdotada(): void {
    if (timerRenovacao === null) {
      timerRenovacao = setInterval(() => void verificarRenovacao(), INTERVALO_RENOVACAO_MS);
    }
    void verificarRenovacao();
  }

  return {
    sessao: null,
    carregado: false,
    ocupado: false,
    erro: null,
    servico: servicoContaPadrao(),
    cofre: new CofreTokenSistema(),
    cofreChaveDeEnvelope: new CofreChaveDeEnvelopeSistema(),

    definirServico(servico) {
      set({ servico });
    },

    definirCofre(cofre) {
      set({ cofre });
    },

    definirCofreChaveDeEnvelope(cofreChaveDeEnvelope) {
      set({ cofreChaveDeEnvelope });
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
        pararTimerRenovacao();
        set({ carregado: true });
        return;
      }
      await renovarEAplicar(token, minhaGeracao, "abertura");
      if (get().sessao) sessaoAdotada();
    },

    async sincronizarComCofre() {
      const minhaGeracao = geracao;
      // `carregar()` (renovar em andamento nesta mesma janela) não mexe em `geracao`, mas
      // troca `sessao`: se o token da sessão mudou enquanto eu consultava, o que eu descobri
      // já é velho (consultar(T0) depois de o renovar rotacionar T0 daria 401 e deslogaria).
      const tokenAntes = get().sessao?.token ?? null;
      let token: string | null;
      try {
        token = await get().cofre.ler();
      } catch {
        return; // cofre indisponível: não prova nada, mantém o estado
      }
      if (geracao !== minhaGeracao) return;
      if (!token) {
        // A gravação desta sessão no cofre falhou: cofre vazio não prova que outra janela saiu.
        if (sessaoSoEmMemoria && get().sessao) return;
        // Outra janela saiu (ou nunca houve sessão): esta também fica sem sessão.
        definirTokenDaSessao(null);
        pararTimerRenovacao();
        set({ sessao: null, carregado: true });
        return;
      }
      if (token === get().sessao?.token) return;
      try {
        const dados = await get().servico.consultar(token);
        if (geracao !== minhaGeracao || (get().sessao?.token ?? null) !== tokenAntes) return;
        definirTokenDaSessao(token);
        // O token adotado vem do cofre: a sessão passa a ter respaldo lá.
        sessaoSoEmMemoria = false;
        set({ sessao: { ...dados, token }, carregado: true });
        sessaoAdotada();
      } catch (e) {
        if (geracao !== minhaGeracao || (get().sessao?.token ?? null) !== tokenAntes) return;
        // Só "expirada" zera a sessão, e sem apagar o cofre: outra janela pode ter gravado um
        // token novo nesse meio-tempo. `rede`/`servidor` mantêm o que já há.
        if (codigoDe(e) === "expirada") {
          definirTokenDaSessao(null);
          pararTimerRenovacao();
          set({ sessao: null });
        }
      }
    },

    async atualizarPlano() {
      const minhaGeracao = geracao;
      const sessao = get().sessao;
      if (!sessao) return;
      const tokenAntes = sessao.token;
      try {
        const dados = await get().servico.consultar(tokenAntes);
        if (geracao !== minhaGeracao || get().sessao?.token !== tokenAntes) return;
        // Sem mudança real, mantém o mesmo objeto: quem assina a `sessao` (o agente) não deve
        // ver abrir as preferências como troca de sessão.
        if (
          dados.email === sessao.email &&
          dados.plano === sessao.plano &&
          dados.expiraEm === sessao.expiraEm
        ) {
          return;
        }
        set({ sessao: { ...dados, token: tokenAntes } });
      } catch (e) {
        if (geracao !== minhaGeracao || get().sessao?.token !== tokenAntes) return;
        // Mesmo tratamento de `sincronizarComCofre`: só "expirada" zera, sem apagar o cofre.
        if (codigoDe(e) === "expirada") {
          definirTokenDaSessao(null);
          pararTimerRenovacao();
          set({ sessao: null });
        }
      }
    },

    async entrar(email, senha) {
      set({ ocupado: true, erro: null });
      try {
        const { sessao, chaveDeEnvelope } = await get().servico.entrar(email, senha);
        geracao++;
        definirTokenDaSessao(sessao.token);
        await gravarToken(sessao.token);
        await gravarChaveDeEnvelope(sessao.email, chaveDeEnvelope);
        set({ sessao, ocupado: false });
        await emit(EVENTO_PREFS_MUDOU);
        ultimaRenovacaoEm = 0;
        sessaoAdotada();
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
        const { sessao, chaveDeEnvelope } = await get().servico.criar(email, senha);
        geracao++;
        definirTokenDaSessao(sessao.token);
        await gravarToken(sessao.token);
        await gravarChaveDeEnvelope(sessao.email, chaveDeEnvelope);
        set({ sessao, ocupado: false });
        await emit(EVENTO_PREFS_MUDOU);
        ultimaRenovacaoEm = 0;
        sessaoAdotada();
        return true;
      } catch (e) {
        set({ ocupado: false, erro: codigoDe(e) });
        return false;
      }
    },

    async chaveDeEnvelopeAtual() {
      const sessao = get().sessao;
      if (!sessao) return null;
      // Cofre indisponível (ex.: Linux sem chaveiro) vale como "sem chave neste computador":
      // quem chama já trata `null`, e uma rejeição deixaria a seção Sincronização travada
      // (ADR-34: falha do cofre nunca vira erro para o usuário).
      try {
        return await get().cofreChaveDeEnvelope.ler(sessao.email);
      } catch (e) {
        console.warn("Não foi possível ler a chave de envelope da sincronização no cofre do sistema.", e);
        return null;
      }
    },

    async sair() {
      set({ ocupado: true, erro: null });
      try {
        geracao++;
        const token = get().sessao?.token;
        sessaoSoEmMemoria = false;
        set({ sessao: null });
        ultimaRenovacaoEm = 0;
        pararTimerRenovacao();
        definirTokenDaSessao(null);
        await gravarToken(null);
        await apagarChaveDeEnvelope();
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
