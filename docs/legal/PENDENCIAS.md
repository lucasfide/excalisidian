# Pendências dos textos legais

O que o dono precisa preencher ou decidir antes de publicar os Termos de uso e a Política de privacidade. Os textos não substituem revisão jurídica.

## Preencher (marcadores)

- `[[RAZAO_SOCIAL]]`, `[[CNPJ]]`, `[[ENDERECO]]`, `[[EMAIL_CONTATO]]`
- `[[HOSPEDAGEM_DO_SERVIDOR]]` (empresa da VPS)
- `[[DATA_DE_PUBLICACAO]]`
- `[[COMARCA_DO_FORO]]` (foro de quem não é consumidor)
- `[[NOME_DO_ENCARREGADO]]` (LGPD art. 41)

## Decidir ou confirmar

1. **Licença do app.** `LICENSE` e `THIRD_PARTY_LICENSES.md` ainda dizem MIT. Trocar para a licença proprietária com código visível antes da próxima versão. Um advogado deve conferir se "uso próprio" cobre uso por empresas.
2. **Intermediário de pagamento.** Escolher e citar o nome na política. Conferir se o preço em reais inclui imposto (doc 09, item 35).
3. **Provedor de IA possivelmente na China.** O texto declara isso (doc 09, item 31). Confirmar com o dono. Verificar também a política de retenção do OpenRouter e se é preciso representante na UE (GDPR art. 27).
4. **Linux e macOS.** O cofre de credenciais e o instalador existem só para Windows, mas o site oferece Linux e macOS. Confirmar o que funciona antes de prometer conta e sincronização nessas plataformas.
5. **Cópia na nuvem após o fim da assinatura.** O plano grátis recebe 403 na sincronização, então por 90 dias a cópia fica guardada mas a pessoa não consegue baixá-la sem assinar. Aceitar assim ou criar download somente leitura. Implementar a exclusão automática após 90 dias.
6. **Registros de acesso.** Confirmar que o servidor guarda exatamente o que o texto diz (IP, data e hora em UTC, evento, uso no máximo 1 por hora por conta e IP, 6 meses, apagamento automático, sigilo).
7. **Exclusão de conta.** Confirmar que o procedimento interno apaga conta, sessões, vaults e contadores, e que o prazo de 15 dias é cumprido.
8. **Hospedagem do site.** Dizer quem hospede o site (se for a mesma VPS, ajustar a política).
9. **Troca de e-mail da conta.** Não existe tela e a prova de identidade depende do e-mail. O texto manda falar com o suporte, o que na prática exige conta nova.
10. **Valores escolhidos por mim, para validar:** aviso de mudança de preço com 30 dias; resposta a pedidos de titular em 15 dias; limite de responsabilidade de 12 meses para quem não é consumidor; prazo de guarda fiscal "pelo prazo legal".
11. **Cobrança:** o ciclo de cobrança não coincide com o mês civil dos créditos. O texto não promete créditos proporcionais.
12. **Imagens.** Corrigir o campo `credito` em `src/data/wallpapers.ts` (Belisário, Marat, Leônidas, Germânico, Brutus, Horácios, Elimas) e publicar o crédito das duas fotos CC BY-SA. Ver `creditos-de-imagens.md`. Conferir o local do original de Marat (Bruxelas).
