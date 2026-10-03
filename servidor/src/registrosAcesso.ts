// servidor/src/registrosAcesso.ts
// Registros de acesso (Marco Civil da Internet, Lei 12.965/2014, art. 15; doc 18 §1 e §4,
// ADR-46): data e hora de uso da aplicação a partir de um endereço IP, guardados por 6 meses,
// em sigilo. Este é o ÚNICO lugar do servidor onde um IP é gravado. Nunca vai para o stdout, para
// o log por requisição (`log.ts`) nem para uma rota HTTP — só o comando de administração
// `acessos` (admin.ts) lê estes registros, a pedido de quem tem a ordem judicial.
//
// A tabela não tem chave estrangeira para `contas`: o registro precisa sobreviver à exclusão
// da conta (`apagar-conta`), por isso guarda também o e-mail da conta no momento do acesso.

import type { BancoSqlite } from "./banco";

export type EventoAcesso = "criar-conta" | "entrar" | "renovar" | "uso";

/** 183 dias ≈ 6 meses (a lei fala em "seis meses"; 183 dias nunca é menos que isso). */
export const RETENCAO_REGISTROS_ACESSO_MS = 183 * 24 * 60 * 60 * 1000;

/** Intervalo mínimo entre dois registros `uso` da mesma conta e do mesmo IP. */
export const INTERVALO_REGISTRO_USO_MS = 60 * 60 * 1000;

/** Grava um registro de acesso. Só é chamado depois de a ação ter dado certo (conta criada,
 * senha conferida, sessão renovada, token válido) — pedido que falha na autenticação não grava. */
export function registrarAcesso(
  banco: BancoSqlite,
  conta: { id: number; email: string },
  ip: string,
  evento: EventoAcesso,
  agoraMs: number,
): void {
  banco
    .prepare(`insert into registros_acesso (conta_id, email_conta, ip, instante, evento) values (?, ?, ?, ?, ?)`)
    .run(conta.id, conta.email, ip, agoraMs, evento);
}

/** Registra `uso` no primeiro pedido autenticado de cada hora por (conta, IP), para não gravar
 * uma linha por pedido. Devolve `true` se gravou. */
export function registrarUsoSeNovaHora(
  banco: BancoSqlite,
  conta: { id: number; email: string },
  ip: string,
  agoraMs: number,
): boolean {
  const recente = banco
    .prepare(
      `select 1 from registros_acesso
       where conta_id = ? and ip = ? and evento = 'uso' and instante > ?
       limit 1`,
    )
    .get(conta.id, ip, agoraMs - INTERVALO_REGISTRO_USO_MS);
  if (recente !== undefined) return false;
  registrarAcesso(banco, conta, ip, "uso", agoraMs);
  return true;
}

/** Apaga os registros com mais de 183 dias. Devolve quantos apagou. */
export function apagarRegistrosAcessoVencidos(banco: BancoSqlite, agoraMs: number): number {
  const resultado = banco
    .prepare(`delete from registros_acesso where instante < ?`)
    .run(agoraMs - RETENCAO_REGISTROS_ACESSO_MS);
  return resultado.changes;
}

export interface RegistroAcesso {
  instante: number;
  ip: string;
  evento: string;
}

/** Registros de uma conta pelo e-mail guardado (vale também para conta já apagada), do mais
 * antigo para o mais novo, dentro do intervalo `[desdeMs, ateMs]` (ambos opcionais). */
export function listarRegistrosAcesso(
  banco: BancoSqlite,
  email: string,
  desdeMs?: number,
  ateMs?: number,
): RegistroAcesso[] {
  return banco
    .prepare(
      `select instante, ip, evento from registros_acesso
       where email_conta = ? and instante >= ? and instante <= ?
       order by instante, id`,
    )
    .all(email, desdeMs ?? 0, ateMs ?? Number.MAX_SAFE_INTEGER) as RegistroAcesso[];
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Rotina diária do processo do servidor: apaga os vencidos ao subir e a cada 24 h. O timer não
 * segura o processo vivo (`unref`). Devolve uma função que cancela o timer. */
export function agendarLimpezaDeRegistrosAcesso(
  banco: BancoSqlite,
  relogio: () => number = () => Date.now(),
): () => void {
  const limpar = (): void => {
    try {
      apagarRegistrosAcessoVencidos(banco, relogio());
    } catch {
      // banco fechado (serviço parando) ou ocupado: a próxima rodada tenta de novo. Nada é
      // escrito em log — a mensagem de erro poderia carregar dados da linha.
    }
  };
  limpar();
  const timer = setInterval(limpar, UM_DIA_MS);
  timer.unref();
  return () => clearInterval(timer);
}
