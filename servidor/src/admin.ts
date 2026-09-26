// servidor/src/admin.ts
// Ponto de entrada de `excalisidian-admin` (Task 6, doc 18 §4): três comandos, lendo a mesma
// config (`carregarConfig`) e o mesmo banco (`abrirBanco`) que o servidor usa — na VPS aponta
// para `/var/lib/excalisidian` via `EXCALISIDIAN_DADOS`, exatamente como `excalisidian-api`.
//
// `premium <email>` e `gratis <email>` trocam `contas.plano`; `contas` lista e-mail, plano e
// bytes usados por conta (a mesma soma de `bytesUsadosPelaConta`, a cota do doc 18 §3). Nunca
// imprime prova, hash, sal ou token — só o que já é operação legítima (e-mail e plano).
//
// `principal.ts` é o ponto de entrada do servidor HTTP; este arquivo é o ponto de entrada do
// bundle separado `dist/admin.js` (ver scripts/empacotar.mjs) — os dois importam `banco.ts`/
// `config.ts`, nunca um ao outro.

import { normalizarEmail } from "../../src/conta/derivacaoSenha";
import { abrirBanco, type BancoSqlite } from "./banco";
import { bytesUsadosPelaConta } from "./armazenamentoSync";
import { carregarConfig } from "./config";

interface LinhaConta {
  id: number;
  email: string;
  plano: string;
}

/** Devolve a linha da conta pelo e-mail normalizado, ou `undefined` se não existe. Exportado
 * só para os testes montarem os cenários sem duplicar a normalização. */
export function buscarContaPorEmail(banco: BancoSqlite, email: string): LinhaConta | undefined {
  const emailNormalizado = normalizarEmail(email);
  return banco.prepare(`select id, email, plano from contas where email = ?`).get(emailNormalizado) as
    | LinhaConta
    | undefined;
}

/** `premium <email>`: acha a conta pelo e-mail, define `plano = 'premium'`. E-mail
 * inexistente é erro (não cria conta — a conta nasce só por `POST /v1/contas`, do app). */
export function definirPlano(banco: BancoSqlite, email: string, plano: "premium" | "gratis"): LinhaConta {
  const conta = buscarContaPorEmail(banco, email);
  if (!conta) {
    throw new Error(`e-mail nao encontrado: ${normalizarEmail(email)}`);
  }
  banco.prepare(`update contas set plano = ? where id = ?`).run(plano, conta.id);
  return { ...conta, plano };
}

export interface LinhaContaComUso {
  email: string;
  plano: string;
  bytesUsados: number;
}

/** `contas`: todas as contas, com o espaço usado (soma de lotes + partes de retrato, a mesma
 * cota do doc 18 §3), ordenadas por e-mail — saída estável para conferir de olho. */
export function listarContas(banco: BancoSqlite): LinhaContaComUso[] {
  const linhas = banco.prepare(`select id, email, plano from contas order by email`).all() as LinhaConta[];
  return linhas.map((linha) => ({
    email: linha.email,
    plano: linha.plano,
    bytesUsados: bytesUsadosPelaConta(banco, linha.id),
  }));
}

function formatarTabelaContas(linhas: LinhaContaComUso[]): string {
  if (linhas.length === 0) return "nenhuma conta.";
  return linhas
    .map((linha) => `${linha.email}\t${linha.plano}\t${linha.bytesUsados} bytes`)
    .join("\n");
}

/** Corpo dos comandos, separado de `main()` para os testes chamarem sem passar por
 * `process.argv`/`process.exit`. Devolve o texto a imprimir; lança em caso de erro de uso. */
export function executarComando(banco: BancoSqlite, argumentos: string[]): string {
  const [comando, email] = argumentos;

  switch (comando) {
    case "premium": {
      if (!email) throw new Error("uso: excalisidian-admin premium <email>");
      const conta = definirPlano(banco, email, "premium");
      return `${conta.email}: premium`;
    }
    case "gratis": {
      if (!email) throw new Error("uso: excalisidian-admin gratis <email>");
      const conta = definirPlano(banco, email, "gratis");
      return `${conta.email}: gratis`;
    }
    case "contas": {
      return formatarTabelaContas(listarContas(banco));
    }
    default:
      throw new Error("uso: excalisidian-admin <premium|gratis|contas> [email]");
  }
}

function main(): void {
  const config = carregarConfig();
  const banco = abrirBanco(config.pastaDados);
  try {
    const saida = executarComando(banco, process.argv.slice(2));
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
  main();
}
