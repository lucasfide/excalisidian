# Créditos de imagens

Última verificação: 03/10/2026, nas páginas dos acervos e da Wikimedia Commons (as do Metropolitan Museum e da National Gallery of Art foram conferidas pelos dados abertos dos próprios museus, porque os sites bloqueiam leitura automática).

As pinturas e desenhos são obras antigas, em domínio público. O que pode ter licença própria é a **foto** da obra. Esta tabela separa as duas coisas.

Imagens usadas em `public/landing/` (fundo da seção de download do site) e `public/wallpapers/` (papéis de parede, listados em `src/data/wallpapers.ts`).

## Tabela

| Arquivo | Obra | Autor | Acervo | Fonte | Licença da reprodução |
|---|---|---|---|---|---|
| `landing/a-morte-de-socrates.jpg` | A morte de Sócrates, 1787 | Jacques-Louis David | The Metropolitan Museum of Art, Nova York (31.45, Catharine Lorillard Wolfe Collection) | https://www.metmuseum.org/art/collection/search/436105 | Met Open Access (CC0 1.0): marcada como domínio público pelo museu |
| `wallpapers/belisario.jpg` | Belisário pedindo esmolas, 1781 | Jacques-Louis David | Palais des Beaux-Arts de Lille (P 436) | https://commons.wikimedia.org/wiki/File:David_-_Belisarius.jpg | Domínio público (PD-Art, reprodução fiel de obra bidimensional) |
| `wallpapers/brutus.jpg` | Os lictores trazem a Brutus os corpos de seus filhos, 1789 | Jacques-Louis David | Musée du Louvre, Paris (INV 3693) | https://commons.wikimedia.org/wiki/File:Jacques-Louis_David_-_Les_licteurs_rapportent_%C3%A0_Brutus_les_corps_de_ses_fils_-_Brutus.jpg | Domínio público |
| `wallpapers/andromaca.jpg` | A dor e os lamentos de Andrômaca sobre o corpo de Heitor, 1783 | Jacques-Louis David | Musée du Louvre, Paris | https://commons.wikimedia.org/wiki/File:Andromache_mourns_Hector.jpg | Domínio público |
| `wallpapers/juramento-horacios.jpg` | O juramento dos Horácios, 1784 | Jacques-Louis David | Musée du Louvre, Paris (INV 3692) | https://commons.wikimedia.org/wiki/File:David-Oath_of_the_Horatii-1784.jpg | Domínio público |
| `wallpapers/batalha-rio.jpg` | Batalha junto a um rio (Battle by a River), 1780, pena e aguada | Dirk Langendijk | National Gallery of Art, Washington (2015.96.1, Ailsa Mellon Bruce Fund) | https://www.nga.gov/artworks/199111-battle-river | CC0 1.0 (NGA Open Access: imagem marcada como acesso aberto nos dados abertos do museu) |
| `wallpapers/morte-marat.jpg` | A morte de Marat, 1793 | Jacques-Louis David | Musées royaux des Beaux-Arts de Belgique, Bruxelas (inv. 3260) | https://commons.wikimedia.org/wiki/File:The_Death_of_Marat,_by_Jacques-Louis_David_(1793).jpg | **Foto de Socket0, CC BY-SA 3.0** (exige crédito, link da licença, aviso de alteração e mesma licença em adaptações da foto). Obra em domínio público |
| `wallpapers/leonidas-termopilas.jpg` | Leônidas nas Termópilas, 1814 | Jacques-Louis David | Musée du Louvre, Paris (INV 3690) | https://commons.wikimedia.org/wiki/File:Jacques-Louis_David_-_Leonidas_at_Thermopylae_-_WGA6095.jpg (imagem do Web Gallery of Art) | Domínio público (Public Domain Mark 1.0) |
| `wallpapers/sabinas-david.jpg` | A intervenção das sabinas, 1799 | Jacques-Louis David | Musée du Louvre, Paris (INV 3691) | https://commons.wikimedia.org/wiki/File:The_Intervention_of_the_Sabine_Women-_Les_Sabines.jpg | **Foto de Wilfredor, 2024, CC BY-SA 4.0** (mesmas exigências). Obra em domínio público |
| `wallpapers/pedro-joao.jpg` | São Pedro e São João curando o paralítico, 1655 | Nicolas Poussin | The Metropolitan Museum of Art, Nova York (24.45.2, Marquand Fund) | https://www.metmuseum.org/art/collection/search/437330 | Met Open Access (CC0 1.0) |
| `wallpapers/rapto-sabinas-poussin.jpg` | O rapto das sabinas, provavelmente 1633-34 | Nicolas Poussin | The Metropolitan Museum of Art, Nova York (46.160, Harris Brisbane Dick Fund) | https://www.metmuseum.org/art/collection/search/437329 | Met Open Access (CC0 1.0) |
| `wallpapers/morte-germanico.jpg` | A morte de Germânico, 1627 | Nicolas Poussin | Minneapolis Institute of Art | https://commons.wikimedia.org/wiki/File:Nicolas_Poussin_-_La_Mort_de_Germanicus.jpg (imagem do projeto ArtsConnectEd) | Domínio público (PD-Art) |
| `wallpapers/cegueira-elimas.jpg` | A cegueira de Elimas (The Blinding of Elymas), 1775-80, desenho a pena sobre giz | Jacques-Louis David, a partir de Taddeo Zuccaro | National Gallery of Art, Washington (1998.105.1.iii) | https://www.nga.gov/artworks/107104-blinding-elymas | CC0 1.0 (NGA Open Access) |
| `wallpapers/sabinas-nga.jpg` | O rapto das sabinas (The Rape of the Sabine Women), c. 1770, óleo sobre papel colado em tela | Pintor francês do século XVIII (anônimo) | National Gallery of Art, Washington (1942.9.79) | https://www.nga.gov/artworks/1218-rape-sabine-women | CC0 1.0 (NGA Open Access) |

## Texto de crédito para as duas fotos com licença Creative Commons

Use onde as imagens aparecerem, ou numa página de créditos ligada no rodapé:

- A morte de Marat (Jacques-Louis David, 1793). Foto: Socket0, via Wikimedia Commons, licença CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). Redimensionada.
- A intervenção das sabinas (Jacques-Louis David, 1799). Foto: Wilfredor, via Wikimedia Commons, licença CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Redimensionada.

Se as imagens foram recortadas ou tiveram cor ajustada, diga isso no crédito. Os arquivos em `public/` não trazem registro de edição, então não foi possível confirmar quais alterações foram feitas.

## Divergências encontradas em `src/data/wallpapers.ts`

O campo `credito` desse arquivo não bate com as fontes em quatro casos. Eu não editei o arquivo; ele é do código do site.

| Item | O que está no arquivo | O que a fonte diz |
|---|---|---|
| `belisario` | Musée du Louvre | Palais des Beaux-Arts de Lille |
| `morte-marat` | Musée des Beaux-Arts de Reims | A foto (Socket0) foi tirada nos Musées royaux des Beaux-Arts de Belgique, em Bruxelas, onde está o original |
| `leonidas-termopilas` | Smithsonian American Art Museum | Musée du Louvre |
| `morte-germanico` | Nationalmuseum | Minneapolis Institute of Art |

Além disso, `brutus` e `juramento-horacios` têm o próprio pintor no campo de acervo (deveria ser o Louvre), e `cegueira-elimas` aparece como "Após Taddeo Zuccaro", quando o museu atribui a obra a Jacques-Louis David a partir de Zuccaro.

## Observação

Para fotos de obras bidimensionais antigas, a Wikimedia Commons e os museus adotam o entendimento de que a reprodução fiel não cria novo direito autoral. Esse entendimento é firme nos Estados Unidos e comum na Europa; no Brasil, a foto de uma obra pode, em tese, ter proteção própria. As imagens CC0 e Open Access dos museus resolvem isso por licença expressa. Para as demais, o risco é baixo, mas a decisão final é de um advogado.
