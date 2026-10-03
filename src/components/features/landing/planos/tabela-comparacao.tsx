import { linhasComparacao, planos } from "../../../../data/planos";

interface TabelaComparacaoProps {
  idTitulo: string;
}

export function TabelaComparacao({ idTitulo }: TabelaComparacaoProps) {
  return (
    <div className="pagina-planos__tabela-moldura">
      <table className="pagina-planos__tabela" aria-labelledby={idTitulo}>
        <thead>
          <tr>
            <th scope="col">Recurso</th>
            {planos.map(plano => (
              <th scope="col" key={plano.id} data-recomendado={plano.recomendado}>
                {plano.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhasComparacao.map(linha => (
            <tr key={linha.id}>
              <th scope="row">{linha.rotulo}</th>
              {planos.map(plano => (
                <td key={plano.id} data-recomendado={plano.recomendado}>
                  {linha.valores[plano.id]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
