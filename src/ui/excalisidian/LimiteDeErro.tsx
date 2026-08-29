// Limite de erro: até esta correção o app não tinha nenhum, então um crash em QUALQUER
// componente (o canvas nunca foi testado em tela antes desta correção) derrubava a árvore
// React inteira — janela em branco, sem botão de voltar, obrigando a reiniciar o processo.
//
// React só oferece isto via componente de classe (`componentDidCatch` não existe como hook).
// Mostra o texto do erro: sem stack trace real, "consertar" um crash em produção significa
// não travar o app — a causa raiz de cada um precisa do texto que aparece aqui.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Botao } from "../index";

interface Props {
  children: ReactNode;
  /** Rótulo do botão de fechar (ex.: "Fechar aba"). Omitir esconde o botão. */
  onFechar?: () => void;
  rotuloFechar?: string;
}

interface State {
  erro: Error | null;
}

export default class LimiteDeErro extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console -- único jeito de recuperar isto sem telemetria
    console.error("[LimiteDeErro]", erro, info.componentStack);
  }

  private recarregar = () => {
    this.setState({ erro: null });
  };

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-papel px-8 text-center">
        <AlertTriangle size={24} strokeWidth={1.5} className="text-bordo" />
        <h2 className="font-display text-[19px] font-medium text-tinta">
          Algo quebrou aqui
        </h2>
        <pre className="max-w-full overflow-auto whitespace-pre-wrap rounded-controle border border-regua bg-superficie p-2 text-left font-mono text-[11px] text-tinta-media">
          {erro.message}
        </pre>
        <div className="flex gap-2">
          <Botao onClick={this.recarregar}>Tentar de novo</Botao>
          {this.props.onFechar && (
            <Botao variante="primario" onClick={this.props.onFechar}>
              {this.props.rotuloFechar ?? "Fechar aba"}
            </Botao>
          )}
        </div>
      </div>
    );
  }
}
