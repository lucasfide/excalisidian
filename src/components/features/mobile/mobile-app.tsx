import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";

import { useTexto } from "../../../i18n/useTexto";
import { criarDesenho, criarNota } from "../../../vault/criar";
import { nomeExibicao, tipoDoArquivo } from "../../../vault/arvore";
import { useVaultStore } from "../../../estado/vaultStore";
import { useDocumentosStore } from "../../../estado/documentosStore";
import { instalarNavegacaoMobile } from "../../../estado/workspaceStore";
import { flusharTudoAntesDeSair } from "../../../estado/flushGeral";
import { listarVaultsMobile, criarVaultMobile, selecionarVaultMobile } from "../../../mobile/vaults-mobile";
import type { RegistroVaultsMobile, VaultMobile } from "../../../types/vault-mobile";
import type { NavegacaoMobile } from "../../../types/navegacao-mobile";
import type { VaultAdapter } from "../../../vault/VaultAdapter";
import { usePrefsStore } from "../../../estado/prefsStore";
import EditorNota from "../../../editor/EditorNota";
import { parseDesenho } from "../../../canvas/formatoDesenho";
import { flushMobileConcluido } from "../../../mobile/flush-mobile";
import { conectarSistemaAndroid } from "../../../mobile/android-system-ui";
import "../../../mobile/mobile.css";

interface MobileAppProps {}
const EditorDesenho = lazy(() => import("../../../canvas/EditorDesenho"));

export default function MobileApp(_props: MobileAppProps) {
  const t = useTexto();
  const entries = useVaultStore((state) => state.entradas);
  const docs = useDocumentosStore((state) => state.docs);
  const tema = usePrefsStore((state) => state.tema);
  const [registro, setRegistro] = useState<RegistroVaultsMobile | null>(null);
  const [vault, setVault] = useState<VaultMobile | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [somenteLeitura, setSomenteLeitura] = useState(true);
  const [modoTexto, setModoTexto] = useState(false);
  const [canvasPendente, setCanvasPendente] = useState(false);
  const [nomeVault, setNomeVault] = useState("");
  const [nomeDocumento, setNomeDocumento] = useState("");
  const [modoCriacao, setModoCriacao] = useState<"nota" | "desenho" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [operacaoVault, setOperacaoVault] = useState(false);
  const doc = path ? docs.get(path) : undefined;

  const drenar = useCallback(async (): Promise<boolean> => {
    try {
      const resultado = await flusharTudoAntesDeSair();
      if (flushMobileConcluido(resultado)) {
        setCanvasPendente(false);
        return true;
      }
    } catch {
      // Falha inesperada de flush também bloqueia navegação e mantém o conteúdo em tela.
    }
    {
      setErro(t("mobile.avisoPendencias"));
      return false;
    }
  }, [t]);

  const recarregarVaults = useCallback(async () => {
    setRegistro(await listarVaultsMobile());
  }, []);

  useEffect(() => {
    void recarregarVaults().catch((reason: unknown) => {
      setErro(reason instanceof Error ? reason.message : t("mobile.erro"));
    }).finally(() => setCarregando(false));
  }, [recarregarVaults, t]);

  useEffect(() => {
    void usePrefsStore.getState().carregar();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let desconectarSistema = () => {};
    const aplicarTema = () => {
      const escuro = tema === "escuro" || (tema === "sistema" && media.matches);
      document.documentElement.classList.toggle("dark", escuro);
      desconectarSistema();
      desconectarSistema = conectarSistemaAndroid(escuro);
    };
    aplicarTema();
    media.addEventListener("change", aplicarTema);
    return () => {
      media.removeEventListener("change", aplicarTema);
      desconectarSistema();
    };
  }, [tema]);

  useEffect(() => {
    const aoSuspender = () => {
      if (document.visibilityState === "hidden") void drenar();
    };
    const aoPerderFoco = () => void drenar();
    document.addEventListener("visibilitychange", aoSuspender);
    window.addEventListener("blur", aoPerderFoco);
    window.addEventListener("pagehide", aoPerderFoco);
    return () => {
      document.removeEventListener("visibilitychange", aoSuspender);
      window.removeEventListener("blur", aoPerderFoco);
      window.removeEventListener("pagehide", aoPerderFoco);
    };
  }, [drenar]);

  const abrirDocumento = useCallback(async (novoPath: string) => {
    if (path && path !== novoPath && !(await drenar())) return;
    setErro(null);
    setPath(novoPath);
    setSomenteLeitura(true);
    setModoTexto(false);
    setCanvasPendente(false);
    try {
      await useDocumentosStore.getState().abrir(novoPath);
    } catch {
      setErro(t("mobile.erro"));
    }
  }, [drenar, path, t]);

  const navegacao = useMemo<NavegacaoMobile>(() => ({
    abrirDocumento: (novoPath) => abrirDocumento(novoPath),
    abrirComoTexto: (novoPath) => {
      void (async () => {
        try {
          if (path && path !== novoPath && !(await drenar())) return;
          if (!useDocumentosStore.getState().docs.has(novoPath)) await useDocumentosStore.getState().abrir(novoPath);
          setErro(null);
          setPath(novoPath);
          setModoTexto(true);
          setSomenteLeitura(true);
        } catch {
          setErro(t("mobile.erro"));
        }
      })();
    },
    abrirInicio: () => {
      if (!path) return;
      void drenar().then((ok) => { if (ok) setPath(null); });
    },
    renomearDocumento: (antigo, novo) => setPath((atual) => atual === antigo ? novo : atual),
    fecharAbasDoCaminho: (fechado) => setPath((atual) => atual === fechado ? null : atual),
  }), [abrirDocumento, drenar, path, t]);

  useEffect(() => {
    instalarNavegacaoMobile(navegacao);
    return () => instalarNavegacaoMobile(null);
  }, [navegacao]);

  const abrirVault = useCallback(async (escolhido: { vault: VaultMobile; adapter: VaultAdapter }, pendenciasDrenadas = false) => {
    if (vault && !pendenciasDrenadas && !(await drenar())) return;
    setCarregando(true);
    setErro(null);
    try {
      for (const caminho of useDocumentosStore.getState().docs.keys()) {
        useDocumentosStore.getState().fechar(caminho);
      }
      await useVaultStore.getState().definirAdapter(escolhido.adapter);
      setVault(escolhido.vault);
      setPath(null);
      setRegistro(await listarVaultsMobile());
    } catch (reason) {
      setErro(reason instanceof Error ? reason.message : t("mobile.erro"));
    } finally {
      setCarregando(false);
    }
  }, [drenar, t, vault]);

  const criarVault = useCallback(async () => {
    setErro(null);
    setOperacaoVault(true);
    try {
      if (vault && !(await drenar())) return;
      const criado = await criarVaultMobile(nomeVault);
      setNomeVault("");
      await abrirVault(criado, Boolean(vault));
    } catch (reason) {
      setErro(reason instanceof Error ? reason.message : t("mobile.erro"));
    } finally {
      setOperacaoVault(false);
    }
  }, [abrirVault, drenar, nomeVault, t, vault]);

  const criarDocumento = useCallback(async () => {
    if (!modoCriacao || !nomeDocumento.trim()) return;
    setErro(null);
    try {
      const resultado = modoCriacao === "nota"
        ? await criarNota(nomeDocumento, "")
        : await criarDesenho(nomeDocumento, "");
      if (!resultado.ok) throw new Error(resultado.motivo);
      setModoCriacao(null);
      setNomeDocumento("");
      abrirDocumento(resultado.caminho);
    } catch (reason) {
      setErro(reason instanceof Error ? reason.message : t("mobile.erro"));
    }
  }, [abrirDocumento, modoCriacao, nomeDocumento, t]);

  const voltarDocumento = useCallback(async () => {
    if (!(await drenar())) return;
    setPath(null);
  }, [drenar]);

  const aoEditarDocumento = useCallback((conteudo: string) => {
    if (path && tipoDoArquivo(path) === "drawing" && !modoTexto) setCanvasPendente(true);
    if (path) useDocumentosStore.getState().editar(path, conteudo);
  }, [modoTexto, path]);

  let desenhoInvalido = false;
  if (path && doc && tipoDoArquivo(path) === "drawing" && !modoTexto) {
    try { desenhoInvalido = parseDesenho(doc.conteudoEditor).cenaInvalida === true; }
    catch { desenhoInvalido = true; }
  }

  const status = canvasPendente
    ? t("mobile.pendente")
    : !doc || doc.estado === "limpo" || doc.estado === "salvo"
    ? t("mobile.salvo")
    : doc.estado === "salvando" ? t("mobile.salvando")
    : doc.estado === "erro" ? t("mobile.erroSalvar")
    : t("mobile.pendente");
  const documentoBloqueado = doc?.estado === "orfao" || doc?.estado === "conflito";

  return (
    <main className="mobile-app">
      {path ? (
        <>
          <header className="mobile-app__header mobile-app__header--document">
            <div className="mobile-app__document-heading">
              <button className="mobile-app__button" onClick={() => void voltarDocumento()}>{t("mobile.voltar")}</button>
              <strong className="mobile-app__title">{nomeExibicao({ path, nome: path.slice(path.lastIndexOf("/") + 1), tipo: tipoDoArquivo(path), filhos: [] })}</strong>
            </div>
            {doc && <span className="mobile-app__document-status" aria-live="polite">{status}</span>}
            <div className="mobile-app__document-actions">
              {doc && !documentoBloqueado && !desenhoInvalido && <button className="mobile-app__button" onClick={() => void (async () => {
                if (!somenteLeitura && !(await drenar())) return;
                setSomenteLeitura((value) => !value);
              })()}>{somenteLeitura ? t("mobile.editar") : t("mobile.ler")}</button>}
              {doc && !documentoBloqueado && !somenteLeitura && <button className="mobile-app__button mobile-app__button--primary" onClick={() => void drenar()}>{t("mobile.salvar")}</button>}
            </div>
          </header>
          {!doc ? <p className="mobile-app__notice">{t("mobile.carregando")}</p> : desenhoInvalido ? (
            <section className="mobile-app__content">
              <p role="alert" className="mobile-app__error">{t("mobile.cenaInvalida")}</p>
              <button className="mobile-app__button" onClick={() => setModoTexto(true)}>{t("mobile.abrirTexto")}</button>
            </section>
          ) : documentoBloqueado ? (
            <p role="alert" className="mobile-app__error">{t("mobile.documentoIndisponivel")}</p>
          ) : (
            <>
              {erro && <p role="alert" className="mobile-app__error">{erro}</p>}
              <section className={tipoDoArquivo(path) === "drawing" && !modoTexto ? "mobile-app__canvas" : "mobile-app__editor"}>
              {tipoDoArquivo(path) === "drawing" && !modoTexto ? (
                <Suspense fallback={<p className="mobile-app__notice">{t("mobile.carregando")}</p>}>
                  <EditorDesenho caminho={path} conteudoInicial={doc.conteudoEditor} versao={doc.versao} onEditar={aoEditarDocumento} somenteLeitura={somenteLeitura} mobileShell />
                </Suspense>
              ) : (
                <EditorNota caminho={path} conteudoInicial={doc.conteudoEditor} onEditar={aoEditarDocumento} onBlur={() => undefined} somenteLeitura={somenteLeitura} mobileShell />
              )}
              </section>
            </>
          )}
        </>
      ) : (
        <>
          <header className="mobile-app__header"><strong>{vault?.nome ?? t("mobile.titulo")}</strong></header>
          <section className="mobile-app__content">
            <p className="mobile-app__notice">{t("mobile.local")}</p>
            {erro && <p role="alert" className="mobile-app__error">{erro}</p>}
            {!vault ? (
              <>
                <h1>{t("mobile.vaults")}</h1>
                {carregando ? <p className="mobile-app__notice">{t("mobile.carregando")}</p> : null}
                {registro?.vaults.map((item) => (
                  <div className="mobile-app__row" key={item.id}>
                    <strong>{item.nome}</strong>
                    <button disabled={operacaoVault} className="mobile-app__button" onClick={() => void (async () => {
                      try {
                        setOperacaoVault(true);
                        if (vault && !(await drenar())) return;
                        const escolhido = await selecionarVaultMobile(item.id);
                        await abrirVault(escolhido, Boolean(vault));
                      } catch (reason) {
                        setErro(reason instanceof Error ? reason.message : t("mobile.erro"));
                      } finally {
                        setOperacaoVault(false);
                      }
                    })()}>{t("mobile.abrir")}</button>
                  </div>
                ))}
                <form className="mobile-app__actions" onSubmit={(event) => { event.preventDefault(); void criarVault(); }}>
                  <input className="mobile-app__input" value={nomeVault} onChange={(event) => setNomeVault(event.target.value)} placeholder={t("mobile.nomeVault")} aria-label={t("mobile.nomeVault")} />
                  <button className="mobile-app__button mobile-app__button--primary" disabled={!nomeVault.trim() || operacaoVault}>{t("mobile.novoVault")}</button>
                </form>
              </>
            ) : (
              <>
                <div className="mobile-app__actions">
                  <button className="mobile-app__button mobile-app__button--primary" onClick={() => setModoCriacao("nota")}>{t("mobile.nota")}</button>
                  <button className="mobile-app__button" onClick={() => setModoCriacao("desenho")}>{t("mobile.desenho")}</button>
                  <button className="mobile-app__button" onClick={() => void drenar().then((ok) => { if (ok) { setVault(null); setPath(null); } })}>{t("mobile.vaults")}</button>
                </div>
                {modoCriacao && (
                  <form className="mobile-app__actions" onSubmit={(event) => { event.preventDefault(); void criarDocumento(); }}>
                    <input className="mobile-app__input" autoFocus value={nomeDocumento} onChange={(event) => setNomeDocumento(event.target.value)} placeholder={t("mobile.nomeDocumento")} aria-label={t("mobile.nomeDocumento")} />
                    <button className="mobile-app__button mobile-app__button--primary" disabled={!nomeDocumento.trim()}>{t("mobile.criar")}</button>
                    <button type="button" className="mobile-app__button" onClick={() => setModoCriacao(null)}>{t("mobile.voltar")}</button>
                  </form>
                )}
                <h1>{t("mobile.arquivos")}</h1>
                {entries.filter((entry) => !entry.isDir && /\.md$/i.test(entry.path)).map((entry) => (
                  <button key={entry.path} className="mobile-app__row w-full text-left" onClick={() => abrirDocumento(entry.path)}>{entry.path}</button>
                ))}
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
