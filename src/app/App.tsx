// Fatia 0: o app abre, pede a pasta do vault uma vez, e nas próximas aberturas lista os
// arquivos sem pedir nada. Mais uma rota de teste para o spike de desempenho do canvas.
// Nada aqui é UI final — o design system entra a partir da Fatia 1.

import { useCallback, useEffect, useState } from "react";

import type { EntradaArquivo } from "../vault/VaultAdapter";
import { TauriVaultAdapter } from "../vault/TauriVaultAdapter";
import { SpikeCanvas } from "./SpikeCanvas";

type Tema = "sistema" | "claro" | "escuro";

function aplicarTema(tema: Tema) {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

type Estado =
  | { fase: "carregando" }
  | { fase: "sem-vault" }
  | { fase: "pronto"; raiz: string; entradas: EntradaArquivo[] }
  | { fase: "erro"; mensagem: string };

export default function App() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [rota, setRota] = useState<"vault" | "spike">("vault");
  const [tema, setTema] = useState<Tema>("sistema");

  useEffect(() => {
    aplicarTema(tema);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => aplicarTema(tema);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [tema]);

  const carregarLista = useCallback(async (adapter: TauriVaultAdapter) => {
    const entradas = await adapter.listar();
    entradas.sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
    setEstado({ fase: "pronto", raiz: adapter.raiz(), entradas });
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const adapter = await TauriVaultAdapter.doBoot();
        if (!ativo) return;
        if (adapter) {
          await carregarLista(adapter);
        } else {
          setEstado({ fase: "sem-vault" });
        }
      } catch (e) {
        if (ativo) setEstado({ fase: "erro", mensagem: String(e) });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [carregarLista]);

  const escolher = useCallback(async () => {
    try {
      setEstado({ fase: "carregando" });
      const adapter = await TauriVaultAdapter.escolher();
      if (!adapter) {
        setEstado((s) => (s.fase === "carregando" ? { fase: "sem-vault" } : s));
        return;
      }
      await carregarLista(adapter);
    } catch (e) {
      setEstado({ fase: "erro", mensagem: String(e) });
    }
  }, [carregarLista]);

  if (rota === "spike") {
    return (
      <div className="h-screen w-screen bg-papel text-tinta">
        <button
          onClick={() => setRota("vault")}
          className="meta absolute left-3 top-3 z-10 rounded-controle border border-regua-forte bg-superficie px-3 py-1"
        >
          voltar
        </button>
        <SpikeCanvas />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-auto bg-papel px-8 py-6 font-sans text-tinta">
      <header className="mb-6 flex items-baseline justify-between border-b border-regua pb-3">
        <div>
          <h1 className="font-display text-[32px] leading-none text-tinta">Excalisidian</h1>
          <div className="mt-1 h-[2px] w-16 bg-musgo" />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={tema}
            onChange={(e) => setTema(e.target.value as Tema)}
            className="rounded-controle border border-regua-forte bg-superficie px-2 py-1 text-[13px] text-tinta"
          >
            <option value="sistema">Tema do sistema</option>
            <option value="claro">Tema claro</option>
            <option value="escuro">Tema escuro</option>
          </select>
          <button
            onClick={() => setRota("spike")}
            className="meta rounded-controle border border-regua-forte bg-superficie px-3 py-1 text-tinta-media"
          >
            spike do canvas
          </button>
        </div>
      </header>

      {estado.fase === "carregando" && (
        <p className="meta text-tinta-suave">carregando…</p>
      )}

      {estado.fase === "sem-vault" && (
        <div className="max-w-md border-y border-regua py-8">
          <h2 className="font-display text-[19px] text-tinta">Nenhum vault aberto</h2>
          <p className="mt-1 text-[13px] text-tinta-media">
            Escolha uma pasta do disco para usar como vault. Nas próximas vezes o app abre nela
            direto.
          </p>
          <button
            onClick={escolher}
            className="mt-4 rounded-controle bg-musgo px-4 py-2 text-[15px] text-superficie"
          >
            Escolher pasta
          </button>
        </div>
      )}

      {estado.fase === "erro" && (
        <div className="max-w-md border-y border-bordo py-8">
          <h2 className="font-display text-[19px] text-bordo">Deu erro ao abrir o vault</h2>
          <pre className="mt-2 whitespace-pre-wrap text-[13px] text-tinta-media">
            {estado.mensagem}
          </pre>
          <button
            onClick={escolher}
            className="mt-4 rounded-controle bg-musgo px-4 py-2 text-[15px] text-superficie"
          >
            Escolher outra pasta
          </button>
        </div>
      )}

      {estado.fase === "pronto" && (
        <div>
          <div className="meta mb-3 flex items-center gap-3 text-tinta-suave">
            <span>{estado.raiz}</span>
            <span>·</span>
            <span>{estado.entradas.length} entradas</span>
            <button
              onClick={escolher}
              className="rounded-controle border border-regua-forte px-2 py-[2px] text-tinta-media"
            >
              trocar
            </button>
          </div>
          <ul className="font-mono text-[13px] leading-relaxed text-tinta-media">
            {estado.entradas.map((e) => (
              <li key={e.path}>
                {e.isDir ? "[dir] " : "      "}
                {e.path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
