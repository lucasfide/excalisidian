interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
}

interface SeletorOpcoesProps<T extends string> {
  nome: string;
  legenda: string;
  opcoes: Opcao<T>[];
  valor: T;
  aoMudar: (valor: T) => void;
}

/** Grupo de rádios estilizado como botões segmentados: setas do teclado e estado anunciado de graça. */
export function SeletorOpcoes<T extends string>({ nome, legenda, opcoes, valor, aoMudar }: SeletorOpcoesProps<T>) {
  return (
    <fieldset className="pagina-planos__seletor">
      <legend>{legenda}</legend>
      <div className="pagina-planos__seletor-opcoes">
        {opcoes.map(opcao => (
          <label className="pagina-planos__opcao" key={opcao.valor}>
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              onChange={() => aoMudar(opcao.valor)}
            />
            <span>{opcao.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
