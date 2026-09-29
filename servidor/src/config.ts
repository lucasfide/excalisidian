// servidor/src/config.ts
// Configuração do servidor a partir de variáveis de ambiente, com padrões de
// desenvolvimento que gravam tudo dentro de servidor/.dados/ (ignorado pelo git).

import path from "node:path";

export interface ConfigIa {
  /** Chave do fornecedor. Vazia = IA desligada (as rotas de IA respondem 503). Nunca logar. */
  chave: string;
  /** Base do fornecedor, sem barra no fim (a rota `/chat/completions` é acrescentada). */
  url: string;
  /** Modelo real do fornecedor para os dois modelos lógicos do app. */
  modelo: string;
}

export interface Config {
  /** Porta onde o servidor escuta (só em 127.0.0.1 — ver src/principal.ts). */
  porta: number;
  /** Pasta onde ficam o banco SQLite e os pacotes de sincronização. */
  pastaDados: string;
  /** IA do Excalisidian (doc 18 §5.3). Ausente nos testes que não usam IA. */
  ia?: ConfigIa;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const porta = Number(env.EXCALISIDIAN_PORTA ?? 3100);
  // Padrão de desenvolvimento: servidor/.dados, relativo a onde o processo foi iniciado —
  // `npm test`, `npm run iniciar` e o systemd (Task 6) sempre rodam com a pasta servidor/
  // como diretório de trabalho. Em produção a VPS sempre define EXCALISIDIAN_DADOS.
  const pastaDados = env.EXCALISIDIAN_DADOS ?? path.join(process.cwd(), ".dados");
  const ia: ConfigIa = {
    chave: (env.EXCALISIDIAN_IA_CHAVE ?? "").trim(),
    url: (env.EXCALISIDIAN_IA_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    modelo: env.EXCALISIDIAN_IA_MODELO ?? "deepseek/deepseek-v4.1-flash",
  };
  return { porta, pastaDados, ia };
}
