// Parser próprio de wikilink. Usado pelo indexador (aqui) e pela resolução de links. O
// editor vendorizado tem o parser dele para as decorations; os dois concordam no que é um
// "alvo" (target) porque ambos separam `#subcaminho` e `|alias` antes de olhar o resto.
//
// Sintaxe (doc 02 §2):
//   [[Alvo]]  [[Alvo|texto]]  [[Alvo#Título]]  [[Alvo#^bloco]]  [[#Título]]
//   ![[Alvo]] ![[Alvo#Título]] ![[img.png|400]] ![[Desenho.draw|600]]
//
// Depois de separar `#…` e `|…`, o alvo não pode conter `# | ^ [ ]`. Se contiver, o link
// não resolve — a UI mostra como não resolvido, sem travar.

export interface LinkRef {
  /** Conteúdo bruto entre os colchetes: "Projetos/Nota#Título|alias". */
  raw: string;
  /** Alvo já sem `#…` e `|…`, normalizado NFC. "" para link na própria nota (`[[#Título]]`). */
  target: string;
  /** "#Título" ou "#^abc123", se houver. */
  subpath?: string;
  /** Texto de exibição, se houver `|`. Em embed de imagem/desenho pode ser a largura. */
  alias?: string;
  /** Linha 1-based onde o link aparece. */
  line: number;
  /** true para `![[…]]`. */
  embed: boolean;
  /** Texto da linha onde o link aparece, aparado — para o trecho de contexto do backlink. */
  contexto: string;
}

const CARACTERE_PROIBIDO_NO_ALVO = /[#|^[\]]/;

// Captura `![[...]]` ou `[[...]]`. O conteúdo interno não pode conter `[` nem `]`.
const RE_WIKILINK = /(!?)\[\[([^\][]+)\]\]/g;

interface Analise {
  target: string;
  subpath?: string;
  alias?: string;
  invalido: boolean;
}

/** Quebra o miolo de um wikilink em alvo / subcaminho / alias. */
export function analisarMiolo(miolo: string): Analise {
  let resto = miolo;
  let alias: string | undefined;

  const barra = resto.indexOf("|");
  if (barra !== -1) {
    alias = resto.slice(barra + 1).trim();
    resto = resto.slice(0, barra);
  }

  let subpath: string | undefined;
  const cerquilha = resto.indexOf("#");
  if (cerquilha !== -1) {
    subpath = resto.slice(cerquilha); // inclui o "#"
    resto = resto.slice(0, cerquilha);
  }

  const target = resto.trim().normalize("NFC");
  const invalido =
    (target === "" && !subpath) || CARACTERE_PROIBIDO_NO_ALVO.test(target);

  return { target, subpath, alias, invalido };
}

/** Devolve [linha 1-based, texto da linha] para uma posição no texto. */
function linhaEm(texto: string, indice: number): [number, string] {
  let linha = 1;
  let inicioLinha = 0;
  for (let i = 0; i < indice; i++) {
    if (texto.charCodeAt(i) === 10) {
      linha++;
      inicioLinha = i + 1;
    }
  }
  let fimLinha = texto.indexOf("\n", indice);
  if (fimLinha === -1) fimLinha = texto.length;
  return [linha, texto.slice(inicioLinha, fimLinha)];
}

/** Extrai todos os wikilinks (e embeds) de um texto markdown. */
export function extrairLinks(texto: string): LinkRef[] {
  const achados: LinkRef[] = [];
  RE_WIKILINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_WIKILINK.exec(texto)) !== null) {
    const embed = m[1] === "!";
    const miolo = m[2];
    const { target, subpath, alias, invalido } = analisarMiolo(miolo);
    if (invalido) continue;
    const [line, linhaTexto] = linhaEm(texto, m.index);
    achados.push({
      raw: miolo,
      target,
      subpath,
      alias,
      line,
      embed,
      contexto: linhaTexto.trim().slice(0, 200),
    });
  }
  return achados;
}
