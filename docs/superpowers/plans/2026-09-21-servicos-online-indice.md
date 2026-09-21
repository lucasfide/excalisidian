# Serviços online — índice de planos

> **Para quem executa:** este arquivo não é um plano. É a ordem em que os quatro planos
> devem ser executados e o contrato entre eles. Cada plano tem seu próprio arquivo e é
> executável de ponta a ponta sozinho.

**Spec:** relatório "Excalisidian Premium" (estudo de viabilidade de 21/09/2026) —
conceito validado, decisões fechadas e ordem de construção.

## Recorte

O relatório lista oito etapas. Cinco delas não são código deste repositório: abrir empresa,
contratar infraestrutura, escrever termos de uso, montar o servidor de conta/cobrança e o
servidor de IA. Este conjunto de planos cobre **apenas a adequação do aplicativo** para
receber esses serviços quando existirem.

A consequência de projeto é deliberada e vale para os quatro planos: **toda fronteira com
servidor é uma interface TypeScript com uma implementação falsa em memória.** A
implementação HTTP real entra depois, sem tocar em UI nem em estado. Isso mantém tudo
testável hoje, sem rede e sem conta.

## Ordem

| # | Plano | Por que nesta posição | Esforço do agente |
|---|---|---|---|
| 01 | [Fundação de i18n](2026-09-21-01-fundacao-i18n.md) | Toda UI criada nos planos 02–04 já nasce traduzível. Fazer depois significa reescrever. | medium na fundação, low nas migrações |
| 02 | [Provedor Excalisidian no agente](2026-09-21-02-provedor-excalisidian.md) | Menor superfície nova: o catálogo de provedores do `doc 11 §3` já existe e absorve o novo provedor quase inteiro. É a primeira receita do relatório. | low a medium |
| 03 | [Conta e sessão](2026-09-21-03-conta-e-sessao.md) | O plano 02 precisa de um token de sessão para autenticar. Vem depois porque o plano 02 define qual é a forma desse token. | medium |
| 04 | [Conflitos de sincronização](2026-09-21-04-conflitos-de-sync.md) | Só faz sentido com conta existindo. É o maior e o mais independente do resto. | medium |

## Contrato entre os planos

Mudar qualquer assinatura abaixo quebra um plano vizinho. Elas são fixas.

```ts
// Plano 01 produz — consumido por 02, 03 e 04
export type Idioma = "pt-BR" | "en";
export type ChaveTexto = keyof typeof PT_BR;
export function criarTradutor(idioma: Idioma): Tradutor;
export function useTexto(): Tradutor; // hook; chamar no corpo do componente

// Plano 02 produz — consumido por 03
export const BASE_URL_SERVICO: string;
export function tokenDaSessaoAtual(): string | null;
export function definirTokenDaSessao(token: string | null): void;

// Plano 03 produz — ALIMENTA o porta-token que o plano 02 criou
export type PlanoAssinatura = "gratis" | "premium";
export interface Sessao { token: string; email: string; plano: PlanoAssinatura; expiraEm: number }
export const useContaStore: /* zustand */ { getState(): { sessao: Sessao | null; plano(): PlanoAssinatura } };
```

O porta-token é do plano 02 e não do 03 porque quem precisa dele é `cliente.ts`, que roda
fora de componente React e não pode ler store por hook. O plano 03 só escreve nele a cada
login, logout e carga inicial.

## Distribuição para agentes

Um agente por tarefa, sempre partindo de contexto zero: o agente lê este índice e a tarefa
que lhe cabe, e mais nada. O esforço abaixo não é estimativa de tempo — é quanta liberdade
de decisão a tarefa exige.

**`low`** quando o plano já traz o código inteiro e a tarefa é escrever, rodar o teste e
commitar. **`medium`** quando o agente precisa ler código existente e encaixar a mudança
nele, ou quando a tarefa é de interface e não tem teste automatizado para guiar.

| Plano | Tarefa | Esforço | Por quê |
|---|---|---|---|
| 01 | 1 — tipo `Idioma` | low | Módulo novo, sem dependência, código completo no plano. |
| 01 | 2 — tradutor | low | Idem. |
| 01 | 3 — catálogo | low | Idem. |
| 01 | 4 — preferência de idioma | **medium** | Encaixa em `prefsStore.ts`, que já existe e tem padrão próprio a seguir. |
| 01 | 5 — hook e primeira migração | **medium** | Toca dois componentes e precisa entender onde a mensagem é montada. |
| 01 | 6 — seletor nas preferências | **medium** | Interface, sem teste; tem que copiar a estrutura do controle de tema. |
| 01 | 7 — guarda de cobertura | low | Um teste, sem implementação. |
| 02 | 1 — base e porta-token | low | Dois módulos novos, código completo. |
| 02 | 2 — créditos | low | Módulo puro, código completo. |
| 02 | 3 — provedor no catálogo | **medium** | Toca quatro arquivos, inclusive o capability do Tauri, e quebra `switch` exaustivo espalhado. |
| 02 | 4 — autenticação no transporte | **medium** | Mexe em `cliente.ts`, que é caminho crítico dos seis provedores existentes. |
| 02 | 5 — assistente e medidor | **medium** | Interface em arquivo de 18 KB, com condicional por provedor. |
| 03 | 1 — interface e falso | low | Módulos novos, código completo. |
| 03 | 2 — implementação HTTP | low | Idem. |
| 03 | 3 — `contaStore` | **medium** | Persistência, espelho no porta-token e ligação na abertura do app. |
| 03 | 4 — código de recuperação | low | Módulo puro, código completo. |
| 03 | 5 — seção de conta | **medium** | Interface, sem teste. |
| 04 | 1 — tipos e nome da cópia | low | Módulos novos; a armadilha do `.draw.md` já está no teste. |
| 04 | 2 — comparação linha a linha | low | Algoritmo fechado no plano. |
| 04 | 3 — resolução | low | Função pura, código completo. |
| 04 | 4 — `conflitosStore` | **medium** | Contrato com `VaultAdapter` e ordem de escrita/remoção da fila. |
| 04 | 5 — faixa e comparador de notas | **medium** | Dois componentes novos, sem teste. |
| 04 | 6 — comparador de desenhos | **medium** | Duas instâncias do Excalidraw e o caminho de cena corrompida. |
| 04 | 7 — testes mínimos da fatia | low | Rodar e reportar. |

Entre uma tarefa e a seguinte do mesmo plano, conferir o resultado antes de despachar a
próxima: as tarefas de um plano dependem umas das outras em sequência, e um erro na Task 1
se propaga silenciosamente.

## Restrições globais

Valem para os quatro planos, copiadas do `CLAUDE.md` e dos docs normativos.

- **Português do Brasil** em nomes de arquivo, componentes, variáveis e comentários.
- **Interface em sentence case, sem emoji.** Com o plano 01 no ar, todo texto novo de
  interface entra no catálogo de traduções — nunca literal no JSX.
- **Nenhum valor de cor, fonte, espaçamento, raio ou sombra fora dos tokens** de
  `src/estilos/globals.css`. Nenhuma classe de cor padrão do Tailwind (`bg-background`,
  `text-foreground`, `border-input`).
- **Toda gravação em disco passa por `escritaAtomica.ts`.** Nunca chamar `writeTextFile`.
- **Toda leitura e escrita de arquivo do vault passa por `VaultAdapter`.**
- Caminhos internos sempre com `/` e normalizados com `.normalize("NFC")`.
- `@excalidraw/excalidraw` pinado em `0.18.1`.
- Desenhos são `.draw.md`. A extensão `.excalidraw` não existe no produto.
- **Testes são de módulos puros.** O projeto não tem jsdom nem testing-library, e não há
  nenhum `.test.tsx`. Nenhum plano introduz teste de componente React: a lógica mora em
  módulos `.ts` testáveis, e o `.tsx` fica fino o bastante para ser conferido a olho.
- Teste roda com `npm test` (vitest). Arquivo de teste fica ao lado do módulo, mesmo nome
  com `.test.ts`.
- Ao terminar uma fatia, rodar os testes mínimos da seção 10 do `docs/05`.

## Verificação no app rodando

O dev server usa a porta 1420 e `strictPort`. Antes de subir outro, conferir se já há um
`npm run tauri dev` rodando — o HMR já entrega a mudança. Não tentar captura de tela
automatizada da janela.
