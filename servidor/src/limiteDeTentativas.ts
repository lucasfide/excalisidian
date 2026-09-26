// servidor/src/limiteDeTentativas.ts
// Limite de tentativas em memória (doc 18 §3): no máximo 10 por minuto por IP e 10 por
// minuto por e-mail, nas rotas de entrar e criar. Em memória de propósito — um processo só,
// reinicia com o servidor; não precisa sobreviver a reinício nem ser compartilhado.

const JANELA_MS = 60_000;
const LIMITE = 10;

export class LimiteDeTentativas {
  private readonly tentativasPorChave = new Map<string, number[]>();

  /** Registra uma tentativa para `chave` e devolve `true` se ainda está dentro do limite,
   * `false` se esta tentativa já excede. */
  registrar(chave: string): boolean {
    const agora = Date.now();
    const anteriores = this.tentativasPorChave.get(chave) ?? [];
    const dentroDaJanela = anteriores.filter((tentativa) => agora - tentativa < JANELA_MS);
    dentroDaJanela.push(agora);
    this.tentativasPorChave.set(chave, dentroDaJanela);
    return dentroDaJanela.length <= LIMITE;
  }
}
