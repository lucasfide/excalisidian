import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";

import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import { useVaultStore } from "../../estado/vaultStore";
import {
  comandoAbrirPastaAnexos,
  comandoCopiarEmbedMarkdown,
  comandoCopiarImagem,
  comandoExcluirAnexo,
  comandoIrParaNotaDoAnexo,
  criarUrlTemporariaDaImagem,
} from "../../app/comandos/galeria-anexos";
import {
  filtrarImagensAnexos,
  type ImagemAnexo,
  type UrlBlobRevogavel,
} from "../../vault/galeria-anexos";
import { BotaoIcone, cn } from "../index";
import VisualizadorImagem from "./VisualizadorImagem";
import "./galeria-anexos.css";

type EstadoImagem =
  | { status: "carregando"; imagem: ImagemAnexo }
  | { status: "pronta"; imagem: ImagemAnexo; url: string }
  | { status: "erro"; imagem: ImagemAnexo; mensagem: string };

interface AcaoImagemProps {
  titulo: string;
  onClick(): void;
  Icone: typeof Clipboard;
  destrutiva?: boolean;
}

export default function GaleriaAnexos() {
  const entradas = useVaultStore((estado) => estado.entradas);
  const adapter = useVaultStore((estado) => estado.adapter);
  const imagens = useMemo(() => filtrarImagensAnexos(entradas), [entradas]);
  const fecharSobreposicao = useSobreposicaoStore((estado) => estado.fechar);
  const [estados, setEstados] = useState<Record<string, EstadoImagem>>({});
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<Set<string>>(new Set());
  const cardsRef = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  useEffect(() => {
    if (imagemAberta) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      fecharSobreposicao();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [fecharSobreposicao, imagemAberta]);

  useEffect(() => {
    let ativo = true;
    const revogaveis = new Map<string, UrlBlobRevogavel>();

    setEstados(
      Object.fromEntries(
        imagens.map((imagem) => [imagem.path, { status: "carregando", imagem }]),
      ),
    );

    if (!adapter) {
      setEstados(
        Object.fromEntries(
          imagens.map((imagem) => [
            imagem.path,
            { status: "erro", imagem, mensagem: "Nenhum vault aberto." },
          ]),
        ),
      );
      return () => {
        ativo = false;
      };
    }

    for (const imagem of imagens) {
      void adapter
        .lerBinario(imagem.path)
        .then((bytes) => {
          const blob = criarUrlTemporariaDaImagem(bytes, imagem.path);
          if (!ativo) {
            blob.revogar();
            return;
          }
          revogaveis.set(imagem.path, blob);
          setEstados((atuais) => ({
            ...atuais,
            [imagem.path]: { status: "pronta", imagem, url: blob.url },
          }));
        })
        .catch((erro: unknown) => {
          if (!ativo) return;
          const mensagem = erro instanceof Error ? erro.message : "Não foi possível ler a imagem.";
          setEstados((atuais) => ({
            ...atuais,
            [imagem.path]: { status: "erro", imagem, mensagem },
          }));
        });
    }

    return () => {
      ativo = false;
      for (const blob of revogaveis.values()) blob.revogar();
    };
  }, [adapter, imagens]);

  useEffect(() => {
    if (imagemAberta && !estados[imagemAberta]) setImagemAberta(null);
  }, [estados, imagemAberta]);

  const prontas = imagens.filter((imagem) => estados[imagem.path]?.status === "pronta");
  const imagemVisualizada = imagemAberta
    ? prontas.find((imagem) => imagem.path === imagemAberta)
    : undefined;
  const indiceVisualizado = imagemVisualizada
    ? prontas.findIndex((imagem) => imagem.path === imagemVisualizada.path)
    : -1;
  const estadoVisualizado = imagemVisualizada
    ? estados[imagemVisualizada.path]
    : undefined;

  const abrirImagem = (path: string) => {
    if (estados[path]?.status !== "pronta") return;
    setImagemAberta(path);
  };

  const fecharImagem = () => {
    const path = imagemAberta;
    setImagemAberta(null);
    if (!path) return;
    window.requestAnimationFrame(() => cardsRef.current[path]?.focus());
  };

  const navegarImagem = (direcao: -1 | 1) => {
    if (indiceVisualizado < 0 || prontas.length === 0) return;
    const proximo = (indiceVisualizado + direcao + prontas.length) % prontas.length;
    setImagemAberta(prontas[proximo].path);
  };

  const executarExclusao = async (path: string) => {
    setRemovendo((atuais) => new Set(atuais).add(path));
    await comandoExcluirAnexo(path);
    window.setTimeout(() => {
      setRemovendo((atuais) => {
        const novo = new Set(atuais);
        novo.delete(path);
        return novo;
      });
    }, 220);
  };

  return (
    <div className="galeria-anexos" role="dialog" aria-modal="true" aria-labelledby="galeria-anexos-titulo">
      <header className="galeria-anexos__cabecalho">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} strokeWidth={1.5} className="shrink-0 text-cristal" aria-hidden />
            <h1 id="galeria-anexos-titulo" className="font-display text-[20px] font-medium text-tinta">
              Galeria de anexos
            </h1>
            <span className="meta text-tinta-suave">{imagens.length}</span>
          </div>
          <p className="mt-1 max-w-2xl text-pequeno text-tinta-media">
            Clique para ampliar. “Copiar embed Markdown” copia o link para uma nota; clique direito
            na foto copia a imagem para colar em outros aplicativos.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BotaoIcone
            Icone={FolderOpen}
            titulo="Mostrar pasta de anexos"
            onClick={() => void comandoAbrirPastaAnexos()}
          />
          <BotaoIcone Icone={X} titulo="Fechar galeria" onClick={fecharSobreposicao} />
        </div>
      </header>

      <div className="galeria-anexos__corpo">
        {imagens.length === 0 ? (
          <div className="galeria-anexos__vazio">
            <ImageIcon size={28} strokeWidth={1.25} aria-hidden />
            <p className="text-corpo text-tinta">Nenhuma imagem anexada</p>
            <p className="text-pequeno text-tinta-media">
              Imagens coladas nas notas aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="galeria-anexos__grade">
            {imagens.map((imagem, indice) => {
              const estado = estados[imagem.path] ?? { status: "carregando", imagem };
              return (
                <CartaoAnexo
                  key={imagem.path}
                  imagem={imagem}
                  estado={estado}
                  indice={indice}
                  removendo={removendo.has(imagem.path)}
                  cardRef={(elemento) => {
                    cardsRef.current[imagem.path] = elemento;
                  }}
                  onAbrir={() => abrirImagem(imagem.path)}
                  onIrParaNota={() => {
                    void comandoIrParaNotaDoAnexo(imagem.path);
                    fecharSobreposicao();
                  }}
                  onCopiarEmbed={() => void comandoCopiarEmbedMarkdown(imagem.path)}
                  onDeletar={() => void executarExclusao(imagem.path)}
                  onMostrarNoExplorer={() => void comandoAbrirPastaAnexos()}
                  onCopiarImagem={() => void comandoCopiarImagem(imagem.path)}
                />
              );
            })}
          </div>
        )}
      </div>

      {imagemVisualizada && indiceVisualizado >= 0 && (
        <VisualizadorImagem
          imagem={imagemVisualizada}
          url={estadoVisualizado?.status === "pronta" ? estadoVisualizado.url : ""}
          indice={indiceVisualizado}
          total={prontas.length}
          onFechar={fecharImagem}
          onAnterior={() => navegarImagem(-1)}
          onProxima={() => navegarImagem(1)}
        />
      )}
    </div>
  );
}

interface CartaoAnexoProps {
  imagem: ImagemAnexo;
  estado: EstadoImagem;
  indice: number;
  removendo: boolean;
  cardRef(elemento: HTMLElement | null): void;
  onAbrir(): void;
  onIrParaNota(): void;
  onCopiarEmbed(): void;
  onDeletar(): void;
  onMostrarNoExplorer(): void;
  onCopiarImagem(): void;
}

function CartaoAnexo({
  imagem,
  estado,
  indice,
  removendo,
  cardRef,
  onAbrir,
  onIrParaNota,
  onCopiarEmbed,
  onDeletar,
  onMostrarNoExplorer,
  onCopiarImagem,
}: CartaoAnexoProps) {
  return (
    <article
      ref={cardRef}
      tabIndex={0}
      className={cn(
        "galeria-anexos__cartao group motion-safe:animate-[galeria-anexos-cartao_220ms_var(--ease-caderno)_both] motion-reduce:animate-none",
        removendo && "galeria-anexos__cartao--removendo",
      )}
      style={{ animationDelay: `${Math.min(indice, 5) * 20}ms` }}
      onClick={onAbrir}
      onKeyDown={(evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          onAbrir();
        }
      }}
      aria-label={`Abrir ${imagem.nome}`}
    >
      <div className="galeria-anexos__miniatura">
        {estado.status === "pronta" ? (
          <img
            src={estado.url}
            alt={imagem.nome}
            loading="lazy"
            onContextMenu={(evento) => {
              evento.preventDefault();
              void onCopiarImagem();
            }}
          />
        ) : estado.status === "carregando" ? (
          <div className="galeria-anexos__estado-imagem" aria-label="Carregando imagem">
            <LoaderCircle
              size={22}
              className="motion-safe:animate-spin motion-reduce:animate-none text-tinta-suave"
              aria-hidden
            />
          </div>
        ) : (
          <div className="galeria-anexos__estado-imagem galeria-anexos__estado-imagem--erro">
            <ImageIcon size={22} strokeWidth={1.25} aria-hidden />
            <span>{estado.mensagem}</span>
          </div>
        )}

        <div className="galeria-anexos__acoes" aria-label={`Ações para ${imagem.nome}`}>
          <AcaoImagem Icone={ExternalLink} titulo="Ir para nota" onClick={onIrParaNota} />
          <AcaoImagem Icone={Clipboard} titulo="Copiar embed Markdown" onClick={onCopiarEmbed} />
          <AcaoImagem Icone={Trash2} titulo="Deletar anexo" onClick={onDeletar} destrutiva />
          <AcaoImagem Icone={FolderOpen} titulo="Mostrar pasta" onClick={onMostrarNoExplorer} />
        </div>
      </div>
      <div className="galeria-anexos__legenda">
        <span className="truncate text-pequeno text-tinta">{imagem.nome}</span>
        <span className="meta shrink-0 text-tinta-suave">{formatarTamanho(imagem.tamanho)}</span>
      </div>
      <p className="sr-only">Clique direito na imagem para copiar os pixels.</p>
    </article>
  );
}

function AcaoImagem({ Icone, titulo, onClick, destrutiva = false }: AcaoImagemProps) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      className={cn("galeria-anexos__acao", destrutiva && "galeria-anexos__acao--destrutiva")}
      onClick={(evento) => {
        evento.stopPropagation();
        onClick();
      }}
    >
      <Icone size={15} strokeWidth={1.6} aria-hidden />
    </button>
  );
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
