// Driver WebGL2 do fundo "picos em ASCII" da Home/aba em branco (pedido do usuário,
// 16/09/2026, inspirado no efeito pago "ASCII Peaks" do shaders.com — código original nosso,
// nenhuma linha copiada de lá: a licença deles proíbe até uso em projeto open source fora de
// site de divulgação, ver docs/09 ADR-28). Sem dependência nova: um `<canvas>` com WebGL2 puro.
//
// A cena: um relevo de "montanhas" gerado por ruído (fbm sobre o simplex 2D de Ashima Arts/
// Ian McEwan — webgl-noise, MIT, atribuído no fragment shader — trocado do hash caseiro
// original depois do usuário reportar um relevo quadriculado/áspero) é fatiado numa grade de
// células; cada célula vira um caractere do atlas (gerado em runtime com Canvas2D, fonte
// IBM Plex Mono — `--font-mono`, o mesmo token de metadado do app), na densidade que a altura
// do relevo pedir: baixo = ponto (`.`), alto = glifo cheio (`@`) — a técnica clássica de "ASCII
// art shader", luminância vira caractere, não um raymarch 3D. Por cima do glifo, um halo
// analítico (aproximação de bloom sem segunda passada) imita o brilho do efeito de referência,
// e a cor clareia pro branco nos pontos mais altos em vez de só ficar "mais opaca".
//
// Deliberadamente barato: resolução interna reduzida (o CSS estica de volta, o que também
// amacia o resultado — "bem suave" era o pedido) e opacidade de 15% aplicada por FORA, no
// elemento `<canvas>` (CSS, não dentro do shader) — a lição da barra de formatação desta
// sessão: opacidade de um elemento com conteúdo sólido por trás esconde qualquer coisa, aqui
// não tem nada sólido por trás pra esconder, e manter a opacidade fora do shader deixa o
// número "15%" num lugar só, fácil de ajustar sem mexer em GLSL.

// 15 -> 26 (pedido do usuário, 16/09/2026: "zoom" e objetos mais próximos da tela) — célula
// maior é literalmente menos células cabendo na tela, o que também encolhe o trecho do ruído
// mostrado (o "zoom" e o "mais perto" vêm do mesmo ajuste).
const TAMANHO_CELULA_PX = 26;
/** Rampa de escuro pro claro — mesma ideia de "ASCII art": luminância mais alta, caractere
 * com mais tinta. Só os símbolos monoespaçados comuns, sem depender de fonte com glifos raros.
 * Exportada só pro teste conferir que a rampa nunca fica vazia (o shader divide por ela). */
export const RAMPA_CARACTERES = [" ", ".", ":", "o", "0", "8", "@"];
const RESOLUCAO_INTERNA_MAX_DPR = 1;
const FATOR_REDUCAO_RESOLUCAO = 0.6;
/** Raio (em px de CLIENTE, o mesmo espaço de `uTamanhoCelula` antes da conversão pro buffer) do
 * brilho/deslocamento de cada ponto do rastro do mouse. 240px (subiu de 190 — pedido do
 * usuário, 16/09/2026: "o rastro tem que ser maior"): perto o bastante pra sentir "resposta ao
 * cursor", longe o bastante pra não cobrir a tela toda em telas pequenas. */
const RAIO_MOUSE_PX = 240;
/** Rastro (pedido do usuário, 16/09/2026: "algo mais fluido, que deixasse um rastro e fosse
 * sumindo aos poucos" — a v1 só reagia à posição atual do cursor, sem memória nenhuma). Cada
 * ponto vive `VIDA_RASTRO_MS`, com o peso caindo com o tempo (curva quadrática — decai devagar
 * no início, rápido no fim; é o que lê como "sumindo", não um corte seco). `MAX_PONTOS_RASTRO`
 * PRECISA bater com o tamanho de `uRastroPos`/`uRastroPeso` no fragment shader (arrays de
 * tamanho fixo em GLSL — mudou aqui, muda lá também). `DISTANCIA_MIN_NOVO_PONTO_PX` evita
 * empilhar pontos praticamente no mesmo lugar quando o mouse anda devagar.
 *
 * Segunda rodada (16/09/2026): vida 750ms -> 2200ms e limite 24 -> 48 pontos — pedido do
 * usuário era um rastro maior que se dispersa mais devagar; um sozinho sem o outro não
 * bastava (vida mais longa com o mesmo limite de pontos só deixa o rastro mais ESPARSO, não
 * maior — os pontos antigos são descartados pelo limite antes de terem tempo de sumir de
 * verdade pela idade).
 *
 * Terceira rodada (16/09/2026): "o rastro está sumindo mto rápido" — mesma lição de novo, os
 * dois valores sobem juntos (vida 2200ms -> 3400ms, limite 48 -> 72 pontos; RASTRO_MAX no
 * fragment shader abaixo TAMBÉM precisa acompanhar). */
const MAX_PONTOS_RASTRO = 72;
const VIDA_RASTRO_MS = 3400;
const DISTANCIA_MIN_NOVO_PONTO_PX = 10;
/** Um ciclo completo do relevo "respirando" a cada ~50s — devagar o bastante pra nunca chamar
 * atenção, rápido o bastante pra não parecer uma imagem estática travada. */
const VELOCIDADE_DERIVA = (Math.PI * 2) / 50;
/** Otimização de GPU (achado do usuário, 16/09/2026: 30–50% de uma Iris Xe integrada) — alvo
 * de 24fps (30 -> 24, pedido do usuário na mesma rodada) só pro DESENHO de verdade (uniforms +
 * drawArrays), não pro laço de `rAF` em si. A deriva automática e o rastro do mouse são lentos
 * e suaves de propósito; nenhum dos dois precisa de mais que isso pra continuar parecendo
 * fluido, e cortar quantas vezes o fragment shader roda por segundo (menos de metade numa tela
 * de 60Hz, ainda menos em telas de 120Hz+) é o maior corte de custo disponível SEM mexer numa
 * linha da matemática visual já ajustada nesta
 * sessão (relevo, brilho, cor, rastro) — o relógio (`tempo`) e a poda do rastro continuam
 * andando a cada quadro de rAF, só o desenho em si é que pula quadros, então a deriva não
 * acelera nem "pula" quando volta a desenhar. */
const INTERVALO_DESENHO_MS = 1000 / 24;

const VERTEX_SRC = `#version 300 es
// Triângulo cheio de tela sem buffer de vértice: truque padrão do WebGL2 — 3 vértices
// gerados a partir de gl_VertexID cobrem a tela inteira, sobrando fora da viewport.
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `#version 300 es
precision mediump float;

uniform vec2 uResolucao;
uniform float uTempo;
uniform float uTamanhoCelula;
uniform vec3 uCor;
uniform sampler2D uAtlas;
uniform float uContagemCaracteres;
// Rastro do mouse: até RASTRO_MAX pontos vivos, já em pixels do BUFFER interno (mesmas
// unidades de gl_FragCoord/uResolucao) — a conversão de px de cliente pro buffer acontece no
// JS, dentro de \`desenhar()\`, reaproveitando a mesma razão \`canvas.width/canvas.clientWidth\`
// que \`uTamanhoCelula\` já usa (ver comentário lá; não duplicar a lógica de escala aqui).
// \`uRastroPeso[i] <= 0.0\` é um slot vazio (ponto já apagado, ou nunca usado) — o JS sempre
// manda os RASTRO_MAX slots preenchidos, zerando o peso dos que não têm ponto de verdade em
// vez de mandar menos elementos (arrays de uniform em GLSL são de tamanho fixo).
// RASTRO_MAX PRECISA bater com MAX_PONTOS_RASTRO do lado JS deste arquivo.
const int RASTRO_MAX = 72;
uniform vec2 uRastroPos[RASTRO_MAX];
uniform float uRastroPeso[RASTRO_MAX];
// Quantos dos RASTRO_MAX slots têm ponto de verdade agora (sempre igual a rastro.length no
// JS) — deixa o laço do rastro sair mais cedo (\`break\`) em vez de sempre passar pelos 48,
// mesmo com o mouse parado ou o rastro vazio. Otimização de GPU (achado do usuário: 30–50% de
// consumo numa Iris Xe integrada) — sem mudar NADA da matemática visual do rastro em si.
uniform int uRastroContagem;
uniform float uRaioMouse;

out vec4 corSaida;

// Simplex noise 2D — Ian McEwan, Ashima Arts (webgl-noise, MIT License).
// https://github.com/ashima/webgl-noise — mantido igual ao original, só os nomes das
// variáveis auxiliares (nenhum identificador público) foram deixados como estavam.
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// fbm de 4 oitavas sobre o simplex acima — bem mais suave que ruído de valor (hash + mix),
// que dava um relevo quadriculado/áspero (achado do usuário, 16/09/2026). Normaliza pra 0..1.
float fbm(vec2 p) {
  float soma = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    soma += snoise(p) * amplitude;
    p *= 2.02;
    amplitude *= 0.5;
  }
  return soma * 0.5 + 0.5;
}

void main() {
  vec2 celula = floor(gl_FragCoord.xy / uTamanhoCelula);
  vec2 uvCelula = fract(gl_FragCoord.xy / uTamanhoCelula);
  vec2 uvTela = gl_FragCoord.xy / uResolucao;

  // Rastro do mouse — numa passada só, antes do relevo, porque alimenta DUAS coisas que
  // precisam da mesma distância por ponto: o deslocamento que empurra a amostra do ruído
  // (pedido do usuário: "movimentar os elementos de fundo") e o brilho mais forte entre os
  // pontos ainda vivos (aplicado depois de calcular \`altura\`, mais abaixo). Ponto com
  // \`uRastroPeso[i] <= 0.0\` é slot vazio — \`continue\` pula sem custo de mais nada.
  vec2 deslocamentoRastro = vec2(0.0);
  float boostRastro = 0.0;
  for (int i = 0; i < RASTRO_MAX; i++) {
    // Sai do laço assim que passa da contagem de verdade — na maior parte do tempo (mouse
    // parado, ou o rastro ainda curto) isso poupa quase todas as RASTRO_MAX iterações, em
    // TODO pixel, em TODO quadro. O \`continue\` abaixo continua existindo por segurança, mas
    // sozinho não evitava o CUSTO de ler \`uRastroPeso\`/\`uRastroPos\` pros slots vazios.
    if (i >= uRastroContagem) break;
    float peso = uRastroPeso[i];
    if (peso <= 0.0) continue;
    vec2 delta = gl_FragCoord.xy - uRastroPos[i];
    float d = length(delta);
    // \`normalize\` de vetor zero é indefinido — \`+ 0.0001\` evita NaN bem em cima do ponto.
    // A queda exponencial (não o \`smoothstep\` do brilho, de propósito) dá um empurrão que já
    // nasce no talo e cai suave, sem a borda dura que um raio fixo deixaria no relevo. Raio
    // \`* 1.6\` no denominador: queda mais larga e gradual — com até RASTRO_MAX pontos vivos,
    // uma queda apertada fazia cada ponto do rastro empurrar num raio curto e isolado, lendo
    // como vários puxões separados ("revolto", achado do usuário) em vez de uma esteira só.
    deslocamentoRastro += normalize(delta + 0.0001) * peso
      * exp(-d * d / (uRaioMouse * uRaioMouse * 1.6)) * uRaioMouse * 0.12;
    // smoothstep exige edge0 < edge1 (edge0 > edge1 é indefinido pela spec, já causou um bug
    // real nesta sessão) — por isso os limites vêm em 0.0 < uRaioMouse, e o resultado é
    // invertido manualmente pra virar "1.0 perto do ponto, 0.0 na borda do raio".
    float alcance = 1.0 - smoothstep(0.0, uRaioMouse, d);
    boostRastro = max(boostRastro, alcance * peso);
  }
  // Teto no deslocamento COMBINADO (não por ponto): a soma de até RASTRO_MAX empurrões, cada
  // um puxando pro seu próprio lado, podia se somar bem mais forte que qualquer um sozinho —
  // era a outra metade do "revolto". Preserva a direção da soma, só limita o comprimento.
  float comprimentoDeslocamento = length(deslocamentoRastro);
  float limiteDeslocamento = uRaioMouse * 0.3;
  if (comprimentoDeslocamento > limiteDeslocamento) {
    deslocamentoRastro *= limiteDeslocamento / comprimentoDeslocamento;
  }

  // Relevo: ruído lento à deriva, mais "montanha" perto do centro-baixo da tela (a mesma
  // composição do efeito de referência — um aglomerado de picos, não ruído uniforme). O rastro
  // desloca a amostra por perto de onde o mouse passou — 0.0025 converte pixels de tela numa
  // distância pequena no espaço do ruído (a mesma escala de \`celula * 0.06\` logo abaixo).
  vec2 amostra = celula * 0.06 + vec2(uTempo * 0.15, uTempo * 0.07) + deslocamentoRastro * 0.0025;
  float altura = fbm(amostra);
  // Raio do aglomerado maior (pedido do usuário: mais perto/mais zoom) — o pico ocupa mais
  // da tela em vez de ficar pequeno no meio de um fundo quase vazio.
  vec2 centro = uvTela - vec2(0.5, 0.62);
  float distanciaDoPico = length(centro * vec2(1.0, 1.2));
  altura *= 1.0 - smoothstep(0.1, 1.05, distanciaDoPico);

  // Contraste (pedido do usuário: "a variação de opacidade deve ser maior") — sem isto o fbm
  // fica todo espremido perto de 0.4–0.6 e a grade inteira lê como um cinza uniforme. Este
  // smoothstep empurra os vales pra perto de 0 e os picos pra perto de 1, então a diferença
  // entre "quase apagado" e "brilhando" fica bem mais evidente — em tudo que usa \`altura\`
  // depois (glifo, halo, cor), não só no alfa final.
  altura = smoothstep(0.32, 0.8, altura);

  // Brilho do rastro: reaproveita o MESMO pipeline abaixo (núcleo, halo, cor) em vez de uma
  // segunda camada de brilho paralela — é só mais uma fonte de "altura alta" pro resto do
  // shader, igual um pico do relevo. Teto de 0.85 (não 1.0): fica visivelmente mais forte que
  // o relevo em repouso sem chegar ao branco mais puro da rampa.
  altura = max(altura, boostRastro * 0.85);

  // Núcleo: o glifo de verdade do atlas, na célula que a altura pedir.
  float indice = floor(clamp(altura, 0.0, 0.999) * uContagemCaracteres);
  vec2 uvAtlas = vec2((indice + uvCelula.x) / uContagemCaracteres, uvCelula.y);
  float nucleo = texture(uAtlas, uvAtlas).a;

  // Halo: sem isto o resultado é uma grade plana de caracteres translúcidos — no efeito de
  // referência cada ponto brilhante "vaza" luz pros vizinhos. Cai com o quadrado da distância
  // ao CENTRO da célula (não da tela) e escala com a altura, então só os pontos altos brilham
  // de verdade. É uma aproximação analítica de bloom — sem segunda passada, sem blur de
  // verdade — barata o bastante pra caber junto com o resto num fragment shader só.
  float distanciaDoCentroDaCelula = length(uvCelula - 0.5);
  float halo = exp(-distanciaDoCentroDaCelula * distanciaDoCentroDaCelula * 9.0) * altura;

  // Cor: do tom escuro do acento (quase apagado) até quase branco nos pontos mais altos — o
  // brilho de um LED de verdade clareia pro branco no centro, não fica só "mais opaco" na
  // mesma cor. O branco aqui é o núcleo quente do brilho, não uma cor de marca nova — a
  // identidade inteira do efeito continua vindo de uCor (\`--color-cristal\`, doc 06).
  vec3 corComBrilho = mix(uCor * 0.35, mix(uCor, vec3(1.0), 0.7), clamp(altura * 1.4, 0.0, 1.0));

  float alfa = clamp(nucleo * altura + halo * 0.6, 0.0, 1.0);
  corSaida = vec4(corComBrilho, alfa);
}
`;

/** `getPropertyValue` de uma custom property devolve o texto literal escrito na regra CSS, não
 * uma cor computada — diferente de ler uma propriedade normal como \`color\`. Os tokens de cor
 * do app (\`--color-cristal\` etc., \`globals.css\`) são hex de 6 dígitos, claro e escuro; \`rgb()\`
 * fica como reforço caso um token futuro venha computado por outro caminho. Exportada à parte
 * pra testar sem precisar de um contexto WebGL2 (inexistente em vitest). */
export function analisarCor(corCss: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(corCss.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = /rgba?\(([^)]+)\)/.exec(corCss);
  if (rgb) {
    const partes = rgb[1].split(",").map((n) => parseFloat(n.trim()));
    if (partes.length >= 3 && !partes.slice(0, 3).some(Number.isNaN)) {
      return [partes[0] / 255, partes[1] / 255, partes[2] / 255];
    }
  }
  return null;
}

/** Converte a posição do mouse em px de CLIENTE (relativos ao canvas, origem no canto superior
 * esquerdo — o que `getBoundingClientRect` dá em `AsciiPeaks.tsx`) pra px do BUFFER interno
 * (origem no canto inferior esquerdo, o espaço de `gl_FragCoord`). Duas conversões numa função
 * só, pra não duplicar em `desenhar()`:
 * - escala: a mesma razão `canvas.width / canvas.clientWidth` que `uTamanhoCelula` já usa —
 *   resolução interna reduzida (`FATOR_REDUCAO_RESOLUCAO`) não deve virar dois cálculos de razão.
 * - inversão do eixo Y: `gl_FragCoord.y` cresce de baixo pra cima, px de cliente crescem de
 *   cima pra baixo — sem inverter, o brilho apareceria de cabeça pra baixo na tela.
 * Extraída à parte (como `analisarCor`) por ser matemática pura testável sem contexto WebGL2. */
export function converterMouseParaBuffer(
  xCliente: number,
  yCliente: number,
  escala: number,
  alturaBufferPx: number,
): [number, number] {
  return [xCliente * escala, alturaBufferPx - yCliente * escala];
}

function compilarShader(gl: WebGL2RenderingContext, tipo: number, fonte: string): WebGLShader {
  const shader = gl.createShader(tipo)!;
  gl.shaderSource(shader, fonte);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Falha ao compilar shader dos picos ASCII: ${log}`);
  }
  return shader;
}

/** Atlas de caracteres em canvas 2D: uma faixa horizontal, uma célula por símbolo da rampa,
 * na fonte de metadado do app. O alfa do texto (não a cor) é o que o fragment shader usa —
 * a cor de verdade vem de `uCor`, então trocar de tema não exige gerar o atlas de novo. */
function construirAtlas(fonteMono: string): { canvas: HTMLCanvasElement; contagem: number } {
  const porCaractere = 32;
  const canvas = document.createElement("canvas");
  canvas.width = porCaractere * RAMPA_CARACTERES.length;
  canvas.height = porCaractere;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Only the alpha channel is sampled; the default opaque fill is sufficient.
  ctx.font = `${Math.round(porCaractere * 0.72)}px ${fonteMono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  RAMPA_CARACTERES.forEach((caractere, i) => {
    ctx.fillText(caractere, i * porCaractere + porCaractere / 2, porCaractere / 2 + 1);
  });
  return { canvas, contagem: RAMPA_CARACTERES.length };
}

export interface AsciiPeaksControle {
  /** Recebe uma cor hex de 6 dígitos (o formato dos tokens do app) — ver `analisarCor`.
   * Chamar de novo ao trocar de tema. */
  definirCor(corCss: string): void;
  definirReduzMovimento(reduz: boolean): void;
  /** Chamar a cada `mousemove`, com a posição em px de CLIENTE (relativos ao canvas —
   * `getBoundingClientRect`, não `clientX`/`clientY` da página inteira). Cada chamada pode
   * empilhar um ponto novo no rastro (só se o mouse andou o suficiente desde o último — ver
   * `DISTANCIA_MIN_NOVO_PONTO_PX`); cada ponto desaparece sozinho depois de `VIDA_RASTRO_MS`,
   * não precisa "limpar" o rastro manualmente. A conversão pro espaço do buffer interno
   * acontece dentro de `desenhar()` (ver `converterMouseParaBuffer`), não aqui — reação a
   * entrada do usuário, então NÃO é gateada por `definirReduzMovimento` (isso controla só a
   * deriva automática do relevo). */
  definirMouse(xCliente: number, yCliente: number): void;
  /** Liga/desliga o laço de animação — usado quando a tela sai de vista (IntersectionObserver)
   * ou a janela perde foco, pra não gastar GPU/bateria à toa. */
  definirAtivo(ativo: boolean): void;
  destruir(): void;
}

/** `null` se o navegador não tiver WebGL2 (não deveria acontecer no WebView2, mas o fundo é
 * cosmético — sem shader, a tela continua funcionando, só sem o efeito). */
export function criarAsciiPeaks(canvas: HTMLCanvasElement, fonteMono: string): AsciiPeaksControle | null {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return null;

  const programa = gl.createProgram()!;
  gl.attachShader(programa, compilarShader(gl, gl.VERTEX_SHADER, VERTEX_SRC));
  gl.attachShader(programa, compilarShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC));
  gl.linkProgram(programa);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    throw new Error(`Falha ao linkar o programa dos picos ASCII: ${gl.getProgramInfoLog(programa)}`);
  }
  gl.useProgram(programa);

  const uResolucao = gl.getUniformLocation(programa, "uResolucao");
  const uTempo = gl.getUniformLocation(programa, "uTempo");
  const uTamanhoCelula = gl.getUniformLocation(programa, "uTamanhoCelula");
  const uCor = gl.getUniformLocation(programa, "uCor");
  const uContagemCaracteres = gl.getUniformLocation(programa, "uContagemCaracteres");
  // Array de uniform: a posição consultada é a do primeiro elemento (\`[0]\`) — é assim que o
  // WebGL espera pra depois usar \`uniform2fv\`/\`uniform1fv\` com um array plano cobrindo todos
  // os RASTRO_MAX/MAX_PONTOS_RASTRO elementos de uma vez.
  const uRastroPos = gl.getUniformLocation(programa, "uRastroPos[0]");
  const uRastroPeso = gl.getUniformLocation(programa, "uRastroPeso[0]");
  const uRastroContagem = gl.getUniformLocation(programa, "uRastroContagem");
  const uRaioMouse = gl.getUniformLocation(programa, "uRaioMouse");

  const { canvas: atlasCanvas, contagem } = construirAtlas(fonteMono);
  const textura = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textura);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(programa, "uAtlas"), 0);
  gl.uniform1f(uContagemCaracteres, contagem);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let cor: [number, number, number] = analisarCor(getComputedStyle(canvas).color) ?? [0, 0, 0];
  let reduzMovimento = false;
  let ativo = true;
  let tempo = 0;
  let ultimoFrame: number | null = null;
  // Último instante em que o desenho de verdade rodou (não o laço de rAF, que continua a
  // taxa nativa da tela) — ver INTERVALO_DESENHO_MS.
  let ultimoDesenho = 0;
  let frameId = 0;
  // Rastro: histórico dos últimos pontos do mouse com o instante em que cada um nasceu (em px
  // de CLIENTE — a conversão pro buffer acontece em `desenhar()`, igual antes). Nunca cresce
  // sem limite: `definirMouse` só empilha um ponto novo a cada `DISTANCIA_MIN_NOVO_PONTO_PX`,
  // e `desenhar()` descarta os que já passaram de `VIDA_RASTRO_MS` a cada quadro.
  let rastro: { xCliente: number; yCliente: number; criadoEm: number }[] = [];
  // Reaproveitados a cada desenho (alocar um Float32Array novo toda vez seria lixo de coleta
  // à toa). Só os primeiros `rastro.length` slots são preenchidos — os de além disso podem
  // ficar com lixo do quadro anterior sem problema, porque o shader nem chega a lê-los
  // (`uRastroContagem` + `break`, ver o fragment shader).
  const bufferPosicoesRastro = new Float32Array(MAX_PONTOS_RASTRO * 2);
  const bufferPesosRastro = new Float32Array(MAX_PONTOS_RASTRO);

  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, RESOLUCAO_INTERNA_MAX_DPR);
    const largura = Math.max(1, Math.round(canvas.clientWidth * dpr * FATOR_REDUCAO_RESOLUCAO));
    const altura = Math.max(1, Math.round(canvas.clientHeight * dpr * FATOR_REDUCAO_RESOLUCAO));
    if (canvas.width !== largura || canvas.height !== altura) {
      canvas.width = largura;
      canvas.height = altura;
      gl!.viewport(0, 0, largura, altura);
    }
  }

  const observador = new ResizeObserver(redimensionar);
  observador.observe(canvas);
  redimensionar();

  function desenhar(agora: number) {
    if (ultimoFrame === null) ultimoFrame = agora;
    const deltaS = (agora - ultimoFrame) / 1000;
    ultimoFrame = agora;
    // O relógio da deriva anda em TODO quadro de rAF, mesmo nos que o desenho abaixo pula —
    // senão, ao voltar a desenhar depois de vários quadros pulados, a deriva "puxaria" todo o
    // tempo perdido de uma vez (um salto), em vez de continuar no ritmo real.
    if (!reduzMovimento) tempo += deltaS * VELOCIDADE_DERIVA;

    // Throttle de desenho (ver INTERVALO_DESENHO_MS): o resto da função só roda quando já
    // passou tempo suficiente desde o último quadro DESENHADO de verdade — `agora` é o mesmo
    // relógio de `performance.now()` (DOMHighResTimeStamp), sem precisar ler os dois.
    if (agora - ultimoDesenho >= INTERVALO_DESENHO_MS) {
      ultimoDesenho = agora;

      gl!.uniform2f(uResolucao, canvas.width, canvas.height);
      gl!.uniform1f(uTempo, tempo);
      // Antes do primeiro layout `clientWidth` é 0 — cai pra escala 1 em vez de dividir por
      // zero; o ResizeObserver corrige no frame seguinte assim que o canvas tiver tamanho de verdade.
      const escala = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1;
      gl!.uniform1f(uTamanhoCelula, TAMANHO_CELULA_PX * escala);

      // Poda os pontos do rastro que já viveram demais, depois recalcula o buffer inteiro pro
      // shader — mesma razão `escala` acima pra converter cada ponto (ver
      // `converterMouseParaBuffer`, nunca duplicar essa conta num segundo lugar).
      rastro = rastro.filter((p) => agora - p.criadoEm < VIDA_RASTRO_MS);
      for (let i = 0; i < rastro.length; i++) {
        const p = rastro[i];
        const [bx, by] = converterMouseParaBuffer(p.xCliente, p.yCliente, escala, canvas.height);
        bufferPosicoesRastro[i * 2] = bx;
        bufferPosicoesRastro[i * 2 + 1] = by;
        // Curva quadrática de esmaecimento: cai devagar no início e rápido no fim — é o que lê
        // como "sumindo aos poucos" (pedido do usuário), não um corte linear seco.
        const t = Math.min(1, (agora - p.criadoEm) / VIDA_RASTRO_MS);
        bufferPesosRastro[i] = (1 - t) * (1 - t);
      }
      gl!.uniform2fv(uRastroPos, bufferPosicoesRastro);
      gl!.uniform1fv(uRastroPeso, bufferPesosRastro);
      // O laço no fragment shader sai (`break`) assim que passa desta contagem — não precisa
      // mais zerar os slots não usados de `bufferPesosRastro` (o shader nem chega a lê-los).
      gl!.uniform1i(uRastroContagem, rastro.length);
      gl!.uniform1f(uRaioMouse, RAIO_MOUSE_PX * escala);
      gl!.uniform3f(uCor, ...cor);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, textura);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    if (ativo) frameId = requestAnimationFrame(desenhar);
  }
  frameId = requestAnimationFrame(desenhar);

  return {
    definirCor(corCss) {
      const nova = analisarCor(corCss);
      if (nova) cor = nova;
    },
    definirReduzMovimento(reduz) {
      reduzMovimento = reduz;
    },
    definirMouse(xCliente, yCliente) {
      // Só empilha um ponto novo se o mouse andou o suficiente — sem isto, parado ou andando
      // devagar, o rastro empilharia pontos praticamente no mesmo lugar e estouraria
      // MAX_PONTOS_RASTRO com pontos redundantes em vez de cobrir uma trilha de verdade.
      const ultimo = rastro[rastro.length - 1];
      const distancia = ultimo
        ? Math.hypot(xCliente - ultimo.xCliente, yCliente - ultimo.yCliente)
        : Infinity;
      if (distancia < DISTANCIA_MIN_NOVO_PONTO_PX) return;
      rastro.push({ xCliente, yCliente, criadoEm: performance.now() });
      if (rastro.length > MAX_PONTOS_RASTRO) rastro.shift();
    },
    definirAtivo(novoAtivo) {
      if (ativo === novoAtivo) return;
      ativo = novoAtivo;
      ultimoFrame = null; // não conta o tempo parado como "deriva" de uma vez só ao voltar
      ultimoDesenho = 0; // desenha no primeiro quadro de volta, sem esperar o throttle
      if (ativo) frameId = requestAnimationFrame(desenhar);
    },
    destruir() {
      ativo = false;
      cancelAnimationFrame(frameId);
      observador.disconnect();
      gl!.deleteTexture(textura);
      gl!.deleteProgram(programa);
    },
  };
}
