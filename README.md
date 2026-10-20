# 🍳 Cozinha da Tere

Loja de cantina para o trabalho: o funcionário se cadastra, pega o que quiser na cozinha, anota no carrinho e paga todo dia 1. A administradora acompanha os pedidos **em tempo real** e gera o fechamento do mês em PDF, separado por equipe.

**Tecnologias:** React + Vite (HTML, CSS e JavaScript) · Bootstrap 5 (layout responsivo: celular, tablet e desktop) · Vercel (hospedagem e API) · Neon (banco PostgreSQL).

## Como funciona

| Aba | O que faz |
|---|---|
| Cadastro | Nome, número, equipe (EVA, VIVA, ED, BANCAR, DEV), foto e senha. Login = número + senha. |
| Meus gastos | Escolhe o mês e vê tudo o que consumiu; cria uma nova senha. |
| Loja | Almoço da semana, 4 categorias, carrinho. Foto do usuário no canto superior direito. |
| Administração | **Usuários cadastrados separados por equipe**, pedidos em tempo real com aviso, almoço da semana, novo produto, **remover produto**, fechamento em PDF/CSV, troca de login e senha. |

Tempo real: a página consulta a API a cada poucos segundos (15 s na administração). Quando um produto é removido, **todo mundo recebe o aviso** "🗑️ produto foi removido da loja".

## Estrutura

```
api/index.js      → API (login, pedidos, produtos, usuários...). Roda na Vercel.
api/_lib.js       → conexão com o Neon, criação automática das tabelas, login (JWT)
api/_catalog.js   → lista inicial de produtos e preços
src/App.jsx       → telas em React + Bootstrap
src/main.jsx      → liga o React à página
src/styles.css    → cores da marca sobre o Bootstrap
index.html        → página base (fontes, viewport do celular)
vite.config.js    → configuração do compilador
package.json      → lista de pacotes e comandos (veja abaixo)
.env.example      → modelo das variáveis secretas
```

## Comentários no código (para manutenção)
Todos os arquivos de código têm comentários explicando o que cada trecho faz, do início ao fim:
- JavaScript, JSX e CSS usam `/* comentário */`. Dentro do desenho da tela (JSX) o formato é `{/* comentário */}`.
- `index.html` usa `<!-- comentário -->` (é o único formato que o HTML aceita).
- `.gitignore` e `.env.example` usam `#`.
- O `package.json` **não aceita comentários** (é JSON). O que ele guarda:
  - `scripts`: `npm run dev` (testar), `npm run build` (compilar, a Vercel usa este), `npm run preview` (ver o resultado do build).
  - `dependencies`: pacotes usados pelo site (react, bootstrap, jspdf para o PDF, bcryptjs para senhas, jsonwebtoken para o login, @neondatabase/serverless para o banco).
  - `devDependencies`: ferramentas só de desenvolvimento (vite e o plugin do React).

Ao mexer no código, mantenha o hábito: escreva um comentário curto dizendo **por que** a mudança existe.

## Tutorial de uso do site

### Para os funcionários
1. **Primeiro acesso:** abra o link, toque em **Criar conta** e preencha nome, número de celular, equipe, foto de perfil e uma senha (mín. 6 caracteres). Toque em **Cadastrar**.
2. **Entrar nas próximas vezes:** informe número + senha em **Entrar**. O aparelho lembra de você até você tocar em **Sair**.
3. **Comprar:** na aba **Loja**, veja o "Almoço da semana" (se a administradora cadastrou) e escolha uma categoria (🍬 Doces, 🍮 Sobremesas, 🥪 Lanches, 🥤 Bebidas). Toque no **+** vermelho de cada produto para colocar no carrinho.
4. **Finalizar:** toque em **Ver carrinho** (barra escura no rodapé), ajuste as quantidades com **−** e **+** e toque em **Finalizar pedido**. Pronto: a compra entra na sua conta do mês e a administradora recebe o aviso na hora.
5. **Controlar os gastos:** na aba **Meus gastos**, escolha o mês e veja tudo o que consumiu, com data, hora e total.
6. **Esqueceu a senha?** Se ainda estiver logado, vá em **Meus gastos → Esqueceu a senha? Crie uma nova**, digite a nova senha e salve. Se já saiu da conta e não lembra a senha, peça à administradora (veja "Dúvidas comuns").
7. A **foto de perfil** aparece no círculo do canto superior direito enquanto você está logado.

### Para a administradora
1. **Entrar:** aba **Administração** → login e senha da administração. A sessão dura 12 horas.
2. **Acompanhar o dia:** os quadros coloridos mostram pedidos de hoje, valor retirado hoje, total do mês e quantas pessoas consumiram no mês.
3. **Usuários cadastrados:** logo abaixo dos quadros, a lista de todas as pessoas cadastradas, **separadas por equipe** (EVA, VIVA, ED, BANCAR, DEV), com número, data do cadastro e quanto cada uma gastou no mês. A lista atualiza sozinha e um aviso 🆕 aparece quando alguém novo se cadastra.
4. **Pedidos em tempo real:** cada compra feita em qualquer celular ou computador aparece na tabela em até 15 segundos, com aviso e som. O botão **Excluir** remove um pedido lançado por engano.
5. **Almoço da semana:** informe prato, preço e foto de segunda a sexta e toque em **Salvar cardápio da semana**. Eles aparecem no topo da loja. **Limpar semana** apaga todos.
6. **Novo produto:** escolha a categoria, digite nome e valor, anexe a foto e toque em **Publicar produto**. Ele aparece na loja com a etiqueta **Novidade** por 14 dias.
7. **Remover produto:** escolha a categoria, ache o produto e toque em **Remover**. Ele é apagado da loja de todos e aparece o aviso "🗑️ produto foi removido da loja" (os pedidos antigos continuam no histórico).
8. **Fechamento do mês (todo dia 1):** escolha o mês, toque em **Gerar PDF do fechamento** (separado por equipe, com itens, datas e totais por pessoa) e em **Baixar planilha (CSV)**. Só depois de guardar os arquivos use **Limpar pedidos deste mês**, que apaga os pedidos de vez.
9. **Trocar login e senha da administração:** no último card, preencha novo login e nova senha e salve.

### Dúvidas comuns
- **Funcionário esqueceu a senha e não consegue entrar:** no Neon (SQL Editor) rode `delete from users where phone='NUMERO';` com o número dele. Ele se cadastra de novo com o mesmo número e o histórico de compras continua aparecendo.
- **Esqueci a senha da administração:** no SQL Editor rode `delete from settings where key='admin';` e entre com `ADMIN_LOGIN`/`ADMIN_PASSWORD` da Vercel.
- **O pedido não apareceu para a administradora:** confirme que ela está logada na aba Administração; a tabela atualiza a cada poucos segundos (15 s).
- **Funciona em qualquer aparelho?** Sim: o layout se ajusta a celular, tablet e computador.

## Passo a passo

### 1. Instalar as ferramentas
- [Node.js 18+](https://nodejs.org) e [Git](https://git-scm.com)
- Conta grátis no [GitHub](https://github.com) e na [Vercel](https://vercel.com) (entre com o GitHub)

### 2. Rodar o projeto no seu computador
```bash
npm install
npm run build   # confere se compila
```

### 3. Subir para o GitHub
1. No GitHub: **New repository** → nome `cozinha-da-tere` → **Create** (sem README).
2. Na pasta do projeto:
```bash
git init
git add .
git commit -m "Primeira versão da Cozinha da Tere"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/cozinha-da-tere.git
git push -u origin main
```

### 4. Publicar na Vercel
1. Em vercel.com: **Add New → Project** → escolha o repositório → **Import**.
2. A Vercel reconhece o Vite sozinha. **Ainda não clique em Deploy** se for criar o banco antes; ou faça o deploy e redeploy no passo 6.

### 5. Criar o banco Neon dentro da Vercel
1. No projeto, aba **Storage → Create Database → Neon** (Postgres) → crie e **Connect to Project**.
2. A Vercel cria a variável `DATABASE_URL` automaticamente. Não precisa criar tabelas: o sistema cria na primeira vez que for aberto.

### 6. Variáveis de ambiente
Em **Settings → Environment Variables**, adicione:

| Nome | Valor |
|---|---|
| `JWT_SECRET` | um texto grande e aleatório (ex.: 40 letras e números) |
| `ADMIN_LOGIN` | login da administradora |
| `ADMIN_PASSWORD` | senha da administradora (mín. 6) |

Depois, **Deployments → ⋯ → Redeploy**.

### 7. Primeiro acesso
1. Abra o link da Vercel e crie seu cadastro.
2. Na aba **Administração**, entre com `ADMIN_LOGIN` e `ADMIN_PASSWORD`. No primeiro login a senha é guardada criptografada no banco; depois você pode trocá-la na própria tela (e apagar `ADMIN_PASSWORD` da Vercel se quiser).
3. Passe o link para a equipe.

### 8. Testar localmente com a API (opcional)
```bash
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```

### 9. Atualizações
Mexeu no código? `git add . && git commit -m "mensagem" && git push` — a Vercel publica sozinha.

## Dicas e problemas comuns
- **"Erro no servidor"**: confira se `DATABASE_URL` e `JWT_SECRET` existem e se fez Redeploy.
- **Produto removido volta?** Não volta: ele é apagado do banco. Para recolocar, use "Novo produto".
- Fotos são reduzidas e guardadas no próprio banco (plano grátis do Neon aguenta bem uma cantina).
- Senhas dos usuários são criptografadas (bcrypt); quem esqueceu a senha precisa estar logado para trocá-la.
