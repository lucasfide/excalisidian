# Pendências dos textos legais

O que o dono precisa preencher ou decidir antes de publicar os Termos de uso e a Política de privacidade. Os textos não substituem revisão jurídica.

## Preencher (marcadores)

- `[[RAZAO_SOCIAL]]`, `[[CNPJ]]`, `[[ENDERECO]]`
- `[[HOSPEDAGEM_DO_SERVIDOR]]` (empresa da VPS)
- `[[EMISSOR_DE_NOTA_FISCAL]]` (serviço de emissão de NFS-e, a contadora indica)
- `[[DATA_DE_PUBLICACAO]]`
- `[[COMARCA_DO_FORO]]` (foro de quem não é consumidor)
- `[[NOME_DO_ENCARREGADO]]` (LGPD art. 41)

O e-mail de contato (`support@excalisidian.com`) já está nos textos e em `src/data/empresa.ts`.

## Decidir ou confirmar

1. **Provedor de IA possivelmente na China.** O texto declara isso (doc 09, item 31). Confirmar com o dono. Verificar também a política de retenção do OpenRouter e se é preciso representante na UE (GDPR art. 27).
2. **Cópia na nuvem após o fim da assinatura.** O plano grátis recebe 403 na sincronização, então por 90 dias a cópia fica guardada mas a pessoa não consegue baixá-la sem assinar. Aceitar assim ou criar download somente leitura. A exclusão automática após 90 dias ainda é manual.
3. **Linux e macOS.** O cofre de credenciais está implementado nos três sistemas. Falta testar em máquina real no Linux e no macOS.
4. **Hospedagem do site.** Dizer quem hospeda o site (se for a mesma VPS, ajustar a política).
5. **Troca de e-mail da conta.** Não existe tela e a prova de identidade depende do e-mail. O texto manda falar com o suporte, o que na prática exige conta nova.
6. **Valores escolhidos por mim, para validar:** aviso de mudança de preço com 30 dias; resposta a pedidos de titular em 15 dias; limite de responsabilidade de 12 meses para quem não é consumidor; prazo de guarda fiscal "pelo prazo da legislação fiscal e tributária".
7. **Cobrança:** o ciclo de cobrança não coincide com o mês civil dos créditos. O texto não promete créditos proporcionais.
8. **Imposto em outros países.** A empresa vende direto pela Stripe, inclusive para fora do Brasil. O dono decidiu tratar impostos só com a contadora, no Brasil. Um advogado deve confirmar o risco de vender a consumidor estrangeiro sem recolher imposto local. Conferir também se o preço em reais inclui imposto (doc 09, item 35).
9. **NFS-e por cobrança.** Cada cobrança gera uma nota fiscal de serviço, emitida por um serviço de emissão que a contadora vai indicar. Definir o emissor e preencher o marcador.
