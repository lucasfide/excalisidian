import { planos } from "../../../data/planos";
import { descreverPreco, formatarCreditos } from "../../../lib/precos-planos";
import type { Moeda } from "../../../types/planos";
import "./faixa-planos.css";

const idsDaFaixa = ["marco-aurelio", "seneca"] as const;

interface FaixaPlanosProps {
  moeda: Moeda;
}

/** Os dois planos pagos da home e o Grátis numa linha. Todo número vem de data/planos.ts. */
export function FaixaPlanos({ moeda }: FaixaPlanosProps) {
  const blocos = idsDaFaixa.map(id => planos.find(plano => plano.id === id)).filter(plano => plano !== undefined);
  const gratis = planos.find(plano => plano.id === "gratis");

  return (
    <div className="faixa-planos">
      <ul className="faixa-planos__blocos">
        {blocos.map(plano => {
          const preco = descreverPreco(plano.precos[moeda], moeda, "anual");
          return (
            <li className="faixa-planos__bloco" data-recomendado={plano.recomendado} key={plano.id}>
              <div className="faixa-planos__nome">
                <span>{plano.nome}</span>
                {plano.recomendado && <span className="faixa-planos__etiqueta">Recomendado</span>}
              </div>
              <div className="faixa-planos__preco">
                <span className="faixa-planos__valor">{preco.valor}</span>
                <span className="faixa-planos__por-mes">por mês</span>
              </div>
              <div className="faixa-planos__cobranca">cobrado {preco.totalAnual} por ano</div>
              <div className="faixa-planos__creditos">
                {plano.creditosPorMes !== null && `${formatarCreditos(plano.creditosPorMes)} créditos de IA por mês`}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="faixa-planos__rodape">
        <div className="faixa-planos__gratis">
          <strong>{gratis?.nome}:</strong> o app completo, sem conta e sem internet. Os planos pagos acrescentam
          sincronização e IA.
        </div>
        <a className="landing-page__cta" href="planos/">
          Conhecer os planos
        </a>
      </div>
    </div>
  );
}
