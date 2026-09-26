// servidor/src/limiteDeTentativas.ts
// Limite de tentativas em memória (doc 18 §3): no máximo 10 por minuto por IP e 10 por
// minuto por e-mail, nas rotas de entrar e criar. Em memória de propósito — um processo só,
// reinicia com o servidor; não precisa sobreviver a reinício nem ser compartilhado.
//
// Sem limpeza, o mapa de chaves só cresce: todo IP e todo e-mail já vistos ficam guardados
// para sempre, mesmo depois de a janela de 1 minuto daquela chave passar. A varredura
// oportunista (`limpar`) roda de tempos em tempos — a cada `LIMPEZA_A_CADA` chamadas de
// `registrar`, em qualquer chave — e descarta as chaves sem nenhuma tentativa dentro da
// janela. Não é um cron: só acontece quando o limitador está em uso.

const JANELA_MS = 60_000;
const LIMITE = 10;
const LIMPEZA_A_CADA = 50;

export class LimiteDeTentativas {
  private readonly tentativasPorChave = new Map<string, number[]>();
  private chamadasDesdeALimpeza = 0;

  /** Registra uma tentativa para `chave` e devolve `true` se ainda está dentro do limite,
   * `false` se esta tentativa já excede. */
  registrar(chave: string): boolean {
    const agora = Date.now();

    this.chamadasDesdeALimpeza += 1;
    if (this.chamadasDesdeALimpeza >= LIMPEZA_A_CADA) {
      this.limpar(agora);
      this.chamadasDesdeALimpeza = 0;
    }

    const anteriores = this.tentativasPorChave.get(chave) ?? [];
    const dentroDaJanela = anteriores.filter((tentativa) => agora - tentativa < JANELA_MS);
    dentroDaJanela.push(agora);
    this.tentativasPorChave.set(chave, dentroDaJanela);
    return dentroDaJanela.length <= LIMITE;
  }

  private limpar(agora: number): void {
    for (const [chave, tentativas] of this.tentativasPorChave) {
      const restantes = tentativas.filter((tentativa) => agora - tentativa < JANELA_MS);
      if (restantes.length === 0) this.tentativasPorChave.delete(chave);
      else this.tentativasPorChave.set(chave, restantes);
    }
  }

  /** Só para teste: quantas chaves o limitador guarda em memória agora. */
  tamanhoParaTeste(): number {
    return this.tentativasPorChave.size;
  }
}
