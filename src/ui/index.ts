// Componentes base do design system (doc 06). Nenhuma tela escreve classe de cor, raio ou
// sombra à mão: tudo passa por aqui, para que uma mudança no doc 06 seja uma mudança num
// arquivo só.

export { cn } from "./cn";

export { default as Botao } from "./Botao";
export type { VarianteBotao, TamanhoBotao } from "./Botao";

export { default as BotaoIcone } from "./BotaoIcone";
export type { TamanhoBotaoIcone } from "./BotaoIcone";

export { default as Superficie } from "./Superficie";
export { default as EstadoVazio } from "./EstadoVazio";

export { default as Select } from "./Select";
export type { OpcaoSelect } from "./Select";

export { default as Campo } from "./Campo";
export { default as Dialog } from "./Dialog";

export { Menu, ItemMenu, SeparadorMenu } from "./Menu";
export type { PosicaoMenu } from "./Menu";

export { default as GrupoBotoes } from "./GrupoBotoes";
export type { OpcaoGrupo } from "./GrupoBotoes";

export { default as IconeArquivo } from "./IconeArquivo";
