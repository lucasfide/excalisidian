import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Bot, ClipboardPaste, Copy, Laptop, Lock, Monitor, PenLine, RefreshCw } from "lucide-react";
import "./feature-study.css";
import "./estudo-planos.css";

type Aba = "sincronizar" | "ia";
type Etapa = "parado" | "enviando" | "servidor" | "recebendo" | "chegou";
type EstadoSugestao = "sugestao" | "copiado" | "colado" | "dispensado";

const abas: { id: Aba; rotulo: string }[] = [
  { id: "sincronizar", rotulo: "Sincronizar" },
  { id: "ia", rotulo: "IA" },
];

// Trechos de exemplo do que o servidor guarda: só texto cifrado, sem relação com o conteúdo.
const trechosCifrados = ["9f2c a71e 03bd…", "c4e8 51a0 7d3f…", "2b96 e0c4 a85d…", "d71a 3f6b 90e2…"];

const duracaoDaEtapaMs = 650;

function preferePoucoMovimento() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Sincronizar() {
  const [notebookMarcado, setNotebookMarcado] = useState(false);
  const [desktopMarcado, setDesktopMarcado] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("parado");
  const [indiceTrecho, setIndiceTrecho] = useState(0);
  const [versaoDesktop, setVersaoDesktop] = useState(0);
  const [aviso, setAviso] = useState("");
  const temporizadores = useRef<number[]>([]);

  useEffect(() => () => temporizadores.current.forEach(window.clearTimeout), []);

  const agendar = (acao: () => void, atrasoMs: number) => {
    temporizadores.current.push(window.setTimeout(acao, atrasoMs));
  };

  const editar = () => {
    if (etapa !== "parado") return;
    const novo = !notebookMarcado;
    setNotebookMarcado(novo);
    setAviso("");
    const proximoTrecho = (indiceTrecho + 1) % trechosCifrados.length;
    const concluir = () => {
      setDesktopMarcado(novo);
      setVersaoDesktop(versao => versao + 1);
      setAviso("A mudança chegou ao desktop.");
    };
    if (preferePoucoMovimento()) {
      setIndiceTrecho(proximoTrecho);
      concluir();
      return;
    }
    setEtapa("enviando");
    agendar(() => {
      setIndiceTrecho(proximoTrecho);
      setEtapa("servidor");
    }, duracaoDaEtapaMs);
    agendar(() => setEtapa("recebendo"), duracaoDaEtapaMs * 2);
    agendar(() => {
      concluir();
      setEtapa("chegou");
    }, duracaoDaEtapaMs * 3);
    agendar(() => setEtapa("parado"), duracaoDaEtapaMs * 3 + 700);
  };

  const marca = (marcado: boolean) => (marcado ? "- [x] Ler fontes" : "- [ ] Ler fontes");

  return (
    <div className="estudo-planos__painel">
      <div className="estudo-planos__sync" data-etapa={etapa}>
        <div className="estudo-planos__janela">
          <div className="estudo-planos__janela-barra">
            <Laptop size={12} aria-hidden="true" />
            <span>notebook</span>
          </div>
          <div className="estudo-planos__janela-corpo">
            <span className="estudo-planos__linha estudo-planos__linha--titulo"># Projeto</span>
            <span className="estudo-planos__linha">Reunião quinta</span>
            <span className="estudo-planos__linha">- [x] Escrever</span>
            <span className="estudo-planos__linha estudo-planos__linha--editada" data-mudou={notebookMarcado}>
              {marca(notebookMarcado)}
            </span>
          </div>
          <span className="estudo-planos__estado" data-ocupado={etapa === "enviando"}>
            {etapa === "enviando" ? "enviando…" : "sincronizado"}
          </span>
        </div>

        <div className="estudo-planos__meio">
          <span className="estudo-planos__fio estudo-planos__fio--ida" aria-hidden="true" />
          <div className="estudo-planos__cifra" data-vendo={etapa === "servidor"}>
            <Lock size={11} aria-hidden="true" />
            <span className="estudo-planos__cifra-texto">{trechosCifrados[indiceTrecho]}</span>
            <span className="estudo-planos__cifra-rotulo">servidor</span>
          </div>
          <span className="estudo-planos__fio estudo-planos__fio--volta" aria-hidden="true" />
        </div>

        <div className="estudo-planos__janela">
          <div className="estudo-planos__janela-barra">
            <Monitor size={12} aria-hidden="true" />
            <span>desktop</span>
          </div>
          <div className="estudo-planos__janela-corpo">
            <span className="estudo-planos__linha estudo-planos__linha--titulo"># Projeto</span>
            <span className="estudo-planos__linha">Reunião quinta</span>
            <span className="estudo-planos__linha">- [x] Escrever</span>
            <span
              className="estudo-planos__linha estudo-planos__linha--editada"
              key={versaoDesktop}
              data-chegou={versaoDesktop > 0}
            >
              {marca(desktopMarcado)}
            </span>
          </div>
          <span className="estudo-planos__estado" data-ocupado={etapa === "recebendo"}>
            {etapa === "recebendo" ? "recebendo…" : "sincronizado"}
          </span>
        </div>
      </div>

      <button type="button" className="estudo-planos__acao" onClick={editar} aria-disabled={etapa !== "parado"}>
        <PenLine size={14} aria-hidden="true" />
        Editar no notebook
      </button>
      <div className="estudo-planos__legenda">
        O servidor só vê isso: texto cifrado. Não lê o conteúdo, nem os nomes dos arquivos, nem quantas notas existem.
      </div>
      <span className="estudo-planos__aviso" role="status">
        {aviso}
      </span>
    </div>
  );
}

function Ia() {
  const [estado, setEstado] = useState<EstadoSugestao>("sugestao");

  return (
    <div className="estudo-planos__painel">
      <div className="estudo-planos__ia">
        <div className="estudo-planos__janela estudo-planos__janela--nota">
          <div className="estudo-planos__janela-barra">
            <span>projeto.md</span>
          </div>
          <div className="estudo-planos__janela-corpo">
            <span className="estudo-planos__linha estudo-planos__linha--titulo"># Projeto</span>
            <span className="estudo-planos__linha estudo-planos__linha--livre">
              Reunião de quinta: fechar o escopo e listar o que falta.
            </span>
            {estado === "colado" ? (
              <span className="estudo-planos__linha estudo-planos__linha--link" data-novo="true">
                [[Mapa de ideias]]
              </span>
            ) : estado === "copiado" ? (
              <button type="button" className="estudo-planos__colar" onClick={() => setEstado("colado")}>
                <ClipboardPaste size={14} aria-hidden="true" />
                Colar na nota
              </button>
            ) : null}
          </div>
        </div>

        <div className="estudo-planos__cartao" data-estado={estado}>
          <div className="estudo-planos__cartao-topo">
            <Bot size={14} aria-hidden="true" />
            <span>Agente</span>
          </div>
          {estado === "sugestao" && (
            <>
              <div className="estudo-planos__cartao-texto">
                Esta nota fala do mesmo projeto que <code>[[Mapa de ideias]]</code>. Quer um link para ela?
              </div>
              <div className="estudo-planos__cartao-acoes">
                <button type="button" className="estudo-planos__botao estudo-planos__botao--principal" onClick={() => setEstado("copiado")}>
                  <Copy size={13} aria-hidden="true" />
                  Copiar link
                </button>
                <button type="button" className="estudo-planos__botao" onClick={() => setEstado("dispensado")}>
                  Dispensar
                </button>
              </div>
            </>
          )}
          {estado === "copiado" && (
            <div className="estudo-planos__cartao-texto">
              Link copiado. Cole na nota quando quiser: o agente nunca escreve nela por você.
            </div>
          )}
          {estado === "colado" && (
            <>
              <div className="estudo-planos__cartao-texto">As duas notas estão ligadas.</div>
              <div className="estudo-planos__cartao-acoes">
                <button type="button" className="estudo-planos__botao" onClick={() => setEstado("sugestao")}>
                  Ver de novo
                </button>
              </div>
            </>
          )}
          {estado === "dispensado" && (
            <>
              <div className="estudo-planos__cartao-texto">Sugestão dispensada.</div>
              <div className="estudo-planos__cartao-acoes">
                <button type="button" className="estudo-planos__botao" onClick={() => setEstado("sugestao")}>
                  Ver de novo
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="estudo-planos__legenda">
        O agente lê a nota, sugere conexões e responde perguntas.
        <span className="estudo-planos__mono-pequeno">sem chave própria, é só entrar na conta</span>
      </div>
    </div>
  );
}

export function EstudoPlanos() {
  const [aba, setAba] = useState<Aba>("sincronizar");
  const idBase = useId();
  const refs = useRef<Record<Aba, HTMLButtonElement | null>>({ sincronizar: null, ia: null });

  const navegar = (evento: KeyboardEvent<HTMLButtonElement>, atual: number) => {
    let destino = atual;
    if (evento.key === "ArrowRight") destino = (atual + 1) % abas.length;
    else if (evento.key === "ArrowLeft") destino = (atual - 1 + abas.length) % abas.length;
    else if (evento.key === "Home") destino = 0;
    else if (evento.key === "End") destino = abas.length - 1;
    else return;
    evento.preventDefault();
    setAba(abas[destino].id);
    refs.current[abas[destino].id]?.focus();
  };

  return (
    <div className="feature-study estudo-planos">
      <div className="feature-study__bar">
        <RefreshCw size={14} aria-hidden="true" />
        <div role="tablist" aria-label="Como funcionam os planos" className="estudo-planos__abas">
          {abas.map((item, indice) => (
            <button
              key={item.id}
              ref={elemento => {
                refs.current[item.id] = elemento;
              }}
              type="button"
              role="tab"
              id={`${idBase}-aba-${item.id}`}
              aria-selected={aba === item.id}
              aria-controls={`${idBase}-painel-${item.id}`}
              tabIndex={aba === item.id ? 0 : -1}
              className="estudo-planos__aba"
              onClick={() => setAba(item.id)}
              onKeyDown={evento => navegar(evento, indice)}
            >
              {item.rotulo}
            </button>
          ))}
        </div>
        <span>04</span>
      </div>
      <div className="estudo-planos__paineis">
      {abas.map(item => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${idBase}-painel-${item.id}`}
          aria-labelledby={`${idBase}-aba-${item.id}`}
          hidden={aba !== item.id}
        >
          {item.id === "sincronizar" ? <Sincronizar /> : <Ia />}
        </div>
      ))}
      </div>
    </div>
  );
}
