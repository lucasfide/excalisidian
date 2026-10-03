# Pesquisa: página de planos e seção de planos da home

Data: 03/10/2026. Fatos de produto, planos e preços vêm de `00-contexto-planos.md`; nada aqui os altera.

**Aviso sobre a qualidade da evidência.** Estudos públicos e abertos sobre páginas de preço são raros. A maior parte do que circula (posts de consultorias, "4.200 testes em 218 páginas") não cita método nem amostra, e eu não usei esses números. Cada recomendação abaixo diz o que tem base verificada, o que é prática observada em concorrentes e o que é hipótese a testar. Os dois estudos mais citados da CXL (ordem dos planos e plano destacado) devolveram erro 403 e não pude abri-los; por isso não estão em Fontes e só os menciono como "a verificar" no fim.

## Resumo em 10 linhas

1. Preços visíveis na página, sem "fale conosco": é a base mais sólida (NN/g).
2. Três planos lado a lado (Grátis, Marco Aurélio, Sêneca), do mais barato ao mais caro; Marco Aurélio com destaque "Recomendado".
3. Alternância mensal/anual com **anual selecionado** e o preço mensal equivalente em destaque, mais a economia em valor absoluto.
4. Moeda pela localização do visitante (R$ no Brasil, US$ no resto), com link para trocar; o valor da página tem de ser o mesmo do checkout.
5. Manter os preços como estão (59, 149, 249, 779 já terminam em 9; sem centavos).
6. Créditos de IA explicados em horas de uso e não em unidade abstrata, com a frase pessimista do doc 09.
7. Uma tabela comparativa curta (cerca de 8 linhas) abaixo dos cartões e um FAQ visível de 7 perguntas.
8. Redução de risco em texto discreto junto do botão: cancelar quando quiser, reembolso em 14 dias, nada é apagado do computador.
9. Sem prova social: usar fatos verificáveis (local-first, cifra ponta a ponta, arquivos seus) e nada de selos, números de usuários ou "mais popular".
10. Na home: benefício antes do preço, três blocos curtos, um teaser de planos com preço "a partir de" e um único link para `/planos/`.

## Recomendações para `/planos/`

### 1. Mostrar todos os preços na própria página

- **O que fazer:** preço de cada plano visível sem login e sem formulário, incluindo o Grátis (R$ 0 / US$ 0).
- **Por quê:** a NN/g relata, em testes de usabilidade com clientes de empresas, que preço é a informação mais procurada e que quem não o encontra vai ao concorrente e vê quem esconde custo como evasivo. O estudo é sobre sites B2B; a lógica vale para assinatura individual, mas é extrapolação. Fonte: [Pricing information gives B2B sites a competitive advantage](https://www.nngroup.com/articles/show-price/).
- **Aplicação:** os três cartões mostram preço e créditos sem clique extra. Todos os concorrentes abertos (Obsidian, Notion, Raycast, Linear, Todoist, Craft) fazem assim.

### 2. Três cartões, ordem Grátis, Marco Aurélio, Sêneca, destaque no do meio

- **O que fazer:** destacar Marco Aurélio com a etiqueta "Recomendado" e contraste de fundo; Sêneca como plano de uso intenso, sem destaque.
- **Por quê:** é o padrão dos concorrentes: Notion marca o plano do meio com "Recommended"; Craft, Todoist e Raycast destacam o plano individual intermediário (Plus, Pro, Pro). Fonte: páginas de preço dos próprios produtos (ver Fontes). A literatura diz que destacar ajuda a escolha, mas não consegui abrir o estudo (ver "A verificar"). Tratar como prática de mercado, não como efeito medido.
- **Aplicação:** Marco Aurélio é o plano que entrega as duas coisas pagas (sincronização e IA) pelo preço de entrada. Usar "Recomendado", e não "Mais popular" ou "Mais escolhido": a segunda forma afirma um dado de uso que ainda não existe.

### 3. Anual selecionado por padrão, com mensal equivalente e economia em valor

- **O que fazer:** alternância "Mensal / Anual" no topo, com Anual já marcado. No cartão: preço anual cheio, preço mensal equivalente arredondado ("cerca de") e a economia em dinheiro, não só em porcentagem.
- **Por quê:** Obsidian abre com o anual selecionado e mostra o mensal equivalente (US$ 4 por mês no anual contra US$ 5 no mensal); Craft mostra o preço mensal equivalente no anual. Raycast abre no mensal. Ou seja, o mercado está dividido. Não achei teste A/B aberto e com amostra; os números que circulam (anual por padrão sobe adesão ao anual e baixa a conversão geral em alguns por cento) vêm de fontes sem método, e uma das que abri ([Intempt](https://intempt.com/recipes/pricing-toggle-default-test)) admite que o efeito depende do produto e não traz dado. Decisão: anual por padrão porque o desconto é grande e sustenta a mensagem; **medir** assim que houver tráfego.
- **Aplicação (cálculos a partir da tabela de preços):**
  - Marco Aurélio: US$ 59 por ano, cerca de US$ 5 por mês, economia de US$ 37 em relação a 12 meses no mensal (US$ 96). R$ 249 por ano, cerca de R$ 21 por mês, economia de R$ 171 (R$ 420).
  - Sêneca: US$ 149 por ano, cerca de US$ 12 por mês, economia de US$ 67 (US$ 216). R$ 779 por ano, cerca de R$ 65 por mês, economia de R$ 409 (R$ 1.188).
  - O desconto anual fica em torno de 31% a 41%, bem acima dos cerca de 20% que Craft e Raycast mostram. Por isso a economia em valor absoluto comunica melhor que a porcentagem. Não usar "meses grátis" sem conferir a conta com o dono.

### 4. Moeda pela localização, com troca manual

- **O que fazer:** mostrar R$ para visitantes do Brasil e US$ para os demais; um link discreto "Ver preços em US$ / R$" permite trocar. Sem centavos na tabela (os preços já são inteiros).
- **Por quê:** a documentação da Paddle afirma que mostrar o preço na moeda local "constrói confiança" porque a pessoa entende o que vai pagar, e que a detecção é feita pelo IP do visitante ([Offer localized pricing](https://developer.paddle.com/build/products/offer-localized-pricing)). É argumento de um fornecedor de pagamento, sem número. O número de "30 a 45% mais crescimento" que aparece em resumos de busca atribuído à ProfitWell eu **não** consegui confirmar na fonte e não o uso. Todoist mostra um seletor de moeda; Notion mostra só US$; Craft mostra moeda local.
- **Aplicação:** os preços em R$ e US$ do contexto são definidos à mão (não conversão automática), então a página só escolhe qual exibir. A moeda do checkout precisa ser a da página. Em aberto: como o intermediário de pagamento, ainda não escolhido, trata isso.

### 5. Preços como estão, sem arredondar para baixo nem inventar centavos

- **O que fazer:** manter 59 / 149 / 249 / 779. Mostrar o mensal equivalente como "cerca de US$ 5" para não aparecer 4,92.
- **Por quê:** Thomas e Morwitz (2005) mostram, em cinco experimentos, que o dígito mais à esquerda pesa demais na comparação, e o efeito aparece quando os preços comparados diferem no primeiro dígito e estão próximos ([Penny wise and pound foolish](https://ideas.repec.org/a/oup/jconrs/v32y2005i1p54-64.html)). Aqui o ganho é pequeno: os preços anuais já terminam em 9 e os mensais são inteiros. Não vale mexer.
- **Aplicação:** nada a mudar; só evitar exibir centavos nos equivalentes mensais.

### 6. Explicar crédito como tempo de uso, e dizer o que acontece quando acaba

- **O que fazer:** em cada cartão, uma linha "3.000 créditos de IA por mês" e logo abaixo, em texto menor, a tradução em horas. Detalhe no FAQ: 1 crédito = US$ 0,001 do custo do fornecedor, uso medido de cerca de 0,3 crédito por pedido, e o que ocorre quando o saldo termina.
- **Por quê:** os concorrentes que usam crédito (Raycast, Craft, Notion) mostram o número por plano e explicam em página/FAQ que cada modelo gasta de forma diferente, mas nenhum traduz em horas de uso; Raycast detalha validade e Notion cobra US$ 10 por 1.000 créditos extras. Nenhum deixa claro o que acontece no fim do saldo; é uma oportunidade de ser mais claro. Fontes: páginas de preço de [Raycast](https://www.raycast.com/pricing), [Notion](https://www.notion.com/pricing) e [Craft](https://www.craft.do/pricing). A recomendação de traduzir em horas é minha (hipótese), apoiada pela NN/g só no princípio de mostrar cenários típicos quando o custo exato varia: "show prices for typical scenarios" ([NN/g](https://www.nngroup.com/articles/show-price/)).
- **Aplicação:** usar apenas a frase pessimista do doc 09 (item 37): "até cerca de 120 horas de escrita intensa com o acompanhamento ligado, no pior caso de preço". Para Sêneca, 10.000 créditos são pouco mais de três vezes os 3.000 do Marco Aurélio; **não** escrever "400 horas" sem a conta aprovada, só "mais de três vezes os créditos do Marco Aurélio". Não vender como "ilimitado".

### 7. Tabela comparativa curta e FAQ visível

- **O que fazer:** abaixo dos cartões, uma tabela de três colunas com cerca de 8 linhas (app completo, sem conta, agente com chave própria, sincronização, 5 GB, IA sem chave, créditos por mês, suporte se houver). No celular, uma coluna por vez ou lista por plano. FAQ em acordeão logo depois, com as sete perguntas da seção de textos.
- **Por quê:** Notion, Linear e Todoist têm matriz de comparação; Obsidian não tem e usa listas por plano (só tem 4 itens de produto). O Smashing Magazine recomenda acordeões em vez de tooltips para explicar recurso e evitar rolagem horizontal no celular ([Designing effective pricing plans](https://smashingmagazine.com/2022/07/designing-better-pricing-page)). A Baymard encontra dificuldade em tabelas comparativas de produtos de e-commerce, mas o contexto é outro e o detalhe não carregou; não usei.
- **Aplicação:** com três planos a tabela é pequena e serve sobretudo para o visitante que já decidiu "preciso de sincronização?" e quer conferir.

### 8. Redução de risco junto do botão, em tom de fato

- **O que fazer:** abaixo do botão de assinar, uma linha: "Cancele quando quiser. Reembolso integral em até 14 dias da primeira cobrança." E no bloco do Grátis: "Funciona sem conta e sem internet".
- **Por quê:** o teste da KitchenAid, publicado pela Conversion.com, mostrou que expor uma garantia de 90 dias reduziu pedidos em dois dígitos, porque marca líder não tinha dúvida a resolver e a garantia a criou ([The guarantee backfire](https://conversion.com/?p=8751)). A lição é de contexto: o Excalisidian é desconhecido, então a dúvida de risco existe, mas o texto deve ser pequeno e factual, não um selo grande. Sem teste próprio, trate como hipótese.
- **Aplicação:** a política escolhida (14 dias, qualquer país) é a mesma do contexto. Não chamar de "garantia de satisfação" nem de "teste grátis": não há período de teste; o que existe é o plano Grátis permanente, que é o verdadeiro "experimentar sem risco".

### 9. Um botão por cartão, texto com verbo e objeto

- **O que fazer:** Grátis: "Baixar grátis". Marco Aurélio: "Assinar Marco Aurélio". Sêneca: "Assinar Sêneca". Um botão por cartão; o Grátis leva à seção de download, sem exigir conta.
- **Por quê:** Obsidian, Notion e Craft usam "Sign up" / "Get started" por cartão, com secundário "Learn more" só no Obsidian. Não achei teste aberto que compare textos; é convenção, não evidência. A escolha de verbo e objeto é minha e segue o princípio de dizer o que acontece ao clicar.
- **Aplicação:** o link de assinatura fica vazio em um único lugar de configuração até o intermediário ser escolhido. Enquanto vazio, os botões de assinar devem ficar desativados com a legenda "Em breve" (confirmar com o dono).

### 10. Sem prova social: o que não fazer

- **Não usar:** depoimentos, avaliações, número de usuários, logos, selos de segurança ou de "satisfação", "mais popular", contagens regressivas, "restam X vagas", comparações com concorrentes nomeados sem dado, "IA ilimitada", "grátis para sempre" (o contrato pode mudar; prefira "o app completo é grátis").
- **Por quê:** o Linear mostra "Trusted by more than 40,000 companies" ([linear.app/pricing](https://linear.app/pricing)); é o tipo de afirmação que o Excalisidian não pode fazer. Afirmação inventada é o risco legal e de confiança que o contexto proíbe.
- **Usar no lugar:** fatos verificáveis do produto, em forma de linha curta sob o título: "Arquivos Markdown na sua pasta", "Funciona sem internet e sem conta", "Sincronização cifrada ponta a ponta", "Cancelar não apaga nada do seu computador". Obsidian faz algo parecido: abre a página com "Free without limits" antes dos planos pagos e fala de armazenamento local e criptografia nas respostas.

## Recomendações para a seção de planos da home

### H1. Benefício antes do preço

- **O que fazer:** abrir a seção com o que a pessoa ganha, não com a tabela: "Use no seu computador, de graça. Quando quiser mais, é opcional." Em seguida três blocos curtos: usar em mais de um computador (sincronização), IA sem configurar chave, seus arquivos continuam seus.
- **Por quê:** Obsidian abre a página de preço com a mensagem do grátis antes dos pagos; NN/g mostra que o preço continua sendo o que a pessoa procura, então o benefício não deve esconder o valor ([NN/g](https://www.nngroup.com/articles/show-price/)). A ordem benefício, depois preço, é prática, sem teste verificado.
- **Aplicação:** o primeiro bloco é o do Grátis, para reforçar o ADR-31: ninguém precisa pagar para usar.

### H2. Teaser com os três planos e preço "a partir de"

- **O que fazer:** três linhas ou cartões pequenos com nome, uma frase "para quem" e preço de entrada (o anual mensal equivalente: "cerca de US$ 5 por mês, cobrado por ano"). Sem tabela, sem FAQ, sem alternância.
- **Por quê:** manter o preço visível na home evita o clique cego; a decisão completa fica em `/planos/` (Obsidian e Craft mantêm preço, comparação e FAQ numa página dedicada). Observação de prática.
- **Aplicação:** usar a mesma regra de moeda da página de planos.

### H3. Um único destino

- **O que fazer:** um botão "Ver planos e preços" que leva a `/planos/`, e o botão de download continua o principal da página. Não repetir botões de assinar na home.
- **Por quê:** evita competir com o download (o caminho do Grátis) e mantém uma só tela de decisão para o pagamento. Hipótese.
- **Aplicação:** conferir com `docs/landing-page-plan.md`: ele limita a IA na home à frase de apoio do H1 ("Com IA, se você quiser") e define seções com âncoras Início, Notas, Diagramas, Tarefas e Download. Uma seção de planos com IA e preço contradiz isso; é decisão do dono e deve ser registrada nesse documento.

## Textos sugeridos

Sentence case, sem emoji. Entre colchetes, marcadores a preencher.

### Página `/planos/`

- **Título (H1):** Comece de graça. Pague só se precisar de mais.
- **Subtítulo:** O app completo funciona no seu computador, sem conta e sem internet. Os planos pagos são opcionais e nunca bloqueiam o que você já tem.
- **Alternância:** Mensal / Anual. Nota ao lado do Anual: "Economize até US$ 67 ou R$ 409 por ano" (usar o valor da moeda ativa).
- **Cartão Grátis:** "Para todo mundo." Itens: App completo: notas, diagramas, tarefas, busca, vários vaults e temas. Sem conta. Agente de IA com a sua própria chave. Dados só no seu computador. Botão: "Baixar grátis".
- **Cartão Marco Aurélio** (etiqueta "Recomendado"): "Para quem escreve todo dia em mais de um computador." Itens: Tudo do Grátis. Sincronização entre computadores, cifrada ponta a ponta, 5 GB. IA do Excalisidian, sem chave própria. 3.000 créditos de IA por mês. Botão: "Assinar Marco Aurélio".
- **Cartão Sêneca:** "Para quem usa a IA o dia todo." Itens: Tudo do Marco Aurélio. 10.000 créditos de IA por mês. Mesmos 5 GB. Botão: "Assinar Sêneca".
- **Linha sob os botões pagos:** Cancele quando quiser. Reembolso integral em até 14 dias da primeira cobrança.
- **Linha sobre créditos (sob os cartões pagos):** Crédito é a medida do uso de IA. No pior caso de preço, 3.000 créditos rendem cerca de 120 horas de escrita intensa; no uso normal, mais.
- **Título da tabela:** Compare os planos.
- **Título do FAQ:** Perguntas frequentes.
- **Faixa final:** "Ainda na dúvida? Baixe o Grátis. Ele não expira." Botão: "Baixar grátis". (Confirmar com o dono antes de usar "não expira".)

### Perguntas e respostas

**O que é um crédito?**
Crédito é a medida que usamos para o uso da IA do Excalisidian. Um crédito equivale a US$ 0,001 do custo real cobrado pelo fornecedor de IA. Em uma medição de 28/09/2026, um pedido típico consumiu cerca de 0,3 crédito. Na estimativa mais pessimista, 3.000 créditos rendem cerca de 120 horas de escrita intensa com o acompanhamento ligado; no uso normal, rendem mais. Os créditos renovam no dia 1º de cada mês, no horário de Brasília.

**O que acontece se os créditos acabarem?**
A IA do Excalisidian pausa até o dia 1º, quando o saldo renova. O aplicativo continua funcionando por inteiro, e o agente de IA com a sua própria chave também. Você não perde nada do que escreveu. [[CONFIRMAR: o que acontece com créditos não usados no fim do mês e se haverá compra de créditos extras; o contexto não define. Enquanto não houver decisão, não afirmar nenhuma das duas coisas.]]

**Posso cancelar quando quiser?**
Sim. O cancelamento vale a qualquer momento. O acesso pago continua até o fim do período que você já pagou, e nada é apagado do seu computador: suas notas, diagramas e tarefas continuam onde sempre estiveram. [[CONFIRMAR: o que acontece com a cópia sincronizada no servidor depois do cancelamento e por quanto tempo ela fica; o contexto não define.]]

**Como funciona o reembolso?**
Se você pedir em até 14 dias da primeira cobrança de uma assinatura, devolvemos o valor integral, em qualquer país. Para pedir, escreva para [[EMAIL_CONTATO]]. [[CONFIRMAR: se o pedido pode ser feito pela conta do intermediário de pagamento.]]

**A sincronização é segura?**
A sincronização é cifrada ponta a ponta: o servidor guarda o conteúdo já embaralhado e não consegue ler as suas notas, os nomes dos arquivos nem saber quantas notas existem. Se a mesma nota for editada em dois computadores, o Excalisidian nunca mistura as versões sozinho: ele mostra uma tela para você escolher. A IA do Excalisidian é separada: o texto das notas passa pelo nosso servidor a caminho do fornecedor de IA e não é guardado nem registrado. Detalhes na [política de privacidade](/privacidade/).

**Preciso de conta para usar o aplicativo?**
Não. O aplicativo completo, com notas, diagramas, tarefas, busca, vários vaults e temas, funciona sem conta e sem internet. Você só precisa de conta se quiser a sincronização ou a IA do Excalisidian. Quem preferir pode usar o agente de IA com a própria chave, também sem conta.

**Em que moeda vou pagar?**
Brasil: em reais. Outros países: em dólares. [[CONFIRMAR com o intermediário de pagamento: moeda cobrada, impostos adicionados por país e meios de pagamento.]]

### Seção da home

- **Título:** Fica no seu computador. O resto é opcional.
- **Parágrafo:** O Excalisidian completo é grátis e funciona sem conta e sem internet. Se você escreve em mais de um computador ou quer a IA pronta para usar, há dois planos.
- **Bloco 1:** "Grátis para sempre no seu computador" (rever o "para sempre" com o dono; alternativa: "O app completo é grátis").
- **Bloco 2:** "Seus arquivos em todos os computadores" e "Sincronização cifrada ponta a ponta".
- **Bloco 3:** "IA sem configurar chave" e "Você escolhe quanto usar".
- **Teaser:** Marco Aurélio: cerca de US$ 5 por mês, cobrado por ano. Sêneca: cerca de US$ 12 por mês, cobrado por ano. Grátis: sempre. (Em R$: cerca de R$ 21 e R$ 65 por mês.)
- **Botão:** Ver planos e preços.

## Em aberto

- Intermediário de pagamento: moeda cobrada, impostos, link de assinatura, meio de reembolso.
- Créditos não usados e compra de créditos extras: o contexto não diz; as respostas acima não afirmam nada.
- Dados sincronizados após cancelar e após reembolso (Obsidian apaga na hora ao reembolsar; não sabemos o que faremos).
- Texto "Em breve" nos botões de assinar enquanto não há link.
- Seção de planos na home contradiz a restrição de IA em `docs/landing-page-plan.md`.
- Anual como padrão: medir contra mensal depois do lançamento.

## A verificar (não abri a fonte)

Os dois estudos da CXL, "The effects of highlighting a recommended pricing plan" (`cxl.com/research-study/pricing-page-study-highlight/`) e "Pricing page optimization: how to order pricing plans" (`cxl.com/research-study/pricing-plan-study-order/`), retornaram 403. Pelo resumo de busca, destacar o plano recomendado atrai atenção e escolha, e sugerem testar a ordem do mais caro ao mais barato. Se quiser usar a ordem invertida, abrir o estudo primeiro. Aqui mantive a ordem do mais barato ao mais caro, que é a de todos os concorrentes abertos.

## Fontes (abertas e lidas)

- NN/g, [Pricing information gives B2B sites a competitive advantage](https://www.nngroup.com/articles/show-price/)
- Thomas e Morwitz (2005), [Penny wise and pound foolish: the left digit effect in price cognition](https://ideas.repec.org/a/oup/jconrs/v32y2005i1p54-64.html) (resumo no IDEAS/RePEc)
- Conversion.com, [Bonus ep. 4: the guarantee backfire](https://conversion.com/?p=8751)
- Paddle, [Offer localized pricing](https://developer.paddle.com/build/products/offer-localized-pricing)
- Paddle, [Build a pricing page](https://developer.paddle.com/build/checkout/build-pricing-page)
- Smashing Magazine, [Designing effective pricing plans](https://smashingmagazine.com/2022/07/designing-better-pricing-page)
- Intempt, [Pricing toggle default test](https://intempt.com/recipes/pricing-toggle-default-test) (sem dados; citada só como contraponto)
- Atticus Li, [15 pricing page A/B tests for low-traffic SaaS teams](https://www.atticusli.com/blog/posts/15-pricing-page-ab-tests-for-low-traffic-saas-teams/) (lida e descartada: resultados sem amostra nem método)
- Páginas de preço e FAQ de concorrentes, lidas em 03/10/2026: [Obsidian](https://obsidian.md/pricing), [Obsidian Sync FAQ](https://obsidian.md/help/sync/faq), [Notion](https://www.notion.com/pricing), [Raycast](https://www.raycast.com/pricing), [Linear](https://linear.app/pricing), [Todoist](https://www.todoist.com/pricing), [Craft](https://www.craft.do/pricing)
- Tentei e não obtive conteúdo útil: Bear (`bear.app/faq/`, sem dados de preço na página), Paddle ProfitWell report de localização (sem números), Stripe Adaptive Pricing (página só com índice), Baymard guideline 2142 (conteúdo não carregou).
