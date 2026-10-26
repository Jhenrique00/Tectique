# Tectique 0.9.0 — Clientes e CRM

Base: Tectique 0.8.0. React + TypeScript, Express + TypeScript e PostgreSQL. Mantém o editor visual, os fluxos, GitHub Analytics, rotinas, histórico, workspaces e papéis existentes.


## Novidade da v0.9.0: Clientes e CRM (Etapa 4)

- Cadastro e edição: nome, e-mail, telefone, empresa e origem. O e-mail é opcional no cadastro manual; quando informado, é único por workspace (inclusive nos arquivados).
- Funil com seis etapas: Novo, Contato feito, Proposta enviada, Negociação, Fechado e Perdido. Troque a etapa no seletor do cartão ou nos detalhes. Uma etapa por contato, sem oportunidades comerciais separadas nesta versão.
- Busca por nome, e-mail, telefone e empresa; filtros de etapa e arquivados, paginação de 30 registros. O funil mostra os contatos da página atual, conforme indicado na tela.
- Anotações e histórico persistente de cadastro, alterações de etapa, arquivamento e tarefas, com autor e horário.
- Tarefas por contato: título, prazo opcional, concluir e reabrir. Pendentes e atrasadas aparecem nos totais. São lembretes dentro do app; não há envio automático de lembretes por e-mail nesta versão.
- Arquivar e restaurar preserva histórico e tarefas. Contatos arquivados saem da lista ativa e das tarefas operacionais. Não há exclusão definitiva pela interface.
- Leitores apenas consultam. Membros, administradores e donos operam o CRM. Conflitos de edição simultânea retornam uma mensagem para recarregar os dados.
- O Dashboard agora mostra a quantidade real de contatos ativos.

### Capturar clientes por automação

O novo bloco **Cadastrar ou atualizar contato** usa o e-mail para encontrar o contato. Nome e e-mail são obrigatórios; telefone, empresa e origem são opcionais. A captura preserva a etapa comercial e os campos que não vierem na configuração. Repetições concorrentes do mesmo e-mail não criam vários contatos. Contato arquivado precisa ser restaurado manualmente antes de receber uma atualização automática.

Em Modelos prontos, clique em **Criar fluxo de captura**. Ele abre no editor; ative o webhook como administrador. Também é possível importar `examples/captura-cliente.json` no Criador de fluxos. Envie um evento com `{"name":"Ana","email":"ana@example.com"}`, seguindo os cabeçalhos descritos abaixo. O contato aparecerá no CRM e a saída do bloco terá `contact_id`, `name`, `email`, `stage` e `created`. O arquivo é um modelo, não cria contatos até você enviar um evento ou executar com os dados necessários.

A migração v5 cria três tabelas e seus índices sem apagar dados existentes. Preserve a pasta `.local` na atualização. Não surgem novos serviços obrigatórios para usar o CRM local.

### Verificação da v0.9.0

Build aprovado no Windows. 71 testes passaram: 30 unitários/modelo e 41 com PostgreSQL real, incluindo 9 testes do CRM (permissões, isolamento, duplicidade, conflitos, arquivamento, tarefas e webhook → CRM). A conferência no navegador cobriu cadastro, mudança de etapa, anotações, conclusão de tarefas prazo salvo/exibido como atrasado e criação do modelo de captura no editor. Foi corrigido o envio da data preenchida no formulário. Os testes e a prévia usam dados fictícios, que não estão no ZIP.

### Limites do CRM nesta etapa

Sem importação/exportação CSV, arraste dos cartões, etiquetas, responsável por contato, oportunidades separadas, edição de tarefas já criadas ou notificações externas de prazo. O histórico registra os tipos de alteração; não mantém versões antigas completas de todos os campos. O cadastro manual pode não ter e-mail, mas o bloco automático precisa dele para localizar o contato.

## Atualizar no Windows sem perder dados

1. Feche a versão antiga com Ctrl+C e aguarde o encerramento.
2. Faça uma cópia de segurança da pasta inteira da instalação, incluindo `.local` e `.env`, se existir.
3. Extraia este ZIP e copie o conteúdo de `tectique-node` sobre a instalação antiga. Substitua os arquivos de código, preservando `.local` e `.env`.
4. Execute `npm run setup` no terminal dessa pasta (necessário nesta atualização para instalar Nodemailer e ipaddr.js).
5. Abra `Iniciar.cmd`. Ou execute `npm run build` e depois `npm start`.
6. Abra http://127.0.0.1:8000 e use sua conta existente. Em uma instalação nova, crie uma conta.

Requer Node.js >= 22.13.0. Não precisa de Python, Java ou PostgreSQL instalado separadamente. A migração v4 é automática e preserva as tabelas e registros existentes. **Preserve `.local/master.key`**: sem essa chave as credenciais antigas não podem ser decifradas. O ZIP não contém banco, contas ou segredos de teste.

## 1. Requisição HTTP

Em **Integrações → Credenciais**, escolha **Conexão HTTP**. Informe um nome (por exemplo `github-publico`) e o servidor autorizado (`api.github.com`, sem https:// nem caminho). O token pode ficar vazio para APIs públicas; para autenticação, escolha Bearer ou X-API-Key.

No editor, adicione **Requisição HTTP**, informe o nome da conexão e a URL completa. Conecte ao gatilho e salve. Exemplo sem token: `https://api.github.com/zen`, método GET. A saída fica em `steps.http.output.status` e `steps.http.output.body` (substitua `http` pelo identificador real do bloco).

Métodos: GET, HEAD, POST, PUT, PATCH e DELETE. POST/PUT/PATCH/DELETE enviam JSON. Suporta variáveis do gatilho e etapas anteriores. Apenas HTTPS/443, host exato da conexão, sem redirecionamentos, URLs com senha ou rede privada. Todas as respostas DNS são conferidas; a conexão usa um IP aprovado, com verificação TLS. Corpo: até 32 KB; resposta: até 128 KB. HTTP fora de 2xx registra falha. Não há repetição automática de chamadas com efeitos externos.

## 2. Webhook

Remova o gatilho manual do novo fluxo e adicione **Webhook**. Monte as etapas usando `{{ trigger.campo }}` nos formulários e salve. Um dono ou administrador pode clicar **Ativar e gerar token** no painel de entrada. Copie o token: ele só aparece nessa resposta. O endereço não contém o segredo.

Envie POST para o endereço exibido com:

- `Content-Type: application/json`
- `Authorization: Bearer TOKEN`
- `X-Tectique-Event-Id: identificador-unico-do-evento`
- Corpo JSON como `{"name":"Ana","email":"ana@example.com"}`.

Retorno 202 significa enfileirado, não finalizado. Acompanhe em Histórico e execuções. Reenviar o mesmo identificador retorna 200 com a execução original, mesmo que ela tenha falhado; para tentar novamente, use o histórico. A deduplicação é permanente enquanto os registros existirem. Token incorreto/desativado retorna 401; campos inválidos, 422; JSON inválido, 400; corpo acima de 32 KB, 413; fila cheia, 429. Até 100 execuções pendentes por fluxo e limite geral de 120 solicitações/minuto por IP na API.

**Revogar acesso** invalida o token; gerar outro também invalida o anterior. Pausar em Automações interrompe novas entradas, mas não cancela execuções já enfileiradas. O corpo é limpo de campos sensíveis antes de ser armazenado; não envie senhas. Cabeçalhos de autorização não entram no fluxo. Não há suporte a assinaturas HMAC específicas de provedores nesta versão.

O servidor continua escutando apenas no computador (127.0.0.1). Webhooks externos exigirão hospedagem HTTPS, que foi deixada para depois. A Tectique deve permanecer aberta para executar a fila.

## 3. Enviar e-mail

Em Integrações, crie uma **Conexão SMTP** com nome, servidor, porta 465 (TLS) ou 587 (STARTTLS obrigatório), usuário, senha SMTP/senha de aplicativo e remetente autorizado pelo seu provedor. Os dados são criptografados no PostgreSQL e não retornam na listagem. O servidor SMTP precisa ter endereço público e certificado válido.

Adicione **Enviar e-mail** no editor, informe o nome da conexão, um destinatário, assunto e mensagem em texto. Pode usar `{{ trigger.email }}` e outras variáveis. Conecte, salve e execute. A saída `status: accepted` significa que o SMTP aceitou a mensagem; não garante entrega, leitura ou que ela não vá para spam.

Não há anexos, HTML, leitura de caixa de entrada ou OAuth nesta versão. Nenhum provedor foi contratado/configurado. Se ocorrer falha após o envio, confira a caixa de entrada antes de repetir: o protocolo SMTP não garante entrega exatamente uma vez. O motor reaproveita etapas já concluídas nas novas tentativas.

## Permissões e segredos

Leitor visualiza; membro edita e executa; dono/administrador gerencia conexões e tokens de webhook. Uma conexão autoriza os membros operadores daquele workspace a usá-la. Tokens e senhas ficam fora da definição do fluxo: use somente nomes de conexões nos blocos. Não digite segredos em URL, corpo, assunto ou mensagem. Exportar JSON exporta configurações e referências, nunca as credenciais cadastradas. Campos livres digitados por você continuam sendo exportados.

## Verificação da v0.8.0 — base preservada

- `npm run build`: TypeScript e build do front-end concluídos.
- `npm run test:unit`: 30 testes aprovados.
- `npm test`: 32 testes aprovados com bancos PostgreSQL temporários isolados (11 API, 14 motor, 7 Etapa 3).
- Consulta HTTPS real a `api.github.com/zen` retornou 200. Corrigida compatibilidade de lookup DNS com Node 24 e cobertas as duas formas de callback.
- Navegador: cadastro local, conexão HTTP, formulário SMTP, blocos e montagem/salvamento do fluxo.
- SMTP testado com transporte controlado: TLS obrigatório, remetente, texto, proteção de arquivos e falhas. **Não foi enviado e-mail real a destinatários externos**: falta escolher/configurar o provedor.
- Corrigida a disposição do editor em janelas estreitas. Arraste por toque em celular físico não foi testado.

## Próximos passos

Atendimento com IA, assistente administrativo e financeiro continuam conceituais. O CRM está implementado nesta versão. Também ficam pendentes hospedagem HTTPS, provedor real de e-mail, conectores OAuth específicos, teste individual de bloco, zoom e seleção múltipla. Confira `PROMPT_CONTINUIDADE.md` para retomar o desenvolvimento.

Confirmação adicional no navegador: fluxo HTTP montado, salvo, reaberto após reiniciar e executado com sucesso no GitHub (status 200).
