// src/vault/VaultAdapterMemoria.ts
// VaultAdapter completo em memória, sem tocar disco nem Tauri — usado pelos testes do motor
// de sincronização (plano 09, Tasks 3-5): dois "computadores" simulados em teste, cada um com
// o seu VaultAdapterMemoria, sincronizando pelo servidor falso pela mesma chave.
//
// Gravar (`escreverTexto`/`escreverBinario`) ou mover para dentro de uma pasta que não existe
// FALHA, igual ao disco real: `escritaAtomica.ts` só faz `writeTextFile(tmp)` + `rename`, sem
// `mkdir`, e o `rename` do plugin-fs também exige a pasta de destino já existente. Só
// `criarPasta` cria pastas (recursivamente, como `mkdir(..., { recursive: true })`). Isso
// importa: se este adaptador criasse pasta sozinho por baixo dos panos, um defeito real do
// motor de sincronização (gravar um arquivo remoto numa pasta nova sem criar a pasta antes)
// passaria limpo aqui e só quebraria no disco de verdade.
//
// `observar`/`aoPerderSincronia` existem só pra satisfazer a interface — não há watcher de
// verdade aqui, então são no-op (a função de cancelar devolvida também não faz nada).

import type { EntradaArquivo, EventoArquivo, VaultAdapter } from "./VaultAdapter";
import { normalizarCaminho, pastaDe, nomeBase } from "./caminhos";

interface Registro {
  isDir: boolean;
  /** Ausente para pasta. */
  conteudo?: Uint8Array;
  mtimeMs: number;
  birthtimeMs: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function erroNaoEncontrado(path: string): Error {
  return new Error(`ENOENT: ${path}`);
}

export class VaultAdapterMemoria implements VaultAdapter {
  private arquivos = new Map<string, Registro>();
  /** Contador próprio, não o relógio: várias escritas de um mesmo teste acontecem no mesmo
   * milissegundo, e `mtimeMs` crescente é o que o índice de mudanças locais (`reindexar`,
   * detecção do motor de sync) usa pra distinguir "mudou" de "não mudou" entre duas
   * chamadas — `Date.now()` não garante isso. */
  private proximoMtime = 1;

  constructor(private readonly caminhoRaiz: string = "C:/vault-memoria") {}

  raiz(): string {
    return this.caminhoRaiz;
  }

  private tocar(): number {
    return this.proximoMtime++;
  }

  /** Cria (se preciso) todas as pastas ancestrais de `path`, recursivamente — só usado por
   * `criarPasta`, que espelha `mkdir(..., { recursive: true })` do `TauriVaultAdapter`. NÃO é
   * chamado por `escrever`/`mover`: o disco real não cria pasta sozinho (`escritaAtomica.ts`
   * faz só `writeTextFile(tmp)` + `rename`, sem `mkdir`; o `rename` do plugin-fs também exige
   * a pasta de destino já existir) — gravar em `a/b/c.md` com `a/b` inexistente FALHA de
   * verdade. Se este adaptador criasse a pasta sozinho aqui, um defeito do motor de
   * sincronização (esquecer de `criarPasta` antes de gravar um arquivo em pasta nova) passaria
   * limpo no teste e quebraria só no disco de verdade. */
  private criarPastasAncestrais(path: string): void {
    const pasta = pastaDe(path);
    if (!pasta) return;
    let acumulado = "";
    for (const parte of pasta.split("/")) {
      acumulado = acumulado ? `${acumulado}/${parte}` : parte;
      if (!this.arquivos.has(acumulado)) {
        const agora = this.tocar();
        this.arquivos.set(acumulado, { isDir: true, mtimeMs: agora, birthtimeMs: agora });
      }
    }
  }

  /** True se a pasta-pai de `path` existe (raiz "" sempre existe) e é mesmo uma pasta —
   * condição que `escrever`/`mover` exigem, espelhando o disco real (ver comentário de
   * `criarPastasAncestrais`). */
  private pastaPaiExiste(path: string): boolean {
    const pasta = pastaDe(path);
    if (!pasta) return true;
    return this.arquivos.get(pasta)?.isDir === true;
  }

  /** True se algum segmento "de pasta" do caminho começa com ponto — pasta ponto nunca
   * aparece em `listar()` (RF1.6, mesma regra de `walk_vault`); `listarPasta()` continua
   * enxergando (é o único jeito de listar `.trash/`, doc 02 §7). */
  private dentroDePastaPonto(path: string, isDir: boolean): boolean {
    const segmentos = path.split("/");
    const relevantes = isDir ? segmentos : segmentos.slice(0, -1);
    return relevantes.some((s) => s.startsWith("."));
  }

  async listar(): Promise<EntradaArquivo[]> {
    const saida: EntradaArquivo[] = [];
    for (const [path, reg] of this.arquivos) {
      if (this.dentroDePastaPonto(path, reg.isDir)) continue;
      saida.push({
        path,
        isDir: reg.isDir,
        size: reg.conteudo?.length ?? 0,
        mtimeMs: reg.mtimeMs,
        birthtimeMs: reg.birthtimeMs,
      });
    }
    return saida;
  }

  async lerTexto(path: string): Promise<string> {
    const p = normalizarCaminho(path);
    const reg = this.arquivos.get(p);
    if (!reg || reg.isDir || !reg.conteudo) throw erroNaoEncontrado(p);
    return decoder.decode(reg.conteudo);
  }

  async lerBinario(path: string): Promise<Uint8Array> {
    const p = normalizarCaminho(path);
    const reg = this.arquivos.get(p);
    if (!reg || reg.isDir || !reg.conteudo) throw erroNaoEncontrado(p);
    return reg.conteudo;
  }

  private async escrever(path: string, dados: Uint8Array): Promise<void> {
    const p = normalizarCaminho(path);
    if (!this.pastaPaiExiste(p)) {
      throw erroNaoEncontrado(pastaDe(p));
    }
    const anterior = this.arquivos.get(p);
    const agora = this.tocar();
    this.arquivos.set(p, {
      isDir: false,
      conteudo: dados,
      mtimeMs: agora,
      birthtimeMs: anterior?.birthtimeMs ?? agora,
    });
  }

  async escreverTexto(path: string, conteudo: string): Promise<void> {
    await this.escrever(path, encoder.encode(conteudo));
  }

  async escreverBinario(path: string, dados: Uint8Array): Promise<void> {
    await this.escrever(path, dados);
  }

  async criarPasta(path: string): Promise<void> {
    const p = normalizarCaminho(path);
    if (!p) return;
    this.criarPastasAncestrais(`${p}/_`);
    if (!this.arquivos.has(p)) {
      const agora = this.tocar();
      this.arquivos.set(p, { isDir: true, mtimeMs: agora, birthtimeMs: agora });
    }
  }

  async mover(de: string, para: string): Promise<void> {
    const origem = normalizarCaminho(de);
    const destino = normalizarCaminho(para);
    const reg = this.arquivos.get(origem);
    if (!reg) throw erroNaoEncontrado(origem);
    // O `rename` do plugin-fs também exige a pasta de destino já existente — não cria
    // nenhuma sozinho, então este adaptador não pode criar por baixo dos panos (mesmo
    // motivo de `escrever` não chamar `criarPastasAncestrais`).
    if (!this.pastaPaiExiste(destino)) {
      throw erroNaoEncontrado(pastaDe(destino));
    }
    const agora = this.tocar();
    if (reg.isDir) {
      const prefixo = `${origem}/`;
      const filhos = [...this.arquivos.entries()].filter(([p]) => p.startsWith(prefixo));
      this.arquivos.delete(origem);
      this.arquivos.set(destino, { ...reg, mtimeMs: agora });
      for (const [p, r] of filhos) {
        this.arquivos.delete(p);
        this.arquivos.set(destino + p.slice(origem.length), r);
      }
    } else {
      this.arquivos.delete(origem);
      this.arquivos.set(destino, { ...reg, mtimeMs: agora });
    }
  }

  async remover(path: string): Promise<void> {
    const p = normalizarCaminho(path);
    const prefixo = `${p}/`;
    for (const chave of [...this.arquivos.keys()]) {
      if (chave === p || chave.startsWith(prefixo)) this.arquivos.delete(chave);
    }
  }

  async listarPasta(path: string): Promise<{ nome: string; isDir: boolean }[]> {
    const p = normalizarCaminho(path);
    const saida: { nome: string; isDir: boolean }[] = [];
    for (const [chave, reg] of this.arquivos) {
      if (pastaDe(chave) === p) saida.push({ nome: nomeBase(chave), isDir: reg.isDir });
    }
    return saida;
  }

  async existe(path: string): Promise<boolean> {
    return this.arquivos.has(normalizarCaminho(path));
  }

  observar(_cb: (eventos: EventoArquivo[]) => void): () => void {
    return () => {};
  }

  aoPerderSincronia(_cb: () => void): () => void {
    return () => {};
  }
}
