// Diagnósticos da auditoria de 2026-09-12. Executar da raiz do repositório.
// Lê o TypeScript real e substitui disco, timers e IPC por simulações em memória.
// Não grava notas, não instala atualizações e não chama o backend nativo.
// As assertions verificam os BUGS atuais: sucesso significa que foram reproduzidos.
// O benchmark é opcional: node scripts/auditoria-reproducoes.cjs --benchmark
const fs = require("node:fs"), ts = require("typescript"), assert = require("node:assert/strict");
function mod(path, mocks) { const m = { exports: {} }; const code = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; new Function("require", "module", "exports", code)((id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id), m, m.exports); return m.exports; }
function env() { let now = 0, seq = 0; const timers = new Map(); global.window = { setTimeout: (fn, ms) => { timers.set(++seq, { fn, at: now + ms }); return seq; }, clearTimeout: id => timers.delete(id) }; const disk = new Map([["Nota.md", "original"]]); const adapter = { lerTexto: async (p) => { if (!disk.has(p))
        throw Error("ENOENT"); return disk.get(p); }, escreverTexto: async (p, c) => disk.set(p, c) }; const vault = { getState: () => ({ adapter, reindexarArquivo: async () => { } }) }; const d = mod("src/estado/documentosStore.ts", { "./vaultStore": { useVaultStore: vault }, "../vault/arvore": { tipoDoArquivo: p => p.endsWith(".draw.md") ? "drawing" : "note" } }).useDocumentosStore; return { d, disk, adapter, async tick(ms) { now += ms; for (const [id, t] of [...timers])
        if (t.at <= now) {
            timers.delete(id);
            t.fn();
        } for (let i = 0; i < 10; i++)
        await Promise.resolve(); } }; }
(async () => {
    let e = env();
    await e.d.getState().abrir("Nota.md");
    e.d.getState().editar("Nota.md", "local");
    e.disk.set("Nota.md", "externo");
    await e.d.getState().aoEventoExterno(["Nota.md"]);
    assert.equal(e.d.getState().docs.get("Nota.md").estado, "conflito");
    await e.tick(800);
    assert.equal(e.disk.get("Nota.md"), "local");
    console.log("CONFIRMADO: timer sobrescreve conflito externo sem escolha.");
    e = env();
    await e.d.getState().abrir("Nota.md");
    let release;
    e.adapter.escreverTexto = async (p, c) => { await new Promise(r => release = r); e.disk.set(p, c); };
    e.d.getState().editar("Nota.md", "v1");
    const p = e.d.getState().salvar("Nota.md");
    e.d.getState().editar("Nota.md", "v2");
    await e.tick(800);
    release();
    await p;
    await e.tick(3000);
    assert.equal(e.disk.get("Nota.md"), "v1");
    assert.equal(e.d.getState().docs.get("Nota.md").conteudoEditor, "v2");
    assert.equal(e.d.getState().docs.get("Nota.md").estado, "salvo");
    console.log("CONFIRMADO: gravacao lenta deixa v2 sem timer e status salvo com disco v1.");
    e = env();
    await e.d.getState().abrir("Nota.md");
    e.d.getState().editar("Nota.md", "local");
    e.adapter.escreverTexto = async () => { throw Error("EACCES"); };
    await e.d.getState().flushTudo();
    assert.equal(e.d.getState().docs.get("Nota.md").estado, "erro");
    console.log("CONFIRMADO: flushTudo resolve com sucesso apesar de EACCES.");
    e = env();
    await e.d.getState().abrir("Nota.md");
    e.adapter.escreverTexto = async (p, c) => { await new Promise(r => release = r); e.disk.set(p, c); };
    e.d.getState().editar("Nota.md", "v1");
    const pending = e.d.getState().salvar("Nota.md");
    e.d.getState().editar("Nota.md", "v2");
    const w = mod("src/estado/workspaceStore.ts", { "./documentosStore": { useDocumentosStore: e.d }, "../vault/arvore": { tipoDoArquivo: () => "note" } }).useWorkspaceStore;
    w.getState().aoRemoverPainel("Nota.md", "Nota.md");
    release();
    await pending;
    assert.equal(e.disk.get("Nota.md"), "v1");
    assert.equal(e.d.getState().docs.has("Nota.md"), false);
    console.log("CONFIRMADO: fechar ultima aba durante gravacao perde v2.");
    const arvore = mod("src/vault/arvore.ts", {});
    const resolucao = mod("src/indice/resolucao.ts", { "../vault/arvore": arvore });
    const ir = resolucao.construirIndiceResolucao(["Nota.md", "D.draw.md"]);
    assert.equal(resolucao.resolverLink(ir, "Nota.md", "Outra.md"), null);
    assert.equal(resolucao.resolverLink(ir, "D.draw.md", "Outra.md"), null);
    console.log("CONFIRMADO: wikilinks com extensao explicita sem barra nao resolvem.");
    const novoIndice = resolucao.construirIndiceResolucao(["A/Origem.md", "A/Alvo.md", "B/Alvo.md"]);
    assert.equal(resolucao.resolverLink(novoIndice, "Alvo", "A/Origem.md"), "A/Alvo.md");
    console.log("CONFIRMADO: link curto Alvo prefere A/Alvo.md a arquivo movido para B/Alvo.md.");
    const fm = mod("src/indice/frontmatter.ts", {});
    const formato = mod("src/canvas/formatoDesenho.ts", { "../indice/frontmatter": fm, "../app/constantes": mod("src/app/constantes.ts", {}) });
    const dado = formato.parseDesenho(formato.desenhoVazio());
    dado.frontmatter.descricao = "a: b";
    dado.frontmatter.detalhes = { autor: "Ana" };
    const serializado = formato.serializarDesenho(dado);
    assert.deepEqual(formato.parseDesenho(serializado).frontmatter, {});
    console.log("CONFIRMADO: round-trip de frontmatter com descricao a: b perde metadados.");
    const invalido = formato.desenhoVazio().replace(/\{[\s\S]*?\n\}/, "{ JSON INVALIDO }");
    assert.equal(formato.parseDesenho(invalido).cena.elements.length, 0);
    assert(!formato.serializarDesenho(formato.parseDesenho(invalido)).includes("JSON INVALIDO"));
    console.log("CONFIRMADO: cena JSON invalida vira cena vazia e round-trip apaga original.");
    e = env();
    await e.d.getState().abrir("Nota.md");
    const paineis = [{ id: "Nota.md", params: { path: "Nota.md" } }, { id: "clone", params: { path: "Nota.md", somenteLeitura: true } }];
    const novos = [];
    const api = { panels: paineis, removePanel: () => { }, addPanel: p => novos.push(p), getPanel: () => null };
    const ws = mod("src/estado/workspaceStore.ts", { "./documentosStore": { useDocumentosStore: e.d }, "../vault/arvore": arvore }).useWorkspaceStore;
    ws.setState({ api });
    ws.getState().renomearDocumento("Nota.md", "Nova.md");
    assert.equal(novos.length, 2);
    assert(novos.every(p => p.params.somenteLeitura === undefined));
    console.log("CONFIRMADO: rename recria ambos paineis sem somenteLeitura.");
    let docsNotificados = 0;
    const parser = mod("src/indice/parser.ts", { "./frontmatter": fm, "./wikilink": mod("src/indice/wikilink.ts", {}), "./sintaxe": mod("src/indice/sintaxe.ts", {}), "../vault/arvore": arvore });
    const backlinks = mod("src/indice/backlinks.ts", { "./resolucao": resolucao });
    const vaultReal = mod("src/estado/vaultStore.ts", {
        "../vault/TauriVaultAdapter": { TauriVaultAdapter: {} },
        "../vault/arvore": arvore, "../indice/parser": parser, "../indice/resolucao": resolucao,
        "../indice/backlinks": backlinks, "../indice/cache": { carregarIndice: async () => null, salvarIndice: async () => { } },
        "../vault/escritaAtomica": { hashConteudo: async () => "", deveIgnorarEvento: () => false },
        "./documentosStore": { useDocumentosStore: { getState: () => ({ aoEventoExterno: async () => docsNotificados++ }) } },
        "./tarefasStore": { useTarefasStore: { getState: () => ({ _persistirAgora: async () => { }, carregar: async () => { } }) } }
    }).useVaultStore;
    const entradas = ["A.md", "B.md"].map(path => ({ path, isDir: false, mtimeMs: 1, size: 3 }));
    const leitores = new Map();
    const ad = { raiz: () => "mock", listar: async () => entradas, lerTexto: p => new Promise(r => leitores.set(p, r)) };
    vaultReal.setState({ adapter: ad, entradas, indice: new Map(), raiz: "mock" });
    const a = vaultReal.getState().reindexarArquivo("A.md"), b = vaultReal.getState().reindexarArquivo("B.md");
    leitores.get("A.md")("# A");
    await a;
    leitores.get("B.md")("# B");
    await b;
    assert.equal(vaultReal.getState().indice.has("A.md"), false);
    console.log("CONFIRMADO: reindexacoes paralelas de A e B descartam A do indice.");
    ad.lerTexto = async (p) => "# " + p;
    await vaultReal.getState().ressincronizar();
    assert.equal(docsNotificados, 0);
    console.log("CONFIRMADO: ressincronizar nao notifica documentos abertos.");
    const links = mod("src/indice/wikilink.ts", {});
    for (const n of (process.argv.includes("--benchmark") ? [2000, 4000, 8000] : [])) {
        const txt = ("[[Nota]] " + "x".repeat(90) + "\n").repeat(n);
        links.extrairLinks(txt);
        const t = performance.now();
        links.extrairLinks(txt);
        console.log("BENCH extrairLinks " + n + " links / " + txt.length + " caracteres: " + (performance.now() - t).toFixed(1) + "ms");
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
