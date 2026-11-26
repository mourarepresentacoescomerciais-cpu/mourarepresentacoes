<div align="center">

# Moura Representações

**Desenvolvido por NortTech Marketing**

Desenvolvimento web · Design · Marketing digital

[**norttech.com.br**](https://norttech.com.br/)

</div>

---

Criar um sistema completo para a empresa Moura Representações, composto por:
Site Institucional Premium
Sistema B2B de geração de pedidos/orçamentos
Área restrita com login manual
Painel administrativo completo
Integração com WhatsApp para envio de orçamento
Importação de preços via CSV
Estrutura preparada para +2.000 produtos
Landing Page de alto ticket (Home) com foco absoluto em conversão, usando AIDA + P.A.S. + Storytelling e vieses cognitivos éticos
Este projeto deve ser tratado como produto digital corporativo de alto padrão.
STACK OBRIGATÓRIA
React + Tailwind CSS
React Router
Prioridade para dispositivos móveis
Estrutura pronta para deploy
Deploy preferencial: Vercel (adaptar para funcionar nele sem tela branca), e também entregar versão compatível com HostGator
Estrutura de navegação por âncoras internas no institucional (além das rotas), quando fizer sentido para conversão
Prever integrações: Pixel, GA4, GTM, Meta CAPI e CRM/formulário (deixar ganchos e eventos data-cta por seção)
Código organizado em:
/componentes
/páginas
/admin
/lib
/estilos
Não usar dependências desnecessárias.
Não quebrar build.
Evitar tela branca.
IDENTIDADE VISUAL (OBRIGATÓRIA)
Paleta:
Grafite/Chumbo (base escura institucional)
Laranja estratégico (CTA e destaques)
Branco para legibilidade
Cores oficiais fixas (usar exatamente): Laranja #f7941d | Cinza #888888 | Branco #ffffff (não inventar novas cores fora dessa paleta, exceto tons derivados para hover/disabled)
Tipografia:
Fonte primária: Inter
Fonte destaque: Poppins
Escala tipográfica:
12 / 14 / 16 / 18 / 24 / 32 / 40 / 56
Espaçamento:
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
Raio:
12px padrão
24px em cards estratégicos
Sombras:
Suaves, padrão único
Todos os botões devem seguir exatamente o mesmo padrão visual.
Logo oficial (usar em Header/Login/Footer/Favicon): https://nyltechsite.com.br/wp-content/uploads/2026/02/moura_colornegativo_vertical@2x.png
Centralize TODOS os tokens (cores, tipografia, espaçamento, raio, sombra, contêiner) e TODO o texto / cópia em constantes (objetos) para fácil edição futura
1️⃣ INSTALAÇÕES INSTITUCIONAIS
Páginas obrigatórias
Lar
Sobre Nós
Representadas
Catálogos (download PDF)
Promoções e Lançamentos
Contato
Solicite Orçamento
Conectar
Política de Privacidade
Termos de Uso
Aviso de Cookies
404
Header e Footer espelhados (mesmos links).
CTA fixo no header (desktop e mobile).
Home deve funcionar como Landing Page high-ticket (visual sofisticado, foco em conversão, CTA recorrente a cada ~1,5 telas)
Rodapé deve conter sessão Contato completa: e-mail, endereço e horários, todos clicáveis (mailto, maps, tel/WhatsApp)
COPY OBRIGATÓRIA
Slogan usar exatamente:
“Você não fecha uma venda, você abre as portas de um relacionamento se quer construir um negócio duradouro e de sucesso.”
Aplicar AIDA + P.A.S + Storytelling (Situação → Conflito → Virada → Resultado).
Aplicar vieses cognitivos de forma ética: prova social, autoridade, escassez real, urgência ética, ancoragem, contraste, curiosidade, reciprocidade, compromisso, aversão à perda, efeito halo, novidade
IMPORTANTE: como o item “2. COPY” foi enviado vazio, criar uma copy completa premium coerente com o projeto, SEM promessas vagas, mantendo LGPD e linguagem ética.
Tons e posicionamento (como foi enviado “X”): assumir padrão premium corporativo B2B: tom direto, confiante, consultivo; personalidade séria e estratégica; sofisticação alta.
ESTRUTURA DA HOME (OBRIGATÓRIA)
HERÓI
Destaque do título
Subheadline qualificadora
CTA com microtexto
Prova social
Prêmio visual
Dor do mercado
Visão de futuro
Solução Moura
Representadas
Diferenciais
Prova social
Galeria
Perguntas frequentes
CTA Final
CTAs a cada 1.5 telas.
Obrigatório mapear as seções com: ordem, objetivo estratégico e CTA principal
Inserir prova social imediata no Hero
Adicionar mecanismo único (explicar por que funciona e por que é diferente)
Adicionar seção de oferta (o que é, como funciona, para quem é/para quem não é, valor ancorado, garantia/riscos reversos)
Adicionar SEO completo: title/meta/open graph/json-ld (Organization + FAQ + schema do formulário) + sitemap.xml + robots.txt + canonical
2️⃣ LOGIN (ÁREA RESTRITA)
Tela centralizada.
Elementos:
Logo Moura no topo
Logo da marca representada acima do form
Campo CNPJ ou E-mail
Campo senha
Botão LOGIN (laranja forte)
Esqueci minha senha
Solicitar acesso
Regra:
Cadastro NÃO aberto.
Acesso criado manualmente pelo Adriano.
Após login → redirecionar para painel de pedidos.
Usuários criados manualmente DEVEM conseguir consultar produtos e solicitar orçamento/pedido pelo sistema (fluxo completo pós-login)
Área protegida e segura, com rotas privadas e fallback de sessão expirada
IMPORTANTE (similar ao print): após login, o usuário deve cair diretamente em uma tela de “Geração de Orçamento/Pedido” com o layout dividido (itens à esquerda e resumo fixo à direita) e a busca “Buscar produto”, igual ao print de referência.
Obrigatório criar um usuário de teste pré-cadastrado para validação imediata:
CNPJ: 46998749000170
Senha: Gremio1990
Esse usuário deve conseguir entrar e gerar orçamento/pedido normalmente (com dados de conta + tabela + resumo).
3️⃣ DASHBOARD (APÓS LOGIN)
Bloco fixo superior com:
Razão social
Endereço
BOLSO
Classificação
Rede
Limite de crédito
Esse bloco permanece fixo durante o pedido.
Exibir também status de crédito (OK/atenção/estourado) com linguagem corporativa e cor derivada do sistema (sem criar paleta nova)
4️⃣ SISTEMA DE PEDIDOS B2B
Layout dividido:
Esquerda → Tabela de itens
Direita → Card resumo fixo
BUSCA INTELIGENTE
Buscar por nome ou código
Suportar sinônimos
Estrutura de produto deve permitir array de termos alternativos
Busca deve aceitar “apelidos” (ex: nivelador = espaçador) e retornar resultados relevantes mesmo sem match exato
Exibir lista de resultados com: imagem, nome comercial, código, espessura/variação, qtd por embalagem, qtd mínima, preço (CSV), botão adicionar
Respeitar quantidade mínima ao adicionar
TABELA DE ITENS
Colunas:
Código
Descrição
Quantidade (editável)
Preço tabela
Preço venda (editável)
% desconto
Total
% desconto adicional
Total com desconto adicional
IPI
ST
Total com impostos
Remover item
Atualização dinâmica em tempo real.
Inputs numéricos com validação (step, min, máscara amigável), prevenção de NaN e formatação BRL
Tabela extensa com scroll interno, cabeçalho sticky, performance para muitos itens
RESUMO LATERAL
Campo desconto geral %
Total bruto
Total com desconto
Total com impostos (destacado)
Validação de limite de crédito
Se ultrapassar limite → alerta visual.
Card lateral sempre visível (sticky), com destaque forte no valor final
Mostrar: desconto total (%) e desconto adicional total (%) quando aplicável
5️⃣ REGRAS DE NEGÓCIO
Calcular IPI
Calculadora ST
Desconto por item
Desconto geral
Consolidar impostos
Validar limite de crédito
Permitir remoção de item
Sem integração com estoque: deixar isso explícito na UI (mensagem pequena) e no envio para o Adriano
6️⃣ ENVIO DE ORÇAMENTO VIA WHATSAPP
Ao finalizar pedido:
Montar dinamicamente:
Olá! Vim do site e gostaria de um orçamento.
Nome: {nome}
Telefone: {telefone}
Interesse: {itens}
Mensagem: {observações}
Usar encodeURIComponent()
Número fixo
Abrir WhatsApp em nova aba
Não alterar layout. Apenas lógica.
Obrigatório: prevenir submit padrão; gerar URL https://api.whatsapp.com/send
com phone fixo e text dinâmico; usar addEventListener("submit") ou onclick; JavaScript simples sem libs
Além do WhatsApp, permitir envio por e-mail opcional (fallback), mantendo a mesma mensagem estruturada
7️⃣ PAINEL ADMINISTRATIVO
Adriano deve poder:
Criar produto
Editar produto
Subir imagem
Marcar promoção
Marcar lançamento
Criar cliente manualmente
Resetar senha
Importar CSV para atualizar preços
Atualizar múltiplos campos via CSV
Gerenciar acessos: criar login manual, editar dados do cliente, definir limite de crédito, bloquear/desbloquear usuário
Produtos: permitir cadastrar palavras-chave/sinônimos por produto
Promoções do mês e Lançamentos: seção dinâmica no site e link direto para adicionar ao pedido
CSV
Permitir upload CSV com:
Código
Nome
Preço
Quantidade mínima
Espessura
Etc.
Atualização em massa.
CSV deve ser a base de precificação. Suportar atualização anual (2025→2026) sem quebrar o sistema.
8️⃣ VOLUME E DESEMPENHO
Pronto para:
+2.000 produtos
Variações
Scroll interno na tabela
Paginação ou virtualização
Lazy load de imagens.
Farol 95+.
Otimizar LCP/CLS/INP, evitar re-render pesado, usar memoização onde necessário sem refatorar além do pedido
9️⃣ MICROANIMAÇÕES (OBRIGATÓRIO)
Cada seção deve ter ao menos 1:
Revelar na rolagem
Cartas de levantamento de bóias
Gradiente animado em CTA
Contador animado
Marquee infinito
Brilho suave
Underline animado
Scrollbar personalizada
WhatsApp flutuante
Respeitar prefere movimento reduzido.
Implementar scroll animations com IntersectionObserver: animar 1x, rápido, elegante, sem exagero
🔟 FUNÇÕES GLOBAIS OBRIGATÓRIAS
Implementar:
Botão flutuante WhatsApp
Animações de rolagem via IntersectionObserver
Scrollbar personalizada global
Marquee infinito reutilizável
Favicon configurado
Title apenas “Moura Representações”
SER
Implementar:
Title otimizado
Meta descrição
Gráfico aberto
JSON-LD (Organização + FAQ)
Sitemap.xml
Robots.txt
Canônico
ACESSIBILIDADE
COM
Navegação por teclado
Foco visível
Contraste AA
Transbordamento horizontal do Sem
BLOCO DE TRAVA (OBRIGATÓRIO)
Respeite exatamente o que foi solicitado.
Não altere layout, cores, fontes, estrutura, textos ou seções que não estejam na lista de requisitos.
Não remova seções.
Não renomeie arquivos/componentes/rotas, exceto se isso fizer parte do pedido.
Se algo estiver ambíguo, faça a alteração mais conservadora possível.
ENTREGA OBRIGATÓRIA
Sumário executivo estratégico
Lista de seções + objetivo + vieses aplicados
Estrutura completa de rotas
Código React + Tailwind em arquivo único
Páginas extras roteadas
HTML completo separado
Lista de verificação de garantia de qualidade técnica
Checklist de conversão
Sugestões de A/B
Incluir: checklist mobile 320/375/414, checklist de spacing/typography, e eventos de CTA com data-cta por seção
Incluir banner simples de consentimento de cookie (LGPD) no Aviso de Cookies
RODAPÉ (OBRIGATÓRIO)
Após footer incluir:
Moura Representações © 2026 – Todos os direitos reservados – contato@mourarepresentacoes.com.br
Desenvolvido por: NortTech Marketing
Incluir:
Ícones redes sociais
Contato clicável
Links legais
PRAZO E ENTREGA
Sistema 100% do cliente
Hospedagem HostGator
Domínio no nome do cliente
Sem amarras técnicas
RESULTADO ESPERADO
Sistema B2B corporativo premium, sólido, confiável, com foco em relacionamento de longo prazo, conversão estratégica e autonomia digital para distribuidores.
CHECKLIST RÁPIDO
✔ Estrutura React + Tailwind organizada
✔ Site institucional completo
✔ Sistema B2B funcional
✔ Login manual por CNPJ
✔ Controle de crédito
✔ Cálculo de impostos
✔ CSV funcionando
✔ WhatsApp dinâmico
✔ Administração completa
✔ SEO aplicado
✔ Desempenho 95+
✔ Mobile perfeito
CHECKLIST RÁPIDO DE VALIDAÇÃO (5–12 itens)
Tokens centralizados (cores/tipografia/spacing/radius/shadow/container) e copy em constantes
Home como LP high-ticket (AIDA + PAS + Storytelling + vieses) + CTA fixo + CTAs recorrentes
Rotas: institucionais + Login + Sistema + Admin + Privacidade/Termos/Cookies/404 sem tela branca
Login manual (CNPJ/e-mail) + rotas privadas + sessão expirada/fallback
Usuário teste funciona: CNPJ 46998749000170 / senha Gremio1990 entra e cai direto na tela de gerar orçamento/pedido
Busca por sinônimos/apelidos + resultados com imagem + regras de qtd mínima
Tabela com cálculos em tempo real (descontos + IPI + ST) + validação de crédito
Resumo lateral sticky com valor final destacado e alertas de crédito
WhatsApp: URL dinâmica com encodeURIComponent + prevenir submit + número fixo
Admin: CRUD produtos + sinônimos + promo/lanc + CSV + gestão de usuários/crédito
SEO (meta + OG + JSON-LD + sitemap + robots + canonical) + A11y (ARIA/foco/contraste)
Desempenho: carregamento lento + overflow-x do SEM + Lighthouse 90–95+
2️⃣ LOGIN (ÁREA RESTRITA)
Tela centralizada.
Elementos:
Logo Moura no topo
Logo da marca representada acima do form
Campo CNPJ ou E-mail
Campo senha
Botão LOGIN (laranja forte)
Esqueci minha senha
Solicitar acesso
Regra:
Cadastro NÃO aberto.
Acesso criado manualmente pelo Adriano.
Após login → redirecionar para painel de pedidos.
Usuários criados manualmente DEVEM conseguir consultar produtos e solicitar orçamento/pedido pelo sistema (fluxo completo pós-login).
IMPORTANTE (similar ao print): após login, o usuário deve cair diretamente em uma tela de “Geração de Orçamento/Pedido” com layout dividido (itens à esquerda e resumo fixo à direita), igual ao print de referência.
Obrigatório criar um usuário de teste pré-cadastrado para validação imediata:
CNPJ: 46998749000170
Senha: Gremio1990
Esse usuário deve conseguir entrar e gerar orçamento/pedido normalmente.
🚨 NOVA SEÇÃO OBRIGATÓRIA — PAINEL ADMINISTRATIVO (ÁREA ADMIN SEPARADA)
O sistema DEVE possuir uma área administrativa totalmente separada da área de clientes.
Essa área NÃO pode ser apenas um login de cliente.
Deve existir:
Rotação exclusiva: /admin
Rota protegida (acesso apenas administrador)
Layout administrativo próprio
Login administrativo de teste obrigatório:
Usuário: admin
Senha: admin
Esse login deve redirecionar para o Painel Administrativo completo.
7️⃣ PAINEL ADMINISTRATIVO
Adriano deve poder:
Criar produto
Editar produto
Excluir produto
Subir imagem
Cadastrar palavras-chave/sinônimos
Marcar promoção
Marcar lançamento
Criar cliente manualmente
Editar limite de crédito
Bloquear/desbloquear cliente
Resetar senha
Importar CSV para atualizar preços
Atualizar múltiplos campos via CSV
O painel deve conter:
Dashboard com métricas básicas (ex: quantidade de produtos, clientes ativos)
Menu lateral fixo
Sessão de Produtos
Sessão de Clientes
Sessão de Importação CSV
Sessão de Promoções
Sessão de Lançamentos
O sistema NÃO pode gerar apenas login de cliente.
Deve obrigatoriamente gerar o painel administrativo funcional.
🔒 CONTROLE DE ROTAS
/ login → cliente
/ painel → cliente
/ admin → administrador
Se usuário for cliente → não pode acessar /admin
Se usuário for admin → pode acessar área admin
Implementar proteção de rotas via controle de sessão.
CHECKLIST ADICIONAL OBRIGATÓRIO
✔ Existe login cliente funcional
✔ Existe login administrador funcional
✔ Admin consegue cadastrar produto
✔ Admin consegue importar CSV
✔ Admin consegue criar cliente
✔ Cliente consegue gerar orçamento
✔ Rotas protegidas corretamente
✔ /admin não acessível por cliente
✔ /painel não acessível sem login
🔥 BLOCO DE TRAVA EXTRA
O sistema deve obrigatoriamente gerar:
• Área cliente
• Área administrador
• Dois logins distintos
• Controle de permissão
Se o sistema gerar apenas login de cliente, considerar implementação incompleta.

---

<div align="center">

**NortTech Marketing**  
Tecnologia e presença digital para sua empresa.  
[Conheça a NortTech](https://norttech.com.br/)

</div>
