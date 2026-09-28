// servidor/src/admin.ts
// Ponto de entrada de `excalisidian-admin` (Task 6, doc 18 §4; `vaults`/`apagar-vault` vieram
// depois, no plano "sincronização mais simples", Task 1; `superior`/`uso` vieram com a IA no
// servidor, doc 18 §5): sete comandos, lendo a mesma
// config (`carregarConfig`) e o mesmo banco (`abrirBanco`) que o servidor usa — na VPS aponta
// para `/var/lib/excalisidian` via `EXCALISIDIAN_DADOS`, exatamente como `excalisidian-api`.
//
// `premium <email>`, `superior <email>` e `gratis <email>` trocam `contas.plano` e a faixa de IA
// (`contas.faixa_ia`); `uso <email>` mostra o mês da IA (créditos, pedidos, tokens, custo em
// US$); `contas` lista e-mail, plano, faixa e bytes usados por conta (a mesma soma de `bytesUsadosPelaConta`, a cota do doc 18 §3);
// `vaults <email>` lista os vaults da conta (id, bytes, lotes, última atividade — NUNCA o
// nome, que é cifrado e o servidor não consegue abrir); `apagar-vault <email> <id>` confere
// que o vault é da conta antes de apagar metadados e arquivos, reusando `ArmazenamentoSqlite`
// (o mesmo caminho que `DELETE /v1/sync/vaults/:id` usa). Nunca imprime prova, hash, sal ou
// token — só o que já é operação legítima.
//
// `principal.ts` é o ponto de entrada do servidor HTTP; este arquivo é o ponto de entrada do
// bundle separado `dist/admin.js` (ver scripts/empacotar.mjs) — os dois importam `banco.ts`/
// `config.ts`, nunca um ao outro.

import { normalizarEmail } from "../../src/conta/derivacaoSenha";
import { abrirBanco, type BancoSqlite } from "./banco";
import { ArmazenamentoSqlite, bytesUsadosPelaConta } from "./armazenamentoSync";
import { carregarConfig } from "./config";
import { COTA_POR_FAIXA, periodoDe, saldoDaConta, type FaixaIa } from "./creditosIa";

interface LinhaConta {
  id: number;
  email: string;
  plano: string;
  faixa?: string;
}

/** Devolve a linha da conta pelo e-mail normalizado, ou `undefined` se não existe. Exportado
 * só para os testes montarem os cenários sem duplicar a normalização. */
export function buscarContaPorEmail(banco: BancoSqlite, email: string): LinhaConta | undefined {
  const emailNormalizado = normalizarEmail(email);
  return banco.prepare(`select id, email, plano from contas where email = ?`).get(emailNormalizado) as
    | LinhaConta
    | undefined;
}

/** `premium`/`superior`/`gratis <email>`: define o plano e a faixa de IA (doc 18 §4, §5.2).
 * `superior` é premium com faixa `superior` (10.000 créditos); premium e grátis ficam na
 * faixa `padrao`. E-mail inexistente é erro (não cria conta). */
export function definirPlano(
  banco: BancoSqlite,
  email: string,
  plano: "premium" | "gratis",
  faixa: FaixaIa = "padrao",
): LinhaConta {
  const conta = buscarContaPorEmail(banco, email);
  if (!conta) {
    throw new Error(`e-mail nao encontrado: ${normalizarEmail(email)}`);
  }
  banco.prepare(`update contas set plano = ?, faixa_ia = ? where id = ?`).run(plano, faixa, conta.id);
  return { ...conta, plano };
}

export interface LinhaContaComUso {
  email: string;
  plano: string;
  faixa: string;
  bytesUsados: number;
}

/** `contas`: todas as contas, com o espaço usado (soma de lotes + partes de retrato, a mesma
 * cota do doc 18 §3), ordenadas por e-mail — saída estável para conferir de olho. */
export function listarContas(banco: BancoSqlite): LinhaContaComUso[] {
  const linhas = banco.prepare(`select id, email, plano, faixa_ia as faixa from contas order by email`).all() as LinhaConta[];
  return linhas.map((linha) => ({
    email: linha.email,
    plano: linha.plano,
    faixa: linha.faixa ?? "padrao",
    bytesUsados: bytesUsadosPelaConta(banco, linha.id),
  }));
}

function formatarTabelaContas(linhas: LinhaContaComUso[]): string {
  if (linhas.length === 0) return "nenhuma conta.";
  return linhas
    .map((linha) => `${linha.email}\t${linha.plano}\t${linha.faixa}\t${linha.bytesUsados} bytes`)
    .join("\n");
}

export interface UsoDaConta {
  periodo: string;
  usados: number;
  total: number;
  pedidos: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoUsd: number;
}

/** `uso <email>`: o mês corrente (Brasília) da conta — créditos, pedidos, tokens e o custo
 * real em US$ (para conferir a conta do ADR-43 com uso de verdade). Nunca texto. */
export function usoDaConta(banco: BancoSqlite, email: string, agoraMs: number): UsoDaConta {
  const conta = buscarContaPorEmail(banco, email);
  if (!conta) {
    throw new Error(`e-mail nao encontrado: ${normalizarEmail(email)}`);
  }
  const periodo = periodoDe(agoraMs);
  const linha = banco
    .prepare(
      `select custo_micro_usd as micro, pedidos, tokens_entrada as entrada, tokens_saida as saida
       from uso_ia where conta_id = ? and periodo = ?`,
    )
    .get(conta.id, periodo) as { micro: number; pedidos: number; entrada: number; saida: number } | undefined;
  const saldo = saldoDaConta(banco, conta.id, agoraMs);
  return {
    periodo,
    usados: saldo.usados,
    total: saldo.total,
    pedidos: linha?.pedidos ?? 0,
    tokensEntrada: linha?.entrada ?? 0,
    tokensSaida: linha?.saida ?? 0,
    custoUsd: (linha?.micro ?? 0) / 1_000_000,
  };
}

function formatarUso(email: string, u: UsoDaConta): string {
  return [
    `${normalizarEmail(email)} — ${u.periodo}`,
    `creditos\t${u.usados}/${u.total}`,
    `pedidos\t${u.pedidos}`,
    `tokens\tentrada ${u.tokensEntrada}, saida ${u.tokensSaida}`,
    `custo\tUS$ ${u.custoUsd.toFixed(4)}`,
  ].join("\n");
}

export interface LinhaVaultComUso {
  id: string;
  bytesUsados: number;
  lotes: number;
  ultimaAtividade: number;
}

/** `vaults <email>`: todos os vaults da conta, com bytes usados (lotes + partes de retrato,
 * mesma cota do doc 18 §3), número de lotes e a última vez que algo foi gravado
 * (`atualizado_em`, epoch em ms — `0` se o vault nunca recebeu gravação depois da migração
 * que criou a coluna). Nunca o nome do vault: é cifrado, o servidor não consegue abrir.
 * E-mail sem conta é erro, igual `definirPlano`. */
export function listarVaultsDaConta(banco: BancoSqlite, email: string): LinhaVaultComUso[] {
  const conta = buscarContaPorEmail(banco, email);
  if (!conta) {
    throw new Error(`e-mail nao encontrado: ${normalizarEmail(email)}`);
  }
  return banco
    .prepare(
      `select v.id as id, v.atualizado_em as ultimaAtividade,
              (select count(*) from lotes l where l.vault_id = v.id) as lotes,
              coalesce((select sum(l.tamanho) from lotes l where l.vault_id = v.id), 0)
                + coalesce((select sum(r.tamanho) from retrato_partes r where r.vault_id = v.id), 0)
                as bytesUsados
       from vaults v
       where v.conta_id = ?
       order by v.id`,
    )
    .all(conta.id) as LinhaVaultComUso[];
}

function formatarTabelaVaults(linhas: LinhaVaultComUso[]): string {
  if (linhas.length === 0) return "nenhum vault.";
  return linhas
    .map((linha) => `${linha.id}\t${linha.bytesUsados} bytes\t${linha.lotes} lotes\t${linha.ultimaAtividade}`)
    .join("\n");
}

/** `apagar-vault <email> <id>`: confere que o vault pertence à conta do e-mail (nunca alcança
 * o vault de outra conta) e então apaga metadados e arquivos pelo mesmo caminho de
 * `DELETE /v1/sync/vaults/:id` (`ArmazenamentoSqlite.apagar`, escopado à conta). E-mail sem
 * conta, ou vault que não existe/não é dessa conta, é erro — nunca um apagar silencioso, que
 * esconderia um id digitado errado. */
export async function apagarVaultDaConta(
  banco: BancoSqlite,
  pastaDados: string,
  email: string,
  vaultId: string,
): Promise<void> {
  const conta = buscarContaPorEmail(banco, email);
  if (!conta) {
    throw new Error(`e-mail nao encontrado: ${normalizarEmail(email)}`);
  }
  const linha = banco.prepare(`select id from vaults where id = ? and conta_id = ?`).get(vaultId, conta.id) as
    | { id: string }
    | undefined;
  if (!linha) {
    throw new Error(`vault nao encontrado para esta conta: ${vaultId}`);
  }
  const armazenamento = new ArmazenamentoSqlite(banco, pastaDados, conta.id);
  await armazenamento.apagar(vaultId);
}

/** Corpo dos comandos, separado de `main()` para os testes chamarem sem passar por
 * `process.argv`/`process.exit`. Devolve o texto a imprimir; lança em caso de erro de uso. */
export async function executarComando(
  banco: BancoSqlite,
  pastaDados: string,
  argumentos: string[],
  agoraMs: number = Date.now(),
): Promise<string> {
  const [comando, primeiroArgumento, segundoArgumento] = argumentos;

  switch (comando) {
    case "premium": {
      if (!primeiroArgumento) throw new Error("uso: excalisidian-admin premium <email>");
      const conta = definirPlano(banco, primeiroArgumento, "premium");
      return `${conta.email}: premium (${COTA_POR_FAIXA.padrao} creditos/mes)`;
    }
    case "superior": {
      if (!primeiroArgumento) throw new Error("uso: excalisidian-admin superior <email>");
      const conta = definirPlano(banco, primeiroArgumento, "premium", "superior");
      return `${conta.email}: premium (superior, ${COTA_POR_FAIXA.superior} creditos/mes)`;
    }
    case "uso": {
      if (!primeiroArgumento) throw new Error("uso: excalisidian-admin uso <email>");
      return formatarUso(primeiroArgumento, usoDaConta(banco, primeiroArgumento, agoraMs));
    }
    case "gratis": {
      if (!primeiroArgumento) throw new Error("uso: excalisidian-admin gratis <email>");
      const conta = definirPlano(banco, primeiroArgumento, "gratis");
      return `${conta.email}: gratis`;
    }
    case "contas": {
      return formatarTabelaContas(listarContas(banco));
    }
    case "vaults": {
      if (!primeiroArgumento) throw new Error("uso: excalisidian-admin vaults <email>");
      return formatarTabelaVaults(listarVaultsDaConta(banco, primeiroArgumento));
    }
    case "apagar-vault": {
      if (!primeiroArgumento || !segundoArgumento) {
        throw new Error("uso: excalisidian-admin apagar-vault <email> <id>");
      }
      await apagarVaultDaConta(banco, pastaDados, primeiroArgumento, segundoArgumento);
      return `${normalizarEmail(primeiroArgumento)}: vault ${segundoArgumento} apagado`;
    }
    default:
      throw new Error("uso: excalisidian-admin <premium|superior|gratis|contas|uso|vaults|apagar-vault> [email] [id]");
  }
}

async function main(): Promise<void> {
  const config = carregarConfig();
  const banco = abrirBanco(config.pastaDados);
  try {
    const saida = await executarComando(banco, config.pastaDados, process.argv.slice(2));
    console.log(saida);
  } catch (erro) {
    console.error((erro as Error).message);
    process.exitCode = 1;
  } finally {
    banco.close();
  }
}

// Só roda `main()` quando executado diretamente (bundle de produção ou `node --experimental- `
// nunca é o caso aqui) — os testes importam `executarComando`/`definirPlano`/`listarContas` e
// montam o próprio banco temporário, sem disparar `main()`.
if (process.argv[1]?.endsWith("admin.ts") || process.argv[1]?.endsWith("admin.js")) {
  void main();
}
