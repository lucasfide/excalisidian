# atomico/ — editor de live preview vendorizado

Este diretório é uma cópia do código-fonte do pacote **`@atomic-editor/editor`**, trazido
para dentro do repositório em vez de consumido do npm.

| | |
|---|---|
| Origem | https://github.com/kenforthewin/atomic-editor |
| Versão | 0.6.2 |
| Commit | `b6ed65f` (tag `v0.6.2`) |
| Licença | MIT — ver `LICENSE` neste diretório |
| Data da cópia | 28/08/2026 |

## Por que vendorizar

O pacote resolve a Fatia 2 inteira (live preview inline estilo Obsidian, com o markdown cru
como fonte da verdade — o ADR-4 do `docs/09`), mas tem um mantenedor único e pouca garantia
de continuidade. Copiar o código para cá:

- elimina o risco de o pacote ser abandonado ou removido;
- elimina migrações de versão futuras — mesma lógica do Excalidraw pinado em 0.18.1;
- permite reescrever o tema visual (`atomic-theme.ts`, `styles/inline-preview.css`) com os
  tokens do nosso design system, por dentro, em vez de brigar com a especificidade do CSS
  dele por fora.

## Regras

- **Nomes de arquivo e identificadores internos ficam em inglês.** A regra de português do
  `CLAUDE.md` vale para o código do projeto, não para código de terceiros vendorizado —
  mesma exceção já aplicada aos assets do Excalidraw em `public/`.
- Alterações nossas neste diretório devem vir marcadas com um comentário `// [excalisidian]`
  para ficar fácil separar o que é upstream do que é adaptação.
- Só o `EditorNota.tsx` (fora deste diretório) importa daqui. O ponto de entrada é
  `./index.ts`; o CSS é `./styles/inline-preview.css`.

## Suíte de testes do upstream

O pacote tem 8 arquivos de teste (`src/__tests__/` no repositório de origem) cobrindo os
contratos de markdown, decorations multilinha, wiki-links e modo somente-leitura. Não foram
trazidos ainda: exigem `happy-dom` + `@testing-library/react` + plugin React no vitest, o
que é desproporcional enquanto só reestilizamos. Se um dia mexermos na lógica de
*decoration* (e não só no tema), puxar a suíte junto.
