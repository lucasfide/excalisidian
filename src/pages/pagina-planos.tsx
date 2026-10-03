import { useState } from "react";
import { DownloadHeader, useLinkDownload } from "../components/features/landing/download-controls";
import { RodapeSite } from "../components/features/landing/rodape-site";
import { CartaoPlano } from "../components/features/landing/planos/cartao-plano";
import { PerguntasFrequentes } from "../components/features/landing/planos/perguntas-frequentes";
import { SeletorOpcoes } from "../components/features/landing/planos/seletor-opcoes";
import { TabelaComparacao } from "../components/features/landing/planos/tabela-comparacao";
import { maiorEconomiaAnual, planos } from "../data/planos";
import { formatarMoeda, moedaPorRegiao } from "../lib/precos-planos";
import type { Moeda, Periodo } from "../types/planos";
import "./landing-page.css";
import "./landing-theme.css";
import "./pagina-planos.css";

const opcoesPeriodo: { valor: Periodo; rotulo: string }[] = [
  { valor: "anual", rotulo: "Anual" },
  { valor: "mensal", rotulo: "Mensal" },
];

const opcoesMoeda: { valor: Moeda; rotulo: string }[] = [
  { valor: "BRL", rotulo: "R$" },
  { valor: "USD", rotulo: "US$" },
];

const fatos = [
  "Arquivos Markdown na sua pasta",
  "Funciona sem internet e sem conta",
  "Sincronização cifrada ponta a ponta",
  "Cancelar não apaga nada do seu computador",
];

export function PaginaPlanos() {
  const [periodo, setPeriodo] = useState<Periodo>("anual");
  const [moeda, setMoeda] = useState<Moeda>(() => moedaPorRegiao());
  const { href: hrefBaixar } = useLinkDownload("../");

  return (
    <main className="landing-page pagina-planos" id="inicio">
      <div className="landing-page__shader" aria-hidden="true" />
      <DownloadHeader paginaAtual="planos" />
      <div className="pagina-planos__conteudo">
        <section className="pagina-planos__abertura" aria-labelledby="planos-titulo">
          <p className="pagina-planos__kicker">Planos</p>
          <h1 id="planos-titulo">Comece de graça. Pague só se precisar de mais.</h1>
          <p className="pagina-planos__subtitulo">
            O app completo funciona no seu computador, sem conta e sem internet. Os planos pagos são opcionais e nunca
            bloqueiam o que você já tem.
          </p>
          <ul className="pagina-planos__fatos">
            {fatos.map(fato => (
              <li key={fato}>{fato}</li>
            ))}
          </ul>
        </section>

        <section className="pagina-planos__escolha" aria-label="Escolha do plano">
          <div className="pagina-planos__controles">
            <SeletorOpcoes nome="periodo" legenda="Cobrança" opcoes={opcoesPeriodo} valor={periodo} aoMudar={setPeriodo} />
            <SeletorOpcoes nome="moeda" legenda="Moeda" opcoes={opcoesMoeda} valor={moeda} aoMudar={setMoeda} />
            <p className="pagina-planos__economia">
              No anual, você economiza até {formatarMoeda(maiorEconomiaAnual(moeda), moeda)} por ano.
            </p>
          </div>
          <div className="pagina-planos__cartoes">
            {planos.map(plano => (
              <CartaoPlano key={plano.id} plano={plano} moeda={moeda} periodo={periodo} />
            ))}
          </div>
        </section>

        <section className="pagina-planos__secao" aria-labelledby="creditos-titulo">
          <div className="pagina-planos__cabeca">
            <span className="pagina-planos__marca" aria-hidden="true">01</span>
            <div>
              <p className="pagina-planos__kicker">Créditos de IA</p>
              <h2 id="creditos-titulo">Como funcionam os créditos.</h2>
            </div>
          </div>
          <div className="pagina-planos__texto">
            <p>
              Crédito é a medida do uso da IA do Excalisidian. Cada pedido gasta uma pequena parte do seu saldo, de
              acordo com o que o fornecedor de IA cobra de nós.
            </p>
            <p>
              No pior caso de preço, 3.000 créditos rendem cerca de 120 horas de escrita intensa com o acompanhamento
              ligado. No uso normal, rendem mais. O Sêneca tem mais de três vezes os créditos do Marco Aurélio.
            </p>
            <p>
              Os créditos renovam no dia 1º de cada mês, no horário de Brasília, e os que sobram não acumulam. Se o
              saldo acabar, só a IA do Excalisidian pausa: o app e o agente com a sua própria chave continuam.
            </p>
          </div>
        </section>

        <section className="pagina-planos__secao" aria-labelledby="comparacao-titulo">
          <div className="pagina-planos__cabeca">
            <span className="pagina-planos__marca" aria-hidden="true">02</span>
            <div>
              <p className="pagina-planos__kicker">Comparação</p>
              <h2 id="comparacao-titulo">Compare os planos.</h2>
            </div>
          </div>
          <TabelaComparacao idTitulo="comparacao-titulo" />
        </section>

        <section className="pagina-planos__secao" aria-labelledby="perguntas-titulo">
          <div className="pagina-planos__cabeca">
            <span className="pagina-planos__marca" aria-hidden="true">03</span>
            <div>
              <p className="pagina-planos__kicker">Dúvidas</p>
              <h2 id="perguntas-titulo">Perguntas frequentes.</h2>
            </div>
          </div>
          <PerguntasFrequentes />
        </section>

        <section className="pagina-planos__final" aria-labelledby="final-titulo">
          <h2 id="final-titulo">Ainda na dúvida? Comece pelo Grátis.</h2>
          <p>É o app completo, sem conta. Os planos pagos podem esperar.</p>
          <a className="pagina-planos__botao pagina-planos__botao--primario" href={hrefBaixar}>
            Baixar grátis
          </a>
        </section>
      </div>
      <RodapeSite base="../" />
    </main>
  );
}

export default PaginaPlanos;
