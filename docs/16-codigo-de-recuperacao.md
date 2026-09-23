# 16 — Código de recuperação

**Este documento não é normativo.** Ele existe para explicar uma coisa que foi construída
sem você ter percebido, e para você decidir o que fazer com ela. Escrito em 22/09/2026, a
pedido direto do usuário, depois que ele disse: *"eu não tava sabendo desse código de 24
caracteres, acho que passou despercebido por mim"*.

Nada aqui está decidido. O módulo existe no código e **nenhuma tela do produto usa**.

---

## 1. De onde isso veio

No estudo de viabilidade do plano pago, você respondeu a uma pergunta sobre sincronização.
A pergunta era se o servidor poderia ler o conteúdo dos vaults, e você escolheu:

> **Criptografado ponta a ponta, sem leitura pelo servidor.**

Foi a escolha certa para este produto, e é coerente com tudo o que o Excalisidian é. Mas ela
tem uma consequência que naquele momento apareceu como uma linha de texto entre várias, e
que eu deveria ter isolado melhor:

> **Não existe "esqueci minha senha".**

Esse documento existe porque essa frase merecia uma conversa inteira, e teve uma linha.

---

## 2. Por que não existe "esqueci minha senha"

Quando você usa a maioria dos serviços — e-mail, banco, rede social — e esquece a senha,
eles conseguem te devolver o acesso. Conseguem porque os dados estão legíveis no servidor
deles: a senha só tranca a porta, não o conteúdo. Eles trocam a fechadura e você entra.

Na sincronização que desenhamos, a senha **não é a fechadura, é a chave que embaralha**. O
que sobe para o servidor já vai embaralhado, e a conta que desembaralha só existe dentro da
sua máquina, derivada da sua senha.

O servidor guarda algo parecido com isto:

```
7f3a1c...  (63 KB de bytes sem sentido)
9b2e44...  (12 KB de bytes sem sentido)
```

Ele não sabe que o primeiro é a sua nota de reunião de terça e que o segundo é um desenho.
Não sabe nem quantas notas você tem, porque **os nomes dos arquivos também são
embaralhados**.

Então, se você esquecer a senha:

- eu não consigo recuperar;
- o servidor não consegue recuperar;
- ninguém consegue recuperar;
- **os arquivos sincronizados viram lixo permanente.**

Isso não é uma falha do desenho. É o preço exato da privacidade que você escolheu. Todo
serviço que faz criptografia de verdade tem esse mesmo preço — o Bitwarden, o Signal, o
Proton. Quem promete privacidade total **e** recuperação de senha está mentindo em uma das
duas pontas.

**Atenção a um ponto que muda tudo:** isso vale para o que está **no servidor**. Os arquivos
na sua máquina continuam lá, legíveis, em Markdown, como sempre. Perder a senha não apaga o
seu vault local. Você perde as cópias sincronizadas e o acesso a partir de outros
computadores.

---

## 3. O que é o código de recuperação

É a rede de proteção. Uma sequência que o app gera na criação da conta e mostra **uma única
vez**, para você anotar ou imprimir. Ela funciona como uma segunda chave, equivalente à
senha, guardada em papel.

Hoje, do jeito que o módulo está escrito, ela tem esta cara:

```
K7MP-3RT9-WXQ2-BHJ5-NFD8-VYC4
```

São 24 caracteres, mostrados em grupos de quatro para facilitar a leitura. Os hifens são só
enfeite visual — o app aceita com ou sem eles, e aceita em minúsculas.

### O alfabeto não tem todas as letras

O código só usa estes 31 caracteres:

```
A B C D E F G H J K M N P Q R S T U V W X Y Z 2 3 4 5 6 7 8 9
```

Faltam de propósito: **0, O, 1, I e L**. São os cinco que as pessoas confundem ao copiar de
um papel — zero com ó, um com i maiúsculo, i maiúsculo com éle minúsculo. Como esse código
vai ser lido à mão, num momento provavelmente tenso, tirar a ambiguidade vale mais do que
ter um alfabeto maior.

### Quão forte é

Cerca de **119 bits de aleatoriedade**. Na prática: é da mesma ordem de grandeza de uma
chave de criptografia de 128 bits, o padrão que protege transações bancárias. Alguém com
todos os seus arquivos embaralhados em mãos, tentando adivinhar sem limite de tentativas,
não chega lá com a tecnologia existente.

Os números vêm do gerador criptográfico do sistema operacional, não de um sorteio comum de
programação. Isso foi conferido: não há nenhum caminho no código em que ele seja trocado por
algo mais fraco.

---

## 4. O que está construído e o que não está

| Coisa | Situação |
|---|---|
| Gerar o código | **Pronto e testado** |
| Formatar em grupos de quatro | **Pronto e testado** |
| Aceitar o que o usuário digitar (maiúscula, minúscula, com ou sem hífen) | **Pronto e testado** |
| Conferir se tem o tamanho certo | **Pronto e testado** |
| Mostrar o código numa tela | **Não existe** |
| Usar o código para abrir o vault | **Não existe** |
| A própria sincronização | **Não existe** |

O módulo é `src/conta/codigoDeRecuperacao.ts`, tem cerca de 40 linhas e 10 testes.

Ele foi escrito agora, mesmo sem consumidor, por um motivo: a decisão sobre o alfabeto e o
tamanho precisa estar tomada com calma, e não improvisada no meio do trabalho de
sincronização, que é o maior e mais arriscado dos planos. Escrevi como parte do plano de
conta e **instruí explicitamente que nenhuma tela o usasse** — mostrar um código de
recuperação hoje prometeria uma recuperação que o produto ainda não sabe fazer. Essa
promessa, quebrada, custa o vault de alguém.

O que faltou foi eu ter te explicado isso quando aconteceu, em vez de deixar numa linha de
plano.

---

## 5. A decisão que está aberta

Uma revisão levantou o seguinte: **o código não tem dígito verificador.**

Um dígito verificador é um caractere a mais no fim, calculado a partir dos outros — a mesma
ideia dos dois últimos números do CPF. Ele não deixa o código mais forte contra ataque; ele
deixa o app capaz de detectar erro de digitação.

### Sem dígito (como está hoje)

Você pega o papel e digita, trocando um `S` por um `5` sem perceber. O app conta os
caracteres, vê 24, acha que está tudo certo, e tenta abrir o vault. Falha. A única coisa que
ele consegue te dizer é:

> Não foi possível abrir com este código.

E você fica sem saber se digitou errado ou se perdeu tudo de verdade. Vai tentar de novo, às
cegas, com o coração acelerado.

### Com dígito

O app confere a conta antes de tentar qualquer coisa, vê que não fecha, e diz:

> Este código parece ter um erro de digitação. Confira os caracteres e tente de novo.

### O custo de cada caminho

**Acrescentar agora** custa quase nada: um caractere a mais no código (fica com 25), umas
poucas linhas no módulo, e nenhum usuário afetado — porque ninguém tem um código impresso
ainda.

**Acrescentar depois** custa muito: mudar o formato invalida todo papel já impresso. Quem
guardou um código de 24 caracteres descobriria, no pior momento possível, que o app não
aceita mais o formato dele.

Por isso essa decisão tem prazo. Ela é de graça enquanto nenhuma tela mostrar o código, e
cara para sempre depois disso.

---

## 6. As perguntas que ficam para você

Não responda agora. Leia com calma.

1. **O código de recuperação deve existir?** A alternativa é não ter nenhuma volta atrás:
   esqueceu a senha, perdeu o sincronizado. É defensável — alguns produtos fazem assim, e é
   mais simples. Mas é uma conversa que o usuário precisa ter com você na criação da conta,
   com todas as letras.

2. **Ele ganha dígito verificador?** É agora ou nunca.

3. **O que a tela de criação de conta faz com ele?** Mostra e deixa copiar? Obriga a
   confirmar que guardou, digitando de volta? Oferece imprimir? Quanto mais fricção, menos
   gente perde o vault — e mais gente desiste de criar conta.

4. **E se a pessoa perder o papel E a senha?** Hoje a resposta é "perdeu". Existe alguma
   concessão que você aceitaria fazer, ou essa é a linha?

---

## 7. O que eu deveria ter feito diferente

Você escolheu a criptografia ponta a ponta respondendo a uma pergunta de múltipla escolha, e
eu listei a consequência — "não existe esqueci minha senha" — como um item entre outros.
Era a consequência mais séria do produto inteiro e merecia parar a conversa.

Depois, escrevi um módulo que materializa essa decisão sem te mostrar como ele ficou. O
módulo está correto e bem testado, mas você descobriu a existência dele por uma pergunta
minha sobre um detalhe técnico — o que é a pior ordem possível.

Este documento é a correção disso.

---

## 8. Perguntas do usuário, respondidas (23/09/2026)

Duas perguntas que mostraram lacunas neste documento.

### 8.1 "Quando esse código é solicitado?"

O documento não dizia, e isso provavelmente é a raiz do desconforto. A resposta curta:
**quase nunca.**

| Situação | O que o app pede |
|---|---|
| Abrir o app, no dia a dia | Nada |
| Instalar num computador novo | A senha do vault, uma vez |
| Trocar de computador outra vez | A senha, uma vez naquele computador |
| Esqueceu a senha, num computador novo | O código de recuperação |

Quando um computador novo é conectado, o app pede a senha uma vez, deriva a chave e a
guarda **no cofre do sistema operacional** — o mesmo cofre já decidido para o token da
conta. Dali em diante aquele computador abre sozinho, sem perguntar nada.

O código de recuperação é um extintor de incêndio: fica na parede, espera-se nunca usar, e
só serve no dia em que a senha não está mais na cabeça de ninguém e o computador que a
guardava não existe mais.

Pedir a senha a cada abertura seria hostil e contraria o princípio de que o app funciona
inteiro sem atrito. Não está proposto em lugar nenhum.

### 8.2 "Não podemos pedir uma senha forte, de no mínimo 16 caracteres, em vez do código?"

Dá, e é o que produtos reais fazem. O Obsidian Sync funciona assim: você define uma senha de
criptografia e eles avisam que, se perdê-la, os dados vão junto. Sem código de recuperação.

Mas existe um número contraintuitivo que precisa estar escrito aqui.

**Uma senha de 16 caracteres escolhida por uma pessoa não vale 16 caracteres de força.**
Pessoas escolhem padrões: palavras conhecidas, datas, substituir `a` por `@`, maiúscula no
começo e número no fim. Na prática, uma senha humana de 16 caracteres costuma valer entre
**30 e 45 bits** de aleatoriedade. O código gerado vale **119**.

A diferença importa por causa do tipo de ataque possível aqui. Quem obtiver os arquivos
embaralhados do servidor ataca **offline**: na máquina dele, sem limite de tentativas, com
placas de vídeo, pelo tempo que quiser. Não há bloqueio após três erros, porque não há
servidor no meio para bloquear.

Isso tem remédio parcial e obrigatório: **derivação lenta de chave** (Argon2id ou
equivalente), que torna cada tentativa cara de propósito. Transforma bilhões de tentativas
por segundo em algumas centenas. Seria usado de qualquer forma, com ou sem código de
recuperação.

Conclusão honesta: senha humana forte + derivação lenta é **aceitável**. Não é equivalente
ao código gerado, e a diferença aparece exatamente no cenário de um vazamento do servidor.

### 8.3 Um quarto caminho: palavras em vez de caracteres

Se a objeção ao código é que ele é impossível de memorizar e fácil de errar ao copiar,
existe meio-termo. Em vez de:

```
K7MP-3RT9-WXQ2-BHJ5-NFD8-VYC4
```

o app gera uma sequência de palavras sorteadas:

```
girafa-tapete-vinagre-oceano-martelo-cadeira-trombone
```

Sete palavras sorteadas de uma lista grande valem por volta de **90 bits** — muito acima de
qualquer senha humana, e da mesma ordem do código atual. E é incomparavelmente mais fácil de
ditar por telefone, copiar de um papel sem errar, e até memorizar para quem quiser.

Esse formato também resolve sozinho o problema do dígito verificador: palavra errada não
existe na lista, então o app detecta o erro de digitação sem precisar de caractere extra.

### 8.4 As combinações possíveis

| Desenho | Força | Se esquecer | Atrito |
|---|---|---|---|
| Só senha humana (mín. 16) | Fraca a média | **Perde tudo** | Mínimo |
| Só código gerado em caracteres | Muito forte | Perde tudo | Alto — ninguém memoriza |
| Só sequência de palavras | Forte | Perde tudo | Médio |
| Senha humana **+** palavras como reserva | Forte | Recupera pela reserva | Médio |
| Senha humana **+** código em caracteres | Forte | Recupera pelo código | Alto |

A quarta linha é a que eu recomendaria: a pessoa escolhe a senha que vai digitar quando
conectar um computador novo, e o app gera a sequência de palavras como reserva, para
guardar. Nenhuma das duas é pedida no uso diário.

**Nada disso está decidido nem implementado.** O módulo atual implementa apenas a segunda
linha da tabela, e nenhuma tela o usa.
