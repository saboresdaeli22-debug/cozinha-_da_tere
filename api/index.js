/*
 * api/index.js — API única do site (função serverless da Vercel).
 * O navegador faz POST /api com { action: 'nome', ...dados }. O objeto 'actions' abaixo tem uma função por ação.
 * Autorização: cada pedido traz um token (JWT). 'u' = quem fez o pedido ({role:'user'|'admin'}), ou null se não logado.
 * Regra de ouro: preços e totais são sempre calculados AQUI, nunca aceitos do navegador.
 */
import { sql, ensure, checkEnv, bcrypt, sign, who } from './_lib.js';
import { BASE } from './_catalog.js';

/* Listas permitidas. TEAMS = equipes · CATS = categorias de produto · DAYS = dias do almoço da semana. */
const TEAMS = ['EVA', 'VIVA', 'ED', 'BANCAR', 'DEV'];
const CATS = ['doces', 'sobremesas', 'lanches', 'bebidas'];
const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex'];

/* Lança um erro com mensagem e código HTTP (400 dados inválidos, 401 sem login, 403 sem permissão). */
const bad = (m, s = 400) => { throw Object.assign(new Error(m), { status: s }); };
/* Guardas de permissão: needUser exige usuário logado; needAdm exige administração. */
const needUser = (u) => u?.role === 'user' || bad('Faça login para continuar', 401);
const needAdm = (u) => u?.role === 'admin' || bad('Acesso restrito à administração', 403);
/* Deixa só os números (o telefone é a identidade do usuário). */
const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
/* Dados do usuário que podem voltar ao navegador (nunca o hash da senha). hasBirth = já tem data de nascimento cadastrada? */
const pubUser = (r) => ({ phone: r.phone, name: r.name, team: r.team, hasBirth: !!r.birth });
/* Data de nascimento válida: formato AAAA-MM-DD, entre 1900 e hoje. */
const okBirth = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(s)) && s >= '1900-01-01' && s <= new Date().toISOString().slice(0, 10);
/* Limite de referência do armazenamento: 1 GB (limite do plano gratuito da Neon por projeto). */
const LIMIT_BYTES = 1024 ** 3;
/* Converte para número com 2 casas decimais (aceita texto). */
const money = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

/* LISTA DE AÇÕES. Para criar uma nova função do site: adicione uma ação aqui e chame com call('nome') no App.jsx. */
const actions = {
  /* ---------- usuário ---------- */
  /* Cria conta: valida campos, impede número repetido, grava a senha criptografada (bcrypt) e já devolve o token de login. */
  async register(b) {
    const phone = onlyDigits(b.phone), name = String(b.name || '').trim();
    if (!name || phone.length < 10 || !TEAMS.includes(b.team) || String(b.password || '').length < 6)
      bad('Preencha nome, número, equipe e senha (mín. 6 caracteres).');
    if (!okBirth(b.birth)) bad('Informe uma data de nascimento válida.');
    if ((await sql`select 1 from users where phone=${phone}`).length) bad('Esse número já está cadastrado.');
    const hash = await bcrypt.hash(b.password, 10);
    await sql`insert into users(phone,name,team,hash,birth) values(${phone},${name},${b.team},${hash},${b.birth})`;
    return { token: sign({ role: 'user', phone }), user: { phone, name, team: b.team, hasBirth: true } };
  },
  /* Confere número e senha. A mensagem de erro é a mesma para número inexistente e senha errada (não revela qual). */
  async login(b) {
    const [r] = await sql`select phone,name,team,hash,birth from users where phone=${onlyDigits(b.phone)}`;
    if (!r || !(await bcrypt.compare(String(b.password || ''), r.hash))) bad('Número ou senha incorretos.', 401);
    return { token: sign({ role: 'user', phone: r.phone }), user: pubUser(r) };
  },
  /* Quem sou eu? Usado ao reabrir o site para restaurar a sessão. */
  async me(b, u) {
    needUser(u);
    const [r] = await sql`select phone,name,team,birth from users where phone=${u.phone}`;
    if (!r) bad('Sessão inválida', 401);
    return { user: pubUser(r) };
  },
  /* Troca a senha do usuário logado (a nova é criptografada antes de salvar). */
  async setPassword(b, u) {
    needUser(u);
    if (String(b.password || '').length < 6) bad('Mínimo 6 caracteres.');
    await sql`update users set hash=${await bcrypt.hash(b.password, 10)} where phone=${u.phone}`;
  },
  /* Cadastra a data de nascimento de quem ainda não tem (contas antigas). Só funciona uma vez: depois não dá para trocar. */
  async setBirth(b, u) {
    needUser(u);
    if (!okBirth(b.birth)) bad('Informe uma data de nascimento válida.');
    const r = await sql`update users set birth=${b.birth} where phone=${u.phone} and birth is null returning phone`;
    if (!r.length) bad('A data de nascimento já está cadastrada.');
  },
  /* ESQUECI MINHA SENHA (sem login): número + data de nascimento + nova senha. Só troca se a data for igual à do cadastro. Depois de 5 erros seguidos, trava por 15 minutos. */
  async forgotPassword(b) {
    const phone = onlyDigits(b.phone);
    if (String(b.password || '').length < 6) bad('A nova senha precisa ter no mínimo 6 caracteres.');
    if (!okBirth(b.birth)) bad('Informe uma data de nascimento válida.');
    const [r] = await sql`select birth, (lock_until is not null and lock_until > now()) as locked from users where phone=${phone}`;
    if (!r) bad('Número ou data de nascimento incorretos.', 401);
    if (r.locked) bad('Muitas tentativas erradas. Tente de novo em 15 minutos.', 429);
    if (!r.birth) bad('Esta conta ainda não tem data de nascimento. Entre com sua senha atual e cadastre em Meus gastos, ou procure a administração.');
    if (r.birth !== b.birth) {
      await sql`update users set fails = case when coalesce(fails,0) + 1 >= 5 then 0 else coalesce(fails,0) + 1 end, lock_until = case when coalesce(fails,0) + 1 >= 5 then now() + interval '15 minutes' else lock_until end where phone=${phone}`;
      bad('Número ou data de nascimento incorretos.', 401);
    }
    await sql`update users set hash=${await bcrypt.hash(b.password, 10)}, fails=0, lock_until=null where phone=${phone}`;
  },
  /* Pedidos do próprio usuário (até 500), do mais novo para o mais antigo. ts = data/hora em milissegundos. */
  async myOrders(b, u) {
    needUser(u);
    const rows = await sql`select id, items, total, extract(epoch from created_at)*1000 as ts from orders where phone=${u.phone} order by created_at desc limit 500`;
    return { orders: rows.map((r) => ({ ...r, total: +r.total, ts: +r.ts })) };
  },

  /* ---------- loja ---------- */
  /* Entrega produtos e pratos da semana para a loja. */
  async catalog(b, u) {
    if (!u) bad('Faça login para continuar', 401);
    const [semeado] = await sql`select 1 from settings where key='seeded'`;
    /* Primeira vez: carrega a lista inicial de _catalog.js. Marca em 'settings' para não repetir (assim produtos removidos não voltam). */
    if (!semeado) { /* primeira vez: carrega a lista de produtos inicial */
      await sql`insert into products(cat,name,price) select * from unnest(${BASE.map((x) => x.cat)}::text[], ${BASE.map((x) => x.name)}::text[], ${BASE.map((x) => x.price)}::numeric[])`;
      await sql`insert into settings(key,value) values('seeded','true') on conflict do nothing`;
    }
    /* VERSÃO: um texto curto calculado no próprio banco. Se for igual à que o navegador já tem, responde só { same: true } e NÃO baixa fotos de novo (economiza a transferência do Neon). */
    const [{ v }] = await sql`select (select count(*)||'-'||coalesce(max(id),0)||'-'||coalesce(sum(price),0) from products) || '|' || (select coalesce(string_agg(day||coalesce(name,'')||coalesce(price,0),','),'') from week) as v`;
    if (b.ver && b.ver === v) return { same: true };
    const products = (await sql`select id,cat,name,price,novo, extract(epoch from created_at)*1000 as ts from products order by id`)
      .map((r) => ({ ...r, price: +r.price, ts: +r.ts }));
    const week = (await sql`select day,name,price from week`).map((r) => ({ ...r, price: +r.price }));
    return { products, week, ver: v };
  },
  /* Registra um pedido. Recalcula tudo pelo banco: nome, preço e total. Limites: até 60 linhas e 50 unidades por item. */
  async order(b, u) {
    needUser(u);
    const req = (Array.isArray(b.items) ? b.items : []).slice(0, 60);
    if (!req.length) bad('Carrinho vazio.');
    const ids = req.map((i) => +i.id).filter(Number.isInteger);
    const P = ids.length ? await sql`select id,name,price from products where id = any(${ids})` : [];
    const W = await sql`select day,name,price from week`;
    const items = req.map((i) => {
      const q = Math.min(50, Math.max(1, parseInt(i.q) || 1));
      const p = String(i.id).startsWith('w:') ? W.find((x) => 'w:' + x.day === i.id) : P.find((x) => x.id === +i.id);
      if (!p) bad('Um item do carrinho saiu da loja. Atualize e tente de novo.');
      return { n: p.name, p: +p.price, q }; /* preço vem do banco, nunca do navegador */
    });
    const total = money(items.reduce((s, i) => s + i.p * i.q, 0));
    const [usr] = await sql`select name,team from users where phone=${u.phone}`;
    await sql`insert into orders(phone,name,team,items,total) values(${u.phone},${usr.name},${usr.team},${JSON.stringify(items)}::jsonb,${total})`;
  },

  /* ---------- administração ---------- */
  /* Login da administração. No primeiro acesso aceita ADMIN_LOGIN/ADMIN_PASSWORD da Vercel e guarda a senha criptografada em 'settings'. Token válido por 12 h. */
  async adminLogin(b) {
    const login = String(b.login || ''), pw = String(b.password || '');
    const [r] = await sql`select value from settings where key='admin'`;
    let ok = false;
    if (r) {
      ok = r.value.login === login && (await bcrypt.compare(pw, r.value.hash));
    } else if (pw && login === process.env.ADMIN_LOGIN && pw === process.env.ADMIN_PASSWORD) {
      ok = true; /* primeiro acesso: usa as variáveis da Vercel e guarda a senha criptografada */
      await sql`insert into settings(key,value) values('admin',${JSON.stringify({ login, hash: await bcrypt.hash(pw, 10) })}::jsonb) on conflict do nothing`;
    }
    if (!ok) bad('Login ou senha incorretos.', 401);
    return { token: sign({ role: 'admin' }, '12h') };
  },
  /* Troca login e senha da administração. */
  async setAdmin(b, u) {
    needAdm(u);
    const login = String(b.login || '').trim();
    if (!login || String(b.password || '').length < 6) bad('Informe login e senha (mín. 6).');
    const v = JSON.stringify({ login, hash: await bcrypt.hash(b.password, 10) });
    await sql`insert into settings(key,value) values('admin',${v}::jsonb) on conflict (key) do update set value=excluded.value`;
  },
  /* Lista todos os usuários cadastrados (sem foto, para ficar leve), em ordem alfabética. O painel separa por equipe. */
  async adminUsers(b, u) {
    needAdm(u);
    const [{ v }] = await sql`select count(*)||'-'||count(birth) as v from users`;
    if (b.ver && String(b.ver) === String(v)) return { same: true };
    const rows = await sql`select phone, name, team, (birth is not null) as hb, extract(epoch from created_at)*1000 as ts from users order by lower(name)`;
    return { users: rows.map((r) => ({ ...r, ts: +r.ts })), ver: String(v) };
  },
  /* Todos os pedidos (até 3000) para a tabela em tempo real, o PDF e a planilha. */
  async adminOrders(b, u) {
    needAdm(u);
    /* Mesma ideia: só baixa a lista de pedidos se algo mudou (novo, excluído ou limpo). */
    const [{ v }] = await sql`select count(*)||'-'||coalesce(max(id),0)||'-'||coalesce(sum(total),0)||'-'||coalesce(sum(jsonb_array_length(items)),0) as v from orders`;
    if (b.ver && b.ver === v) return { same: true };
    const rows = await sql`select id,phone,name,team,items,total, extract(epoch from created_at)*1000 as ts from orders order by created_at desc limit 3000`;
    return { orders: rows.map((r) => ({ ...r, total: +r.total, ts: +r.ts })), ver: v };
  },
  /* Exclui um pedido pelo id. */
  async deleteOrder(b, u) { needAdm(u); await sql`delete from orders where id=${+b.id}`; },
  /* Apaga os pedidos de um mês ('2026-10'), no horário de São Paulo. */
  async clearMonth(b, u) {
    needAdm(u);
    if (!/^\d{4}-\d{2}$/.test(b.month)) bad('Mês inválido.');
    await sql`delete from orders where to_char(created_at at time zone 'America/Sao_Paulo','YYYY-MM') = ${b.month}`;
  },
  /* Remove UM item de um pedido (botão ✕ na tabela em tempo real). Recalcula o total; se não sobrar item, apaga o pedido. 'idx' = posição do item e 'n' = nome (confere se o pedido não mudou). */
  async removeOrderItem(b, u) {
    needAdm(u);
    const [o] = await sql`select items from orders where id=${+b.id}`;
    if (!o) bad('Pedido não encontrado (talvez já excluído).', 404);
    const i = +b.idx;
    if (!o.items[i] || o.items[i].n !== b.n) bad('O pedido mudou. Atualize a tela e tente de novo.', 409);
    const items = o.items.filter((_, k) => k !== i);
    if (!items.length) { await sql`delete from orders where id=${+b.id}`; return { deleted: true }; }
    const total = money(items.reduce((s, x) => s + x.p * x.q, 0));
    await sql`update orders set items=${JSON.stringify(items)}::jsonb, total=${total} where id=${+b.id}`;
    return { deleted: false, total };
  },
  /* Tamanho do banco (para a barra de % na administração): total e por tabela, em bytes. */
  async dbUsage(b, u) {
    needAdm(u);
    const [t] = await sql`select pg_database_size(current_database()) as bytes`;
    const rows = await sql`select c.relname as nome, pg_total_relation_size(c.oid) as bytes from pg_class c where c.relkind='r' and c.relnamespace='public'::regnamespace order by 2 desc`;
    return { bytes: +t.bytes, limit: LIMIT_BYTES, tables: rows.map((r) => ({ nome: r.nome, bytes: +r.bytes })) };
  },
  /* Cadastra produto novo com a marca 'novo' (etiqueta Novidade na loja). */
  async addProduct(b, u) {
    needAdm(u);
    const name = String(b.name || '').trim();
    if (!CATS.includes(b.cat) || !name || !(+b.price >= 0)) bad('Informe categoria, nome e valor.');
    await sql`insert into products(cat,name,price,novo) values(${b.cat},${name},${money(b.price)},true)`;
  },
  /* Remove o produto de verdade (DELETE). Pedidos antigos não são afetados porque guardam nome e preço da época. */
  async removeProduct(b, u) { /* remoção de verdade: apaga a linha do banco */
    needAdm(u);
    const [r] = await sql`delete from products where id=${+b.id} returning name`;
    if (!r) bad('Produto não encontrado (talvez já removido).', 404);
    return { name: r.name };
  },
  /* Substitui o cardápio da semana: apaga tudo e grava só os dias preenchidos. */
  async saveWeek(b, u) {
    needAdm(u);
    await sql`delete from week`;
    for (const d of DAYS) {
      const w = b.days?.[d];
      if (w?.name) await sql`insert into week(day,name,price) values(${d},${String(w.name).trim()},${money(w.price)})`;
    }
  },
};

/* PORTA DE ENTRADA da API: valida o método, confere variáveis de ambiente, prepara o banco, identifica o usuário (who) e executa a ação pedida. */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  try {
    /* Se faltar DATABASE_URL ou JWT_SECRET, devolve uma mensagem clara. */
    checkEnv();
    await ensure();
    /* 'action' escolhe a função; o resto do corpo vira os dados 'b'. */
    const { action, ...body } = req.body || {};
    if (!actions[action]) bad('Ação inválida');
    res.status(200).json((await actions[action](body, who(req))) ?? { ok: true });
  } catch (e) {
    if (!e.status) console.error(e);
    /* sem status = erro inesperado: mostra o motivo para facilitar achar o problema */
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Erro no servidor: ' + String(e.message).slice(0, 140) });
  }
}
