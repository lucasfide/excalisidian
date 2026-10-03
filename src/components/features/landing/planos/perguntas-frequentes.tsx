import type { ReactNode } from "react";
import { empresa, ehMarcador } from "../../../../data/empresa";

interface Pergunta {
  id: string;
  pergunta: string;
  resposta: ReactNode;
}

function Contato() {
  const email = empresa.emailContato;
  return ehMarcador(email) ? <>{email}</> : <a href={`mailto:${email}`}>{email}</a>;
}

// Respostas só afirmam o que está decidido (contexto de planos, 03/10/2026). Moeda cobrada,
// impostos e meios de pagamento dependem do intermediário, que ainda não foi escolhido.
const perguntas: Pergunta[] = [
  {
    id: "credito",
    pergunta: "O que é um crédito?",
    resposta: (
      <p>
        Crédito é a medida que usamos para o uso da IA do Excalisidian. Um crédito equivale a US$ 0,001 do custo real
        cobrado pelo fornecedor de IA. Em uma medição de 28/09/2026, um pedido típico consumiu cerca de 0,3 crédito.
        Na estimativa mais pessimista, 3.000 créditos rendem cerca de 120 horas de escrita intensa com o
        acompanhamento ligado; no uso normal, rendem mais. Os créditos renovam no dia 1º de cada mês, no horário de
        Brasília.
      </p>
    ),
  },
  {
    id: "acabar",
    pergunta: "O que acontece se os créditos acabarem?",
    resposta: (
      <p>
        A IA do Excalisidian pausa até o dia 1º, quando o saldo renova. Os créditos que sobram no fim do mês não
        acumulam para o mês seguinte, e por enquanto não há compra de créditos extras. O aplicativo continua
        funcionando por inteiro, e o agente de IA com a sua própria chave também. Você não perde nada do que
        escreveu.
      </p>
    ),
  },
  {
    id: "cancelar",
    pergunta: "Posso cancelar quando quiser?",
    resposta: (
      <>
        <p>
          Sim, a qualquer momento. O acesso pago continua até o fim do período que você já pagou, e nada é apagado do
          seu computador: suas notas, diagramas e tarefas continuam onde sempre estiveram.
        </p>
        <p>
          Quando a assinatura termina, seja por cancelamento, falta de pagamento ou reembolso, a sincronização para.
          A cópia cifrada que ficou na nuvem pode ser apagada depois de 90 dias. Se você voltar antes disso, a
          sincronização continua de onde parou.
        </p>
      </>
    ),
  },
  {
    id: "reembolso",
    pergunta: "Como funciona o reembolso?",
    resposta: (
      <p>
        Se você pedir em até 14 dias da primeira cobrança de uma assinatura, devolvemos o valor integral, em qualquer
        país. Para pedir, escreva para <Contato />.
      </p>
    ),
  },
  {
    id: "seguranca",
    pergunta: "A sincronização é segura?",
    resposta: (
      <>
        <p>
          A sincronização é cifrada ponta a ponta: o servidor guarda o conteúdo já embaralhado e não consegue ler as
          suas notas, os nomes dos arquivos nem saber quantas notas existem. Se a mesma nota for editada em dois
          computadores, o Excalisidian nunca mistura as versões sozinho: ele mostra uma tela para você escolher.
        </p>
        <p>
          A IA do Excalisidian é separada: o texto das notas passa pelo nosso servidor a caminho do fornecedor de IA e
          não é guardado nem registrado. Detalhes na <a href="../privacidade/">política de privacidade</a>.
        </p>
      </>
    ),
  },
  {
    id: "conta",
    pergunta: "Preciso de conta para usar o aplicativo?",
    resposta: (
      <p>
        Não. O aplicativo completo, com notas, diagramas, tarefas, busca, vários vaults e temas, funciona sem conta e
        sem internet. Você só precisa de conta se quiser a sincronização ou a IA do Excalisidian. Quem preferir pode
        usar o agente de IA com a própria chave, também sem conta.
      </p>
    ),
  },
  {
    id: "moeda",
    pergunta: "Em que moeda vou pagar?",
    resposta: (
      <p>
        Os preços desta página são em reais (R$) para o Brasil e em dólares (US$) para o resto do mundo. A moeda da
        cobrança, os impostos e os meios de pagamento dependem do intermediário de pagamento, que ainda não foi
        escolhido. Esses detalhes serão informados aqui antes de a assinatura abrir.
      </p>
    ),
  },
];

export function PerguntasFrequentes() {
  return (
    <div className="pagina-planos__perguntas">
      {perguntas.map(item => (
        <details className="pagina-planos__pergunta" key={item.id}>
          <summary>{item.pergunta}</summary>
          <div className="pagina-planos__resposta">{item.resposta}</div>
        </details>
      ))}
    </div>
  );
}
