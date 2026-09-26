// servidor/src/tiposAmbiente.d.ts
// Declaração mínima para o tsc deste pacote conseguir checar `src/sync/motor.ts` (importado
// por caminho relativo pela Task 5, para o teste de integração do motor), que usa
// `import.meta.env.DEV` — um recurso do Vite. O servidor não instala o Vite como dependência
// (é um pacote Fastify puro), então não há `vite/client` para referenciar; esta declaração
// só ensina o tsc a aceitar o tipo. Em runtime, `codigoDeErro` (motor.ts) só chega a ler
// `import.meta.env` quando o erro NÃO é uma `FalhaSync` — e todo erro que este servidor (via
// `ServicoSyncHttp`) produz é sempre uma `FalhaSync`, então esse ramo nunca executa aqui.
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
