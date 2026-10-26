# Tectique

**Seu trabalho flui. No automático.**

Plataforma full-stack para criar automações visuais, capturar clientes e acompanhar execuções. Projeto em desenvolvimento, com dados persistidos em PostgreSQL e interface em português.

**v0.9.0 · React · TypeScript · Node.js · PostgreSQL**

## Funcionalidades

- Editor visual: adicionar, mover e conectar blocos, variáveis, condições SIM/NÃO, validação, execução e importação/exportação JSON.
- GitHub Analytics: relatórios de commits, issues e pull requests de repositórios públicos.
- Integrações: requisições HTTPS, webhooks autenticados e envio por SMTP configurável.
- CRM: contatos, funil de seis etapas, anotações, tarefas, histórico e arquivamento.
- Captura automática: modelo Webhook → cadastrar ou atualizar contato, com deduplicação por e-mail.
- Histórico de execuções, fila PostgreSQL e resultados por etapa.
- Autenticação, workspaces, papéis de acesso, auditoria e credenciais criptografadas.

## Executar localmente

Requer **Node.js 22.13 ou superior**. O iniciador prepara PostgreSQL local; não precisa instalar Python, Java ou PostgreSQL separadamente.

```bash
git clone https://github.com/Jhenrique00/Tectique.git
cd Tectique
npm run setup
npm run build
npm start
```

Abra **http://127.0.0.1:8000** e crie sua conta. No Windows, após instalar as dependências, também pode usar `Iniciar.cmd`.

O banco e a chave de criptografia ficam em `.local/`. Preserve essa pasta nas atualizações. Configurações opcionais: [.env.example](.env.example).

## Estrutura

| Pasta | Responsabilidade |
| --- | --- |
| `frontend/` | Interface React, editor visual e telas |
| `server/` | API Express, autenticação, motor de fluxos, integrações e CRM |
| `scripts/` | Inicialização, desenvolvimento e testes com PostgreSQL local |
| `examples/` | Fluxos para importar no editor |

## Testes

```bash
npm run test:unit
npm test
```

A validação local da v0.9.0 registrou **71 testes aprovados**: 30 unitários/modelo e 41 com PostgreSQL real. Build e principais fluxos do CRM verificados no Windows. Não há CI configurada neste repositório.

## Próximas etapas e limites

Atendimento com IA/WhatsApp, agendamento de compromissos, processamento de documentos e financeiro estão planejados; as telas conceituais são identificadas no aplicativo.

E-mail exige servidor SMTP e credenciais do usuário. A entrega com provedor real ainda não foi validada. Tarefas do CRM ainda não enviam lembretes por e-mail. Hospedagem, configuração de produção e testes de arraste no celular ficam para próximas etapas.

## Documentação

- [Guia de uso, integrações e limites](docs/USAGE.md)
- [Atualizar sem perder dados](ATUALIZAR-SEM-PERDER-DADOS.txt)
- [Modelo de captura de clientes](examples/captura-cliente.json)
- [Contexto técnico e continuidade](PROMPT_CONTINUIDADE.md)

Bancos locais, contas, chaves e credenciais não fazem parte da publicação.
