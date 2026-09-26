// servidor/src/config.ts
// Configuração do servidor a partir de variáveis de ambiente, com padrões de
// desenvolvimento que gravam tudo dentro de servidor/.dados/ (ignorado pelo git).

import path from "node:path";

export interface Config {
  /** Porta onde o servidor escuta (só em 127.0.0.1 — ver src/principal.ts). */
  porta: number;
  /** Pasta onde ficam o banco SQLite e os pacotes de sincronização. */
  pastaDados: string;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const porta = Number(env.EXCALISIDIAN_PORTA ?? 3100);
  // Padrão de desenvolvimento: servidor/.dados, relativo a onde o processo foi iniciado —
  // `npm test`, `npm run iniciar` e o systemd (Task 6) sempre rodam com a pasta servidor/
  // como diretório de trabalho. Em produção a VPS sempre define EXCALISIDIAN_DADOS.
  const pastaDados = env.EXCALISIDIAN_DADOS ?? path.join(process.cwd(), ".dados");
  return { porta, pastaDados };
}
