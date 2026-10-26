export interface Automation {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  audience: string;
  steps: string[];
}
export const automations: Automation[] = [
  {
    id: "github",
    name: "GitHub Analytics",
    icon: "github",
    category: "Desenvolvimento",
    description:
      "Gere resumos de commits, issues e pull requests de repositórios públicos.",
    audience: "Para desenvolvedores e equipes de software.",
    steps: [
      "Escolha o repositório público que deseja acompanhar.",
      "Defina a frequência do resumo de commits, issues e pull requests.",
      "Consulte a atividade consolidada no painel.",
    ],
  },
  {
    id: "leads",
    name: "Captura e atendimento de clientes",
    icon: "contact",
    category: "Atendimento",
    description:
      "Registre contatos recebidos por formulário, organize os dados e envie uma resposta personalizada automaticamente.",
    audience: "Para freelancers e pequenas empresas.",
    steps: [
      "Receba os dados preenchidos no formulário de contato.",
      "Registre o contato e organize as informações recebidas.",
      "Prepare e envie uma resposta personalizada ao cliente.",
    ],
  },
  {
    id: "appointments",
    name: "Agendamentos e lembretes",
    icon: "calendar-clock",
    category: "Agendamentos",
    description:
      "Gerencie horários e envie confirmações e lembretes automáticos por e-mail antes dos compromissos.",
    audience: "Para clínicas, barbearias e prestadores de serviços.",
    steps: [
      "Cadastre o compromisso e os dados de contato.",
      "Defina quando enviar a confirmação e os lembretes por e-mail.",
      "Acompanhe os horários e o histórico dos avisos enviados.",
    ],
  },
  {
    id: "documents",
    name: "Organização inteligente de documentos",
    icon: "files",
    category: "Documentos",
    description:
      "Extraia informações de PDFs, organize arquivos e preencha planilhas automaticamente, com conferência dos dados extraídos.",
    audience: "Para empresas, estudantes e escritórios.",
    steps: [
      "Receba os documentos e extraia as informações dos PDFs.",
      "Confira os dados extraídos e corrija possíveis inconsistências.",
      "Organize os arquivos e preencha a planilha com os dados conferidos.",
    ],
  },
];
