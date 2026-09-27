# Licenças de terceiros

O Excalisidian é MIT (`LICENSE`, Copyright (c) 2026 Lucas Fidelis de Cristo). O app embute
software de terceiros e o **instalador distribui este arquivo e o `LICENSE` junto da
aplicação** (ver `bundle.resources` em `src-tauri/tauri.conf.json`, destino `licenses/`).

Todas as licenças listadas aqui são permissivas — nenhuma é copyleft, nenhuma exige abrir o
código do Excalisidian e **nenhuma proíbe cobrar pelo app ou oferecer planos pagos**. O que
elas exigem é manter o aviso de copyright e o texto da licença junto das cópias
distribuídas. Isto não é conselho jurídico: é a leitura do que cada licença publica. Ver
`docs/09-decisoes-e-incertezas.md`, ADR-29.

## MIT

Aplicável a:

- **`@excalidraw/excalidraw` 0.18.1** — editor de diagramas embutido no canvas.
  `Copyright (c) 2020 Excalidraw`
- **`@atomic-editor/editor` 0.6.2** — editor de live preview, vendorizado em
  `src/editor/atomico/` (há uma cópia da licença em `LICENSE` naquele diretório).
  `Copyright (c) 2026 Kenny Bergquist`
- **Simplex 2D de Ian McEwan/Ashima Arts** (`webgl-noise`) — ruído do shader de fundo,
  incorporado em `src/ui/excalisidian/asciiPeaksShader.ts`.

O aviso de permissão abaixo vale para cada componente acima (o copyright de cada um está na
linha correspondente):

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Demais dependências npm embutidas no bundle (React, CodeMirror, os plugins do Tauri,
dockview, zustand, lucide, minisearch, unified/remark, etc.) mantêm cada uma a sua licença —
todas permissivas (MIT, ISC ou Apache-2.0). Os textos completos ficam no pacote de origem,
em `node_modules/<pacote>/LICENSE`. **Pendência:** montar a lista completa com os avisos de
cada pacote antes de um lançamento público que não seja beta — nenhuma dessas licenças cria
obrigação além de reproduzir o aviso, mas o aviso precisa estar presente.

## Fontes

### Copiadas do pacote do Excalidraw

Copiadas em tempo de build (`scripts/copiar-assets-excalidraw.mjs`) para funcionar offline.
Todas sob a SIL Open Font License 1.1 (https://openfontlicense.org):

- Excalifont
- Virgil
- Cascadia Code
- Comic Shanns
- Nunito
- Lilita One
- Liberation Sans
- Xiaolai
- Assistant

A OFL permite uso, modificação e redistribuição livres, inclusive embutidas num app
distribuído, desde que a fonte em si não seja vendida separadamente — não é o caso aqui.

### Fontes da interface (design system)

Também sob a SIL Open Font License 1.1 (https://openfontlicense.org), em `public/fontes/`:

- Fraunces
- Instrument Sans
- IBM Plex Mono

### Texto da licença (SIL Open Font License 1.1)

```
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Marcas — não cobertas pelas licenças

As licenças acima cobrem **código e fontes, não marcas**. "Excalidraw" é marca da
Excalidraw s.r.o. e "Obsidian" é marca da Dynalist Inc. O uso aqui é apenas referencial
("funciona como…"), e o Excalisidian não é afiliado nem endossado por nenhum dos dois. A
licença MIT do Excalidraw não concede (nem nega) direito sobre o nome "Excalidraw". Ver
`docs/09-decisoes-e-incertezas.md`, ADR-9.