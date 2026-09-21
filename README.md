# Casal Pet Sitter — Sistema

Sistema web full-stack para o Casal Pet Sitter de Viçosa/MG.

## Stack
- Node.js + Express
- PostgreSQL
- Sessões persistidas no PostgreSQL
- Autenticação com bcrypt
- Helmet, rate limiting e proteção CSRF para ações administrativas
- Frontend responsivo sem dependência de CDN
- Integrações opcionais: WhatsApp Cloud API e Google Calendar

## Recursos
- Site público com serviços, apresentação e pré-agendamento.
- Cálculo de preços refeito no servidor.
- Histórico de solicitações.
- Área administrativa com login.
- Status: Nova, Em análise, Confirmada, Concluída e Cancelada.
- Financeiro com recebimentos, despesas e resultado líquido.
- Registro de pagamentos vinculados ou não a um atendimento.
- Alteração de senha.
- Log básico de auditoria.
- Política de privacidade.

## Preços implementados
- Pet sitter: R$ 35/visita.
- Pet sitter + passeio de 15 min: R$ 50/visita.
- Passeio avulso de 30 min: R$ 50.
- Hospedagem: R$ 70/diária até 5 diárias; acima de 5 diárias: R$ 65/diária.
- Vacinação: valor a confirmar.

## Produção
Configure no Render as variáveis do `.env.example`. Nunca publique senhas ou tokens no GitHub.

O backend cria automaticamente as tabelas prefixadas com `cps_` na inicialização e cria os administradores iniciais somente quando os e-mails/senhas correspondentes estão configurados e ainda não existem no banco.

### Observação sobre financeiro
`estimated_total` é o valor estimado/contratado do serviço. O painel só soma como **Recebido** valores efetivamente lançados em `cps_payments`.
