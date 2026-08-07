<div align="center">

# Plannke

**Controle total das suas finanças — sem servidor, sem cadastro, sem nuvem.**  
Seus dados financeiros ficam sob seu controle.

![HTML](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Bootstrap](https://img.shields.io/badge/Bootstrap_5-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-00C896?style=for-the-badge)

</div>

---

## 📖 Sobre o projeto

O **Plannke** é uma aplicação web client-side para gestão de finanças pessoais. Não há backend próprio, banco de dados em nuvem ou autenticação. Transações, contas, cartões e configurações ficam no armazenamento local do navegador e no "Memory Card": um arquivo `.xlsx` que você salva e carrega quando quiser, como um videogame antigo.

> A interface atualmente carrega bibliotecas e fontes de CDNs externos. O código do Plannke não envia seus registros financeiros para esses serviços, mas abrir o app com internet pode gerar requisições de rede para carregar essas dependências.

A proposta é simples: **uma ferramenta poderosa que você realmente controla.**

---

## ✨ Funcionalidades

### 🏠 Dashboard
- Saldo geral consolidado com indicador visual de positivo/negativo
- Visão rápida de todas as contas bancárias e faturas de cartões com saldo em tempo real
- Gráfico de rosca interativo com gastos por categoria do mês
- Cards de entradas e despesas do mês atual
- Lista de transações recentes
- Orçamento mensal por categoria com barras de progresso e alertas de excesso
- Alerta de contas futuras a pagar

### 💸 Movimentação
- Busca em tempo real por descrição
- Filtros de tipo, categoria e conta
- Navegador de meses
- Três modos de visualização: Lista, Caminho (Sankey) e Solar (Sunburst)
- Duplicação, edição e exclusão de transações

### 📈 Projeção
- Estimativa de evolução do patrimônio para os próximos 12 meses
- Baseada em gastos fixos, parcelas futuras e receitas recorrentes
- Gráfico de linha com resumo mensal projetado

### 🏦 Contas & Cartões
- Cadastro de contas bancárias com saldo inicial
- Cadastro de cartões de crédito com fechamento e vencimento
- Cálculo automático de fatura por período
- Pagamento de fatura com débito na conta selecionada
- Vencimentos configurados para dias inexistentes no mês são limitados ao último dia válido
- Pagamentos de fatura ficam vinculados à transação correspondente, permitindo reabrir a fatura corretamente se o pagamento for excluído

### 💾 Backup — Memory Card
- Exportação e importação `.xlsx`
- Autosave em `localStorage` como camada extra de segurança
- Dados da sessão também mantidos em `sessionStorage`
- O `.xlsx` continua sendo o backup portátil recomendado

---

## 🗂️ Estrutura do projeto

```text
Plannke/
├── .github/workflows/tests.yml  # CI dos testes de integridade
├── tests/storage.test.js        # Testes do motor financeiro
├── index.html                   # Estrutura HTML e views
├── styles.css                   # Design system e responsividade
├── app.js                       # UI, gráficos e Excel
├── storage.js                   # CRUD, faturas e saldos
└── package.json                 # Comando de testes
```

O projeto não exige servidor de aplicação. Ele pode ser servido como site estático.

---

## 🚀 Como usar

### Abrir localmente

```bash
git clone https://github.com/RY0UK3N/Plannke.git
cd Plannke
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

### GitHub Pages
1. Vá em **Settings → Pages**.
2. Selecione a branch `main` e a pasta `/ (root)`.
3. A URL padrão será `https://ry0uk3n.github.io/Plannke/`.

---

## 🧪 Testes

Requer Node.js 18 ou superior.

```bash
npm test
```

Os testes atuais cobrem pontos críticos de integridade financeira, incluindo transferência conta → cartão, pagamento e exclusão de fatura, datas de vencimento no fim do mês e limite comprometido do cartão.

Pull requests também executam a suíte automaticamente via GitHub Actions.

---

## 🛠️ Tecnologias utilizadas

| Biblioteca | Versão atual no projeto | Uso |
|---|---|---|
| Bootstrap | 5.3.3 | Layout, grid, modais, offcanvas |
| Chart.js | carregada via CDN | Gráficos |
| Apache ECharts | 5.4.3 | Sankey, Sunburst e Projeção |
| SheetJS (XLSX) | 0.18.5 | Exportação e importação `.xlsx` |
| Phosphor Icons | carregada via CDN | Ícones |
| Google Fonts — Inter | carregada externamente | Tipografia |

---

## 💡 Filosofia de dados

- **Sessão ativa:** `sessionStorage`
- **Autosave local:** `localStorage`
- **Backup portátil:** arquivo `.xlsx`
- **Sem backend próprio:** o Plannke não mantém uma cópia dos seus registros financeiros em servidor próprio

O formato de dados possui uma versão de schema para permitir migrações futuras sem depender apenas da presença ou ausência de colunas.

---

## 📊 Como funciona o cálculo de faturas

O sistema identifica a qual fatura uma despesa pertence com base no **dia de fechamento** do cartão:

- Se o dia da transação é posterior ao fechamento → fatura do mês atual
- Se o dia da transação é anterior ou igual ao fechamento → fatura do mês anterior

```text
Exemplo: fechamento dia 10
Compra em 15/mar → Fatura Março (vence em Abril)
Compra em 08/mar → Fatura Fevereiro (vence em Março)
```

Se o vencimento estiver configurado como dia 29, 30 ou 31 e o mês seguinte não possuir esse dia, o vencimento será ajustado para o último dia válido daquele mês.

---

## 🤝 Contribuindo

1. Faça um fork do projeto.
2. Crie sua branch.
3. Execute `npm test`.
4. Faça commit e push.
5. Abra um Pull Request.

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

Copyright (c) 2026 **Marcos Luciano Tagliari Junior**
