# Política de privacidade do Excalisidian

Última atualização: [[DATA_DE_PUBLICACAO]]

## Em poucas palavras

- Sem conta, o Excalisidian não envia nenhum dado seu para nós. Suas notas, diagramas e tarefas ficam no seu computador. Não temos telemetria, análise de uso nem relatório de erro.
- O app consulta o GitHub para saber se há versão nova. Isso mostra o seu endereço IP ao GitHub.
- Com conta, guardamos seu e-mail, seu plano e uma versão embaralhada da prova de identidade. Nunca guardamos sua senha. Por lei, também guardamos por 6 meses registros de acesso (IP, data e hora).
- Na sincronização, o conteúdo, os nomes de arquivo e o nome do vault vão cifrados. Não conseguimos ler. Vemos apenas quantos pacotes existem, o tamanho aproximado e quando chegaram.
- Na IA do Excalisidian, o texto das suas notas passa pelo nosso servidor a caminho do fornecedor de IA. Não o guardamos nem o registramos. O fornecedor pode estar fora do Brasil.
- Na IA com chave própria, o texto vai direto do seu computador ao provedor que você escolheu, sem passar por nós.
- O pagamento é processado pela Stripe. Nós não vemos o número do seu cartão.
- Você pode pedir acesso, correção ou exclusão dos seus dados em support@excalisidian.com.

## 1. Quem é o controlador e como falar conosco

O controlador dos dados tratados pelos serviços online do Excalisidian é:

- Razão social: [[RAZAO_SOCIAL]]
- CNPJ: [[CNPJ]]
- Endereço: [[ENDERECO]]
- E-mail: support@excalisidian.com

Encarregado pelo tratamento de dados pessoais (LGPD, art. 41): [[NOME_DO_ENCARREGADO]], pelo e-mail support@excalisidian.com.

Esta política cobre o app Excalisidian, o site excalisidian.com e os serviços online opcionais (conta, sincronização e IA do Excalisidian). Ela segue a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018) e, para quem está na União Europeia, o GDPR (Regulamento 2016/679). As regras do contrato estão nos [Termos de uso](/termos/).

## 2. Quais dados tratamos, de quem, para quê e com qual base legal

Por padrão o Excalisidian é um app local. Só tratamos dados nossos quando você usa algum serviço online ou visita o site.

| Quem é você | Dados | Para quê | Base legal (LGPD art. 7 / GDPR art. 6) |
|---|---|---|---|
| **Usa o app sem conta** | Nada é enviado a nós. As notas, os diagramas, as tarefas e as configurações ficam só no seu computador. A única conexão automática é a consulta de atualização ao GitHub (seção 3). | Manter o app atualizado e seguro. | Legítimo interesse (art. 7, IX / art. 6(1)(f)), para a consulta de atualização. |
| **Cria uma conta** | E-mail; prova de identidade derivada da senha, guardada só como resumo lento; plano e faixa de IA; data de criação; sessões ativas (guardadas como resumo do token, com data de validade). | Criar e manter a conta, entrar, aplicar o plano. | Execução de contrato (art. 7, V / art. 6(1)(b)). |
| **Cria conta, entra ou usa a conta** | Registros de acesso: endereço IP, data e hora (em UTC) e o tipo de evento (criar conta, entrar, renovar a sessão e uso da conta, no máximo 1 registro por hora para cada conta e IP). | Cumprir a lei que manda guardar registros de acesso a aplicações. | Obrigação legal (art. 7, II / art. 6(1)(c)). |
| **Sincroniza um vault** | Pacotes cifrados de mudanças; nome do vault cifrado; a chave do vault trancada num envelope que só você abre; número de pacotes, tamanho aproximado de cada um e quando chegaram. | Guardar e entregar os pacotes aos seus outros computadores. | Execução de contrato (art. 7, V / art. 6(1)(b)). |
| **Usa a IA do Excalisidian** | O texto que o app envia no pedido (trechos e resumos de notas, a conversa com o agente), que só atravessa o servidor; por conta e por mês, apenas números: custo, quantidade de pedidos e tokens de entrada e saída; uma linha de registro técnico sem identificação (seção 7). | Repassar o pedido ao fornecedor de IA, devolver a resposta e contar os créditos. | Execução de contrato (art. 7, V / art. 6(1)(b)). O pedido só sai depois que você configura a IA e aceita o convite do agente ou inicia uma conversa. |
| **Usa a IA com chave própria** | Nada passa por nós. O texto e a sua chave vão direto do seu computador ao provedor escolhido. | Não tratamos esses dados. | O tratamento é entre você e o provedor, que é o responsável por ele. |
| **Visita o site** | O servidor que hospeda o site pode registrar o seu endereço IP e dados técnicos da conexão. O site não usa cookies nem ferramentas de análise (seção 11). | Entregar a página e manter o site seguro. | Legítimo interesse (art. 7, IX / art. 6(1)(f)). |
| **Compra um plano** | A Stripe trata os dados do cartão. Dela recebemos o nome, o e-mail, o país e os dados de cobrança informados no pagamento, o plano e o estado da assinatura (período, situação) e dados resumidos do cartão, como bandeira e últimos dígitos, nunca o número completo. Para a nota fiscal, os dados exigidos pela legislação fiscal são enviados ao [[EMISSOR_DE_NOTA_FISCAL]]. Não vemos o número do cartão. | Cobrar, renovar, reembolsar e cumprir obrigações fiscais. | Execução de contrato (art. 7, V / art. 6(1)(b)) e obrigação legal (art. 7, II / art. 6(1)(c)). |
| **Fala com o atendimento** | O e-mail e o conteúdo da mensagem. | Responder, resolver o problema, reembolsar. | Execução de contrato e legítimo interesse (art. 7, V e IX / art. 6(1)(b) e (f)). |

Não vendemos dados pessoais. Não usamos seus dados para publicidade. Não tomamos decisões automatizadas com efeito jurídico sobre você: as respostas da IA são sugestões de texto.

## 3. O que o app faz por conta própria

Conferimos no código do app o que ele envia pela rede. Sem conta e sem o agente de IA configurado, só há duas coisas:

- **Consulta de atualização.** Alguns segundos depois de abrir um vault, e quando você pede, o app consulta o endereço de versões do app no GitHub (GitHub Releases). O GitHub, que é da Microsoft, vê o seu endereço IP e dados técnicos da conexão. Ao baixar uma atualização ou o instalador, o mesmo acontece. O GitHub tem política de privacidade própria.
- **Imagens por endereço da internet.** Se você mesmo colar numa nota uma imagem que aponta para um endereço da internet, o app carrega a imagem desse endereço, e o site de origem vê o seu IP. Imagens guardadas no vault não geram nenhuma conexão.

O app não tem telemetria, análise de uso, relatório de erro automático nem identificador de dispositivo. Erros ficam só no seu computador.

Conexões para conta, sincronização e IA do Excalisidian só acontecem depois que você entra na conta e usa o serviço. O agente de IA vem desligado e nenhuma chamada é feita sem a sua configuração e sem o seu aceite.

## 4. Sincronização: o que o servidor vê e o que não vê

A sincronização é cifrada de ponta a ponta (AES-256-GCM). A chave nasce da sua senha, dentro do seu computador, e nunca sai dele.

| O servidor vê | O servidor não vê |
|---|---|
| Seu e-mail e seu plano | Nome de arquivo ou de pasta, conteúdo |
| Quantos vaults sincronizados a conta tem | O nome do vault (vai cifrado) |
| Quantos pacotes cada vault tem, o tamanho aproximado de cada um e quando chegaram | Quantas notas existem, quais mudaram, quantas mudaram por pacote |
| Quantas sessões da sua conta enviam dados | Sua senha, a chave do vault e a chave que a protege |

Os pacotes têm o tamanho arredondado para cima, em degraus, para esconder o tamanho exato. Mesmo assim, o tamanho e o horário dos envios mostram ao servidor, de forma aproximada, quanto e quando você escreve. É um limite de qualquer sincronização e fazemos questão de declará-lo.

## 5. IA do Excalisidian

Quando você usa a IA do Excalisidian, o app envia o pedido ao nosso servidor, com a sua sessão. O servidor confere o seu plano e os seus créditos e repassa o pedido ao OpenRouter, que o encaminha a um provedor de inferência de IA. A resposta volta pelo mesmo caminho.

- **O que passa:** o texto necessário ao pedido, como trechos das notas, resumos, a memória que você confirmou e a sua conversa com o agente.
- **O que guardamos:** nada desse texto. Não o gravamos em banco nem em registro. Guardamos, por conta e por mês, apenas números: custo, quantidade de pedidos e tokens de entrada e saída, para contar os créditos.
- **Provedores:** pedimos ao OpenRouter que use somente provedores que declaram não guardar nem treinar modelos com os dados (parâmetro `data_collection: deny`). Isso depende da declaração desses provedores e do roteamento do OpenRouter. O OpenRouter e cada provedor têm políticas próprias.

Os seis provedores de chave própria compatíveis com o app são: Anthropic, OpenAI, Google Gemini, OpenRouter, Alibaba (DashScope) e Ollama (que roda no seu computador). Você também pode informar um endereço próprio. Com chave própria, o texto das notas selecionadas e a sua chave vão do seu computador direto ao provedor, e nós não os recebemos.

## 6. Transferência internacional de dados

Os dados dos serviços online ficam num servidor hospedado por [[HOSPEDAGEM_DO_SERVIDOR]].

O pedido da IA do Excalisidian pode ser processado fora do Brasil e fora da União Europeia, inclusive em países sem decisão de adequação. O OpenRouter está nos Estados Unidos. O provedor que roda o modelo pode estar em outro país, inclusive na China, e nem sempre conseguimos saber, antes de cada pedido, onde ele fica.

As salvaguardas que de fato existem são estas:

- só provedores que declaram não guardar nem treinar com os dados (`data_collection: deny`);
- nada do texto é guardado ou registrado no nosso servidor;
- o agente de IA é opcional, vem desligado e só envia algo depois do seu aceite;
- a IA com chave própria evita o nosso servidor por completo, e com Ollama nada sai do seu computador.

Os dados de pagamento podem ser tratados pela Stripe fora do Brasil, inclusive nos Estados Unidos (grupo Stripe, Inc.), com as salvaguardas contratuais da Stripe, descritas na política dela.

A transferência é necessária para prestar o serviço que você contratou (LGPD, art. 33, IX, combinado com o art. 7, V; GDPR, art. 49(1)(b)). Se você não quiser que o texto das suas notas saia do seu computador, use apenas o app local ou o Ollama.

## 7. Registros técnicos

O servidor registra cada requisição com o método, a rota sem parâmetros, o código de resposta e a duração. Nunca registra e-mail, token, prova de identidade, corpo do pedido nem identificador de vault.

Para cada pedido de IA que chega ao fornecedor, há uma linha a mais com dados técnicos: o nome do modelo lógico, se deu certo ou falhou, o nome do provedor que respondeu, um identificador da geração, a quantidade de tokens e o custo. Essa linha não traz e-mail, identificador da conta, token, chave nem o texto das mensagens.

O log comum do servidor, descrito acima, não tem endereço IP.

**Registros de acesso.** Separado desse log, e porque o Marco Civil da Internet (Lei 12.965/2014, art. 15) manda, guardamos registros de acesso à aplicação, em sigilo e em ambiente controlado. Cada registro tem o endereço IP, a data e a hora (em UTC) e o evento: criar conta, entrar, renovar a sessão ou usar a conta. O registro de uso é feito no máximo 1 vez por hora para cada conta e IP. Eles ficam por 6 meses e depois são apagados automaticamente. Só são entregues a uma autoridade por ordem judicial. A base legal é obrigação legal (LGPD, art. 7, II; GDPR, art. 6(1)(c)). Esses registros continuam guardados por até 6 meses mesmo que você apague a conta, porque a lei exige.

O endereço IP também é usado para atender a conexão e para limitar tentativas de entrar (no máximo 10 por minuto por IP e por e-mail). Esse contador fica só na memória e some quando o servidor reinicia.

## 8. Por quanto tempo guardamos cada coisa

| Dado | Quanto tempo |
|---|---|
| Conta (e-mail, plano, resumo da prova de identidade) | Até você pedir a exclusão da conta. |
| Sessão | Validade de 30 dias, renovada automaticamente enquanto você usa o app. Guardamos só o resumo do token. Sair da conta encerra a sessão. |
| Pacotes cifrados da sincronização | Enquanto a assinatura estiver ativa. Depois que ela termina, podem ser apagados após 90 dias. Se você voltar a assinar antes, continua de onde parou. Você pode pedir para apagar a qualquer momento, e o app também tem o botão "Apagar" na lista de vaults. |
| Contadores de créditos de IA (números por mês) | Enquanto a conta existir. |
| Texto das notas enviado à IA do Excalisidian | Não é guardado. |
| Registros de acesso (IP, data e hora, evento) | 6 meses, depois são apagados automaticamente. Ficam mesmo que a conta seja apagada. |
| Backups do servidor | 7 dias. Um dado apagado pode ainda existir nos backups até esse prazo passar. |
| Registros técnicos de requisição | Sem dados pessoais. Ficam no registro do sistema do servidor pelo tempo que o sistema os mantém. |
| Dados de pagamento | A Stripe guarda pelo prazo dela. Nós guardamos o registro das cobranças e as notas fiscais pelo prazo exigido pela legislação fiscal e tributária. |
| Mensagens de atendimento | Pelo tempo necessário para resolver o assunto e cumprir obrigações legais. |

## 9. Com quem compartilhamos (operadores e suboperadores)

Só compartilhamos o necessário para prestar o serviço:

- **[[HOSPEDAGEM_DO_SERVIDOR]]:** hospeda o servidor da conta, da sincronização e da IA. Guarda os dados cifrados da sincronização e a base de contas.
- **OpenRouter** e os **provedores de inferência de IA** para os quais ele encaminha, limitados aos que declaram não guardar nem treinar com os dados: recebem o texto dos pedidos da IA do Excalisidian.
- **GitHub:** distribui o app e as atualizações. Vê o IP de quem baixa ou consulta atualizações.
- **Stripe Brasil Soluções de Pagamento – Instituição de Pagamento Ltda.** (CNPJ 22.121.209/0001-46): processa os pagamentos e guarda os dados de cartão. Para prevenção a fraude e obrigações regulatórias próprias, a Stripe atua também como controladora independente, sob a política de privacidade dela.
- **[[EMISSOR_DE_NOTA_FISCAL]]:** emite as notas fiscais.
- **Contabilidade:** recebe os dados fiscais das vendas para cumprir obrigações legais.
- **Hospedagem do site:** entrega as páginas de excalisidian.com.

Também podemos divulgar dados se uma lei ou uma ordem de autoridade competente exigir.

## 10. Seus direitos

Pela LGPD (art. 18) e, quando se aplica, pelo GDPR, você pode pedir:

- confirmação de que tratamos dados seus e acesso a eles;
- correção de dados incompletos ou errados;
- anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;
- portabilidade dos dados;
- eliminação dos dados tratados com base no seu consentimento, e eliminação da sua conta;
- informação sobre com quem compartilhamos os dados;
- informação sobre a possibilidade de não consentir e suas consequências;
- revogação do consentimento, quando o tratamento se basear nele;
- oposição ao tratamento feito com base em legítimo interesse;
- limitação do tratamento (GDPR).

Como pedir: escreva para support@excalisidian.com, a partir do e-mail da conta, para sabermos que é você. Respondemos em até 15 dias.

Algumas observações práticas:

- **Seus arquivos** já estão com você, no seu computador, em Markdown. Não temos cópia legível deles.
- **Cópia na nuvem:** como ela é cifrada e não conseguimos abri-la, não temos como exportá-la em formato legível. Podemos apagá-la.
- **Excluir a conta:** peça por support@excalisidian.com, a partir do e-mail da conta. Em até 15 dias apagamos a conta, as sessões, os vaults na nuvem e os contadores de créditos. A conta some das cópias de segurança em até 7 dias depois, quando o backup gira. Os registros de acesso (seção 7) são a exceção: ficam até completar 6 meses, porque a lei manda.
- **Trocar o e-mail:** hoje o app não tem tela para isso. Se o e-mail estiver errado, fale conosco.
- **Reclamação:** você pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD) ou, se estiver na União Europeia, à autoridade de proteção de dados do seu país.

## 11. Cookies

O site excalisidian.com não usa cookies, ferramentas de análise nem fontes ou scripts de terceiros. As fontes e as imagens do site são servidas por ele mesmo. A página de demonstração no site guarda o que você digita só na memória da página, e nada é enviado a nenhum serviço. O app também não usa cookies. Os links para o GitHub levam a um site de terceiros, que tem as próprias regras.

Se isso mudar, atualizamos esta política e pedimos o seu consentimento quando a lei exigir.

## 12. Segurança

Medidas que de fato usamos:

- conexão cifrada (HTTPS) com certificado válido;
- cifra de ponta a ponta na sincronização (AES-256-GCM), com chave derivada da senha por Argon2id, dentro do seu computador;
- a senha nunca é enviada: o servidor recebe só uma prova derivada dela e guarda apenas um resumo lento (scrypt);
- tokens de sessão guardados no servidor só como resumo, e no seu computador no cofre de credenciais do sistema operacional, quando o sistema oferece um;
- limite de tentativas de entrada, de pedidos de IA por minuto e de espaço por conta;
- o servidor roda com privilégios reduzidos, e a chave do fornecedor de IA fica fora do repositório e do app;
- backup diário, guardado por 7 dias. Ele fica no mesmo servidor, então protege contra erro de software, mas não contra a perda do servidor inteiro.

Um limite que você precisa saber: as chaves de API dos provedores de IA que você mesmo configura ficam num arquivo de configuração do app, no seu computador, sem cifra adicional. Quem tiver acesso à sua conta de usuário do sistema pode lê-las.

Nenhum sistema é totalmente seguro. Se ocorrer um incidente que possa causar risco relevante a você, avisamos você e a autoridade competente nos prazos da lei.

## 13. Crianças e adolescentes

Os serviços online não são destinados a menores de 18 anos sem autorização de um responsável legal. Não criamos contas para menores de 13 anos. Se descobrirmos uma conta assim, vamos apagá-la. Se você é responsável por um menor e acredita que ele criou uma conta, fale conosco.

## 14. Mudanças nesta política

Podemos atualizar esta política. Para mudanças relevantes, avisamos por e-mail ou no app com antecedência razoável. A data de "Última atualização" no topo mostra a versão em vigor.

## 15. Contato

Dúvidas, pedidos de direitos e questões de privacidade: support@excalisidian.com.

[[RAZAO_SOCIAL]] · CNPJ [[CNPJ]] · [[ENDERECO]] · Encarregado: [[NOME_DO_ENCARREGADO]]
