

export const SITE = {
  name: 'Moura Representações',
  slogan: 'Você não fecha uma venda, você abre as portas de um relacionamento se quer construir um negócio duradouro e de sucesso.',
  phone: '5551991997522',
  phoneFormatted: '(51) 99199-7522',
  email: 'moura_representacoes@outlook.com',
  hours: 'Seg a Sex, 8h às 18h',
  whatsappUrl: 'https://api.whatsapp.com/send?phone=5551991997522',
  instagram: 'https://www.instagram.com/moura_representacoescomerciais/',
  linkedin: 'https://www.linkedin.com/in/adriano-moura-9665b01ba',
  facebook: 'https://www.facebook.com/mourarepresentacoescomerciais/',
};

export const ADMIN_USER = { username: 'admin', password: 'admin' };

export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Sobre Nós', href: '/sobre' },
  { label: 'Representadas', href: '/representadas' },
  { label: 'Catálogos', href: '/catalogos' },
  { label: 'Lançamentos', href: '/promocoes' },
  { label: 'Contato', href: '/contato' },
];

export const BRANDS = [
  { name: 'Cortag', logo: 'cortag' },
  { name: 'Ilumi', logo: 'ilumi' },
  { name: 'Claw Motobombas', logo: 'claw' },
  { name: 'Plaspol', logo: 'plaspol' },
];

export const CATALOGS = [
  { brand: 'Claw Motobombas', file: '/catalogs/catalogo-claw-motobombas-2026.pdf', year: '2026' },
  { brand: 'Plaspol', file: '/catalogs/catalogo-plaspol-2026.pdf', year: '2026' },
  { brand: 'Ilumi', file: '/catalogs/catalogo-ilumi-2025.pdf', year: '2025' },
  { brand: 'Cortag', file: '/catalogs/catalogo-cortag-2025.pdf', year: '2025' },
];

export const COPY = {
  hero: {
    titleLine1: 'Representação Comercial B2B que Conecta Revendedores e Distribuidores',
    titleLine2: 'Direto à Fábrica!',
    subtitle: 'Fortalecendo revendedores e distribuidores no Rio Grande do Sul, com portfólio estratégico, atendimento consultivo e uma plataforma exclusiva que agiliza orçamentos e pedidos.',
    cta: 'Entrar em Contato',
    ctaMicro: 'Resposta em até 24h úteis',
  },
  solution: {
    title: 'A Virada que Seu Negócio Precisa',
    subtitle: 'A Moura Representações não é apenas um intermediário — somos seu parceiro estratégico de crescimento.',
    mechanism: 'Nosso método combina curadoria rigorosa de marcas, inteligência comercial e atendimento personalizado. Cada empresa recebe um plano sob medida, com condições exclusivas negociadas diretamente com as fábricas.',
    steps: [
      { number: '01', title: 'Diagnóstico', desc: 'Analisamos seu mercado, região e mix de produtos atual.' },
      { number: '02', title: 'Curadoria', desc: 'Selecionamos as marcas ideais para sua realidade e demanda.' },
      { number: '03', title: 'Negociação', desc: 'Conquistamos condições especiais exclusivas para você.' },
      { number: '04', title: 'Acompanhamento', desc: 'Suporte contínuo, treinamento e inteligência de mercado.' },
    ],
  },
  brands: {
    title: 'Representadas',
    subtitle: 'Marcas Líderes que confiam na Moura Representações para levar produtos ao mercado.',
    items: ['Cortag', 'Ilumi', 'Claw Motobombas', 'Plaspol'],
  },
  differentials: {
    title: 'Por Que a Moura Representações?',
    items: [
      { icon: '🤝', title: 'Atendimento Consultivo', desc: 'Não empurramos produtos. Construímos estratégias comerciais.' },
      { icon: '🏆', title: 'Portfólio Premium', desc: 'Só trabalhamos com marcas que entregam qualidade comprovada.' },
      { icon: '💰', title: 'Condições Exclusivas', desc: 'Negociamos diretamente com fábricas para seu melhor preço.' },
      { icon: '📊', title: 'Inteligência de Mercado', desc: 'Dados e insights para você tomar decisões mais assertivas.' },
      { icon: '🚀', title: 'Agilidade', desc: 'Respostas rápidas, processos enxutos, sem burocracia.' },
      { icon: '🔒', title: 'Confiança', desc: 'Mais de 6 anos de reputação construída com resultados reais.' },
    ],
  },
  finalCta: {
    title: 'Pronto para Transformar Seu Negócio?',
    subtitle: 'Distribuidores estratégicos não esperam. Eles agem. Solicite um orçamento agora e descubra como a Moura Representações pode impulsionar seus resultados.',
  },
};

