# Casal Pet Sitter no Render: site público estático + backend

## Objetivo

- **Site rápido para clientes:** Static Site no Render (CDN), sem suspensão por inatividade.
- **Agendamentos, área do casal e cartões de vacina:** Web Service atual `https://casal-pet-sitter.onrender.com`.
- **Banco Neon:** mantido, sem migração ou remoção de dados.
- Mesmo layout, serviços, tabela de preços e formulário da versão atual.

## Configurar no Render

1. Primeiro atualize o **Web Service existente** com o código da branch `main` e aguarde seu deploy ficar saudável. Não exclua nem altere a variável `DATABASE_URL` existente, nem os dados do Neon.
2. No Render, clique em **New > Blueprint**, escolha o repositório `luanmagalhaes2464-sys/Pettsitter` e use o `render.yaml`. O Blueprint cria somente o Static Site `casal-pet-sitter-site`, não cria novo banco nem recria o serviço existente.
3. Alternativamente crie **New > Static Site** selecionando o mesmo repositório, com Build Command `node scripts/build-static.mjs` e Publish Directory `dist-static`.
4. Se o Render atribuir a URL prevista `https://casal-pet-sitter-site.onrender.com`, a integração do formulário com o backend funciona com os valores-padrão do código.
5. Se o Render atribuir outra URL, defina no **Static Site** a variável `PUBLIC_SITE_ORIGIN` com a nova origem e, no **Web Service do Pet Sitter**, `PUBLIC_SITE_ORIGINS` com a mesma origem. Use apenas o domínio com `https://`, sem barra final. Faça redeploy dos dois.
6. Se o backend mudar de URL, ajuste `CPS_API_BASE` no Static Site, usando somente a origem do novo backend, e redeploy do site.
7. Faça um teste real de pré-agendamento no site estático; confira o registro no painel administrativo e os avisos no e-mail/WhatsApp. Se for um teste, exclua o registro pelo próprio painel depois.
8. Somente após testar, divulgue o **novo link estático** aos clientes e atualize a bio/Google. O link antigo permanece funcional, mas ainda pode despertar lentamente.

## Comportamento esperado

- Abrir a home, consultar serviços e calcular o preço não depende do Web Service e é rápido.
- Ao tocar em **Confirmar pré-solicitação**, o navegador envia `POST` para `CPS_API_BASE/api/bookings`. Em plano Free, o backend ainda pode demorar a responder na primeira solicitação após suspensão.
- O link **Área do casal** segue direto para o backend original `/login`; não há sessão administrativa nem dados privados publicados na CDN.
- O cartão de vacina continua no backend, usando seus links originais.
- O backend permite CORS **apenas para `/api/bookings` e somente para as origens configuradas**. Não ative CORS global para login, sessão ou painel.
- O Static Site publica somente os arquivos incluídos pelo script. Nenhum arquivo `admin.js`, `setup.js`, `.env` ou `server.js` é incluído.

## Verificação antes do deploy

```sh
node --check server.js
node --check public/app.js
node scripts/build-static.mjs
node scripts/test-static-build.mjs
```

O diretório `dist-static/` é gerado durante o build, não deve ser commitado.

## Rollback

- Se houver problema no site novo, continue usando `https://casal-pet-sitter.onrender.com`; o Web Service não foi substituído.
- Para reverter alterações do backend, use o histórico do deploy/commit no Render e GitHub. O Neon permanece intacto.
