export interface OpcoesAbrirDocumentoMobile {
  revelar?: string;
  aoLado?: boolean;
}

/** Navegação de documentos sem dependência do Dockview. */
export interface NavegacaoMobile {
  abrirDocumento(path: string, opcoes?: OpcoesAbrirDocumentoMobile): void;
  abrirComoTexto(path: string): void;
  abrirInicio(): void;
  renomearDocumento(antigo: string, novo: string): void;
  fecharAbasDoCaminho(path: string): void;
}
