# Prompt de continuidade — Tectique 0.9.0

Continue a Tectique a partir deste pacote, construído sobre a v0.8.0. Preserve o visual, o editor existente, dados e credenciais. Use TypeScript e PostgreSQL; não migre para Python ou outro banco. Hospedagem e escolha de provedor de e-mail ainda serão decididas pelo usuário.

## Implementado na v0.9.0 (Etapa 4)
CRM real em server/src/crm.ts, frontend/src/crm-api.ts e frontend/src/pages/Crm.tsx. Migração v5 em migrateCrm chamada pelo migrador principal: tectique_contacts, tectique_crm_activity, tectique_crm_tasks. Isolamento por workspace nas rotas e chaves estrangeiras compostas, índice único case-insensitive de e-mail, arquivamento reversível, versão para conflito de atualização.

Cadastro/edição, busca, filtros, funil por etapa, notas, histórico paginado, tarefas com prazo/conclusão/reabertura, totais reais no Dashboard. Papel viewer somente consulta. Arquivados preservam histórico e tarefas; não são editáveis até restauração. Os formulários usam o horário local do navegador e enviam prazos em ISO para timestamptz.

Bloco crm.contact recebe name/email obrigatórios e phone/company/source opcionais. Upsert transacional por e-mail com trava para concorrência, mantém etapa e campos omitidos, recusa arquivados. Não dispara comunicação externa por si só. Exemplo importável em examples/captura-cliente.json e botão Criar fluxo de captura em Modelos prontos. Testes em server/test/crm.test.ts, incluídos no comando npm test.

O funil tem uma etapa por contato, não oportunidades separadas. Tarefas têm prazo exibido no app, sem notificação automática, e podem ser criadas, concluídas ou reabertas; edição do título/prazo existente, CSV, tags, responsáveis, arrastar cartões e oportunidades separadas ficam para depois. Não descreva esses limites como funcionalidades prontas.

## Preservado da v0.8.0 (Etapa 3)
- Blocos trigger.webhook, http.request e email.send registrados no catálogo e editor.
- Formulários HTTP e SMTP em Integrações; credenciais AES-256-GCM vinculadas ao workspace. Tipos http e smtp guardam JSON validado; apenas administradores gerenciam.
- HTTP HTTPS/443 com host exato autorizado pela conexão, DNS público verificado e IP fixado, sem redirects, corpo 32 KB e resposta 128 KB, Bearer/X-API-Key opcionais, status/corpo como saída.
- SMTP via Nodemailer, TLS obrigatório em 465/587, certificado verificado, remetente fixo na conexão, um destinatário e texto. Sem anexos/HTML/OAuth. Socket próprio para interromper a conexão quando o tempo limite cancelar o bloco.
- POST /api/hooks/:id autenticado por Bearer; X-Tectique-Event-Id obrigatório. Deduplicação transacional permanente em tectique_webhook_events, limite de fila e mascaramento do corpo antes de persistir. Token armazenado somente em hash SHA-256, mostrado uma vez, rotação/revogação com auditoria.
- GET/POST/DELETE /api/workspaces/:wid/flows/:id/webhook permitem consultar estado, ativar/rotacionar e revogar. Gerenciamento restrito a administradores.
- Migração v4 aditiva, aceita trigger_type webhook em fluxos/execuções e adiciona coluna webhook_hash e tabela de eventos. Não apague .local ou sua master.key.
- Histórico oculta também tokens/senhas individuais extraídos do JSON criptografado. O fluxo contém somente o nome da conexão.
- Layout do editor corrigido para janelas estreitas; campos do painel seguem o tema escuro.

## Arquivos principais
server/src/engine/connections.ts, blocks.ts, executor.ts, definition.ts, schema.ts, secrets.ts; server/src/webhooks.ts, app.ts, flows-api.ts; frontend/src/editor/model.ts, Inspector.tsx, WebhookPanel.tsx; páginas Builder/Integrations/Runs e FlowsPanel; api.ts e workspace.css.

## Testes
Build aprovado no Windows. 71 testes: 30 unitários/modelo/contratos e 41 com PostgreSQL real. Novos testes em server/test/connections.test.ts e webhooks.test.ts. Consulta HTTPS pública real retornou 200. Não há confirmação de entrega SMTP externa: testes de SMTP usam transporte controlado. Nunca afirme que um provedor real está conectado sem verificar. Não publique nem envie e-mails a pessoas durante testes sem instrução do usuário.

## Limites a respeitar
- Servidor local apenas 127.0.0.1:8000; não há endpoint acessível pela internet ainda.
- Webhooks usam contrato próprio Bearer + ID, não assinaturas nativas de GitHub/Stripe etc.
- HTTP só HTTPS/443, corpo JSON por pares; sem cabeçalhos arbitrários, Basic/OAuth, arquivos ou streaming.
- SMTP aceite não equivale a entrega. Nova tentativa após resultado incerto pode duplicar envio; não repetir efeitos automaticamente.
- Segredos digitados manualmente em campos livres podem ir para a definição/exportação. Credenciais devem ser cadastradas em Integrações.
- As três telas conceituais continuam desativadas e sinalizadas. Não substitua isso por dados inventados.

## Antes de desenvolver a próxima etapa
Leia o README e inspecione o código atual. Pergunte qual módulo é prioridade se o usuário não indicar. Para validar, npm run setup, npm run build, npm run test:unit e npm test. Os bancos de teste são temporários; não use a instalação pessoal para testes destrutivos. Ao entregar, atualize versão, README e este prompt, e gere ZIP sem .local, .env, node_modules, logs, credenciais ou contas de teste.
