/*
 * App.jsx — Todas as telas do site (React + Bootstrap).
 * Organização do arquivo, de cima para baixo:
 *   1. Constantes e utilidades (formatação, redução de foto, chamada à API)
 *   2. makePdf / makeCsv ... geram o fechamento do mês (admin)
 *   3. App .................. estado geral, avisos, menu e abas
 *   4. Auth ................. cadastro e login do usuário
 *   5. Shop ................. loja, carrinho e finalização do pedido
 *   6. Spending ............. "Meus gastos" e troca de senha
 *   7. AdminLogin / Admin ... área da administração
 * Manutenção: preços e regras ficam no servidor (api/index.js). Aqui ficam só a aparência e o fluxo das telas.
 */
import { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';

/* ---------- constantes e utilidades ---------- */
/* CONSTANTES. TEAMS = equipes do cadastro (se mudar, mude também em api/index.js). CATS = categorias da loja [emoji, nome]. DAYS = dias do almoço da semana [código, nome]. */
const TEAMS = ['EVA', 'VIVA', 'ED', 'BANCAR', 'DEV'];
const CATS = { doces: ['🍬', 'Doces'], sobremesas: ['🍮', 'Sobremesas'], lanches: ['🥪', 'Lanches'], bebidas: ['🥤', 'Bebidas'] };
const DAYS = [['seg', 'Segunda'], ['ter', 'Terça'], ['qua', 'Quarta'], ['qui', 'Quinta'], ['sex', 'Sexta']];
/* FORMATADORES. R = dinheiro (R$ 1,50) · ym = mês como '2026-10' (usado para filtrar) · dt = data · hr = hora. */
const R = (n) => 'R$ ' + Number(n).toFixed(2).replace('.', ',');
const ym = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const dt = (t) => new Date(t).toLocaleDateString('pt-BR');
const hr = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
/* Transforma a lista de itens de um pedido em texto: '2x Paçoca, 1x Mentos'. */
const txt = (items) => items.map((i) => `${i.q}x ${i.n}`).join(', ');

/* Toca um 'bip' curto quando chega um pedido novo (se o navegador bloquear o som, ignora). */
const beep = () => { try { const a = new AudioContext(), o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.18); } catch { /* sem som */ } };

/* Chamada única para a API (/api). admin=true usa o token da administração. */
async function call(action, body = {}, admin = false) {
  /* Escolhe qual 'crachá' (token) enviar: o da administração (admin=true) ou o do usuário comum. */
  const tk = admin ? sessionStorage.getItem('atk') : localStorage.getItem('tk') || sessionStorage.getItem('atk');
  /* Todas as telas falam com a mesma rota /api. 'action' diz ao servidor o que fazer (ver api/index.js). */
  const r = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(tk && { Authorization: 'Bearer ' + tk }) },
    body: JSON.stringify({ action, ...body }),
  });
  const d = await r.json().catch(() => ({}));
  /* Se o servidor respondeu erro, lança uma exceção com a mensagem dele (as telas mostram esse texto). */
  if (!r.ok) throw Object.assign(new Error(d.error || 'Erro de conexão'), { status: r.status });
  return d;
}

/* PDF do fechamento: resumo por equipe + detalhe por pessoa. Retorna false se o mês não tem pedidos. */
function makePdf(orders, m) {
  const l = orders.filter((o) => ym(o.ts) === m).sort((a, b) => a.ts - b.ts);
  if (!l.length) return false;
  /* D = documento PDF. y = posição vertical atual da 'caneta' na página. */
  const D = new jsPDF(); let y = 38;
  /* Escreve uma linha de texto. Parâmetros: texto, posição x, tamanho, negrito, valor alinhado à direita. Quebra de página automática perto do rodapé. */
  const ln = (t, x = 14, s = 10, b = false, r) => {
    if (y > 280) { D.addPage(); y = 18; }
    D.setFontSize(s); D.setFont('helvetica', b ? 'bold' : 'normal'); D.text(t, x, y);
    if (r) D.text(r, 196, y, { align: 'right' });
    y += s * 0.5 + 2.5;
  };
  /* Faixa vermelha do topo com o título e o mês do fechamento. */
  D.setFillColor(227, 52, 42); D.rect(0, 0, 210, 28, 'F'); D.setTextColor(255);
  D.setFontSize(18); D.setFont('helvetica', 'bold'); D.text('Cozinha da Tere', 14, 13);
  D.setFontSize(10); D.text(`Fechamento de ${m.slice(5)}/${m.slice(0, 4)}`, 14, 21); D.setTextColor(0);
  /* Primeiro bloco: quantas pessoas e quanto cada equipe consumiu, mais o total geral. */
  ln('Resumo por equipe', 14, 12, true);
  TEAMS.forEach((t) => { const x = l.filter((o) => o.team === t); if (x.length) ln(`${t} - ${new Set(x.map((o) => o.phone)).size} pessoa(s)`, 16, 10, false, R(x.reduce((s, o) => s + o.total, 0))); });
  ln('TOTAL GERAL', 14, 11, true, R(l.reduce((s, o) => s + o.total, 0))); y += 4;
  TEAMS.forEach((t) => {
    const x = l.filter((o) => o.team === t); if (!x.length) return;
    /* Segundo bloco: uma seção por equipe, e dentro dela cada pessoa com seus itens, data/hora e total. */
    y += 3; ln(`EQUIPE ${t} - ${R(x.reduce((s, o) => s + o.total, 0))}`, 14, 12, true);
    [...new Set(x.map((o) => o.phone))].forEach((ph) => {
      const z = x.filter((o) => o.phone === ph);
      ln(`Nome: ${z[0].name}   Numero: ${ph}`, 16, 10, true);
      z.forEach((o) => o.items.forEach((i) => ln(`${i.q}x ${i.n}  (${dt(o.ts)} ${hr(o.ts)})`, 20, 9, false, R(i.p * i.q))));
      ln(`Total de ${z[0].name}`, 16, 10, true, R(z.reduce((s, o) => s + o.total, 0))); y += 2;
    });
  });
  /* Baixa o arquivo no aparelho de quem clicou. */
  D.save(`fechamento-${m}.pdf`);
  return true;
}

/* Planilha CSV do mês (abre no Excel). Separador ';' e BOM no começo para os acentos funcionarem. */
function makeCsv(orders, m) {
  let c = 'Dia;Hora;Equipe;Nome;Contato;Itens;Total\n';
  orders.filter((o) => ym(o.ts) === m).sort((a, b) => a.ts - b.ts).forEach((o) => {
    c += [dt(o.ts), hr(o.ts), o.team, o.name, o.phone, txt(o.items), o.total.toFixed(2).replace('.', ',')].join(';') + '\n';
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + c], { type: 'text/csv' }));
  a.download = `fechamento-${m}.csv`; a.click();
}

/* ---------- aplicativo ---------- */
/* COMPONENTE PRINCIPAL. Guarda os dados compartilhados entre as abas e faz as consultas periódicas ao servidor. */
export default function App() {
  /* ESTADOS DA INTERFACE: tab = aba aberta · menu = menu do celular aberto · user = usuário logado · isAdm = administração logada. */
  const [tab, setTab] = useState('cad');
  const [menu, setMenu] = useState(false);
  const [user, setUser] = useState(null);
  const [isAdm, setIsAdm] = useState(!!sessionStorage.getItem('atk'));
  /* DADOS vindos do servidor: prods = produtos · week = pratos da semana · orders = todos os pedidos (admin) · users = todos os cadastrados (admin). */
  const [prods, setProds] = useState([]);
  const [week, setWeek] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  /* cart = carrinho no formato { idDoProduto: quantidade } · msg = texto do aviso que aparece no topo. */
  const [cart, setCart] = useState({});
  const [msg, setMsg] = useState('');
  /* REFS (guardam valores sem redesenhar a tela): known = produtos já vistos (para avisar remoções) · seen/seenU = pedidos e usuários já vistos (para avisar novos) · timer = relógio do aviso. */
  const known = useRef(null), seen = useRef(null), seenU = useRef(null), timer = useRef(), verC = useRef(null), verO = useRef(null), verU = useRef(null); /* verC/verO/verU = última 'versão' recebida do catálogo, pedidos e usuários */

  /* Mostra um aviso verde no topo por 5,5 segundos. Use em qualquer lugar para dar retorno ao usuário. */
  const notify = (m) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(''), 5500); };

  /* volta logado se já tiver sessão salva */
  useEffect(() => {
    /* AO ABRIR O SITE: se existe uma sessão salva no aparelho, pergunta ao servidor quem é e já leva para a loja. */
    if (!localStorage.getItem('tk')) return;
    call('me').then((d) => { setUser(d.user); setTab('loja'); }).catch(() => localStorage.removeItem('tk'));
  }, []);

  /* catálogo: atualiza a cada 6s; avisa quando um produto some da loja */
  /* Busca produtos e pratos da semana. Compara com a lista anterior: se um produto sumiu, avisa 'foi removido da loja'. */
  const loadCatalog = async () => {
    try {
      /* Manda a versão que já tem: se nada mudou, o servidor responde { same: true } e não reenvia as fotos. */
      const d = await call('catalog', { ver: verC.current });
      if (d.same) return;
      verC.current = d.ver;
      /* Só compara depois da primeira carga (senão avisaria tudo como removido). */
      if (known.current) {
        const ids = new Set(d.products.map((p) => p.id));
        known.current.forEach((nome, id) => { if (!ids.has(id)) notify(`🗑️ "${nome}" foi removido da loja`); });
      }
      known.current = new Map(d.products.map((p) => [p.id, p.name]));
      setProds(d.products); setWeek(d.week);
    } catch { /* tenta de novo no próximo ciclo */ }
  };
  useEffect(() => {
    /* Repete a busca do catálogo a cada 30 s, SÓ com a aba visível (economiza o banco). Ao voltar para a aba, atualiza na hora. O return desliga tudo. */
    if (!user && !isAdm) return;
    verC.current = null;
    loadCatalog();
    const t = setInterval(() => { if (!document.hidden) loadCatalog(); }, 30000);
    const vis = () => { if (!document.hidden) loadCatalog(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [user, isAdm]);

  /* pedidos em tempo real (administração): consulta a cada 4s e avisa pedidos novos */
  /* ADMIN: busca pedidos e usuários a cada 4 s. Novos pedidos e novos cadastros geram aviso (e bip no caso dos pedidos). */
  const loadOrders = async () => {
    try {
      const d = await call('adminOrders', { ver: verO.current }, true);
      if (!d.same) {
      verO.current = d.ver;
      /* Pedidos cujo id ainda não foi visto = pedidos novos. Na primeira carga não avisa (seen ainda é null). */
      if (seen.current) d.orders.filter((o) => !seen.current.has(o.id)).forEach((o) => { notify(`🔔 ${o.name} (${o.team}) pegou ${txt(o.items)} · ${R(o.total)}`); beep(); });
      seen.current = new Set(d.orders.map((o) => o.id)); setOrders(d.orders);
      }
      const u = await call('adminUsers', { ver: verU.current }, true);
      if (!u.same) {
        verU.current = u.ver;
        if (seenU.current) u.users.filter((x) => !seenU.current.has(x.phone)).forEach((x) => notify(`🆕 ${x.name} (${x.team}) acabou de se cadastrar`));
        seenU.current = new Set(u.users.map((x) => x.phone)); setUsers(u.users);
      }
    } catch (e) {
      /* Sessão da administração expirou (dura 12 h): desloga para pedir o login de novo. */
      if (e.status === 401 || e.status === 403) { sessionStorage.removeItem('atk'); setIsAdm(false); }
    }
  };
  useEffect(() => {
    /* Liga a consulta de 15 s só quando a administração está logada; ao sair, zera o que já tinha sido visto. */
    if (!isAdm) { seen.current = null; seenU.current = null; verO.current = null; verU.current = null; return; }
    loadOrders();
    /* 15 s: o aviso de pedido novo chega em até 15 s, mas gasta bem menos do banco que 4 s. */
    const t = setInterval(loadOrders, 15000);
    return () => clearInterval(t);
  }, [isAdm]);

  /* Sair da conta: apaga o token do aparelho, limpa carrinho e volta para a aba Cadastro. */
  const logout = () => { localStorage.removeItem('tk'); setUser(null); setCart({}); setTab('cad'); };
  /* Abas do menu: [código, rótulo]. A primeira muda de 'Cadastro' para 'Conta' quando há usuário logado. */
  const TABS = [['cad', user ? 'Conta' : 'Cadastro'], ['gas', 'Meus gastos'], ['loja', 'Loja'], ['adm', 'Administração']];

  return (
    <>
      {/* BARRA DO TOPO (Bootstrap navbar): marca, foto do usuário e menu. No celular o menu vira botão de 3 risquinhos. */}
      <nav className="navbar navbar-expand-md navbar-dark topbar sticky-top">
        <div className="container">
          <span className="navbar-brand brand fs-4 mb-0 lh-1">Cozinha da Tere
            <small className="d-block fw-bold" style={{ color: '#ffb400', fontSize: '.7rem', fontFamily: 'Work Sans' }}>Pegou, anotou, pagou no dia 1</small>
          </span>
          <div className="d-flex align-items-center gap-2 order-md-last">
            {/* Círculo com a inicial do nome no canto superior direito (só aparece logado). Não há mais foto de perfil. */}
            {user && <span className="avatar" title={user.name}>{user.name[0]}</span>}
            <button className="navbar-toggler" aria-label="Menu" onClick={() => setMenu(!menu)}><span className="navbar-toggler-icon" /></button>
          </div>
          {/* Menu: no celular abre/fecha pelo estado 'menu'; no computador fica sempre visível (navbar-expand-md). */}
          <div className={'collapse navbar-collapse' + (menu ? ' show' : '')}>
            <ul className="navbar-nav ms-auto py-2 gap-md-1">
              {TABS.map(([k, l]) => (
                <li className="nav-item" key={k}>
                  <button className={'btn btn-link nav-link text-white fw-bold' + (tab === k ? ' text-decoration-underline' : '')} onClick={() => { setTab(k); setMenu(false); }}>{l}</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>

      {/* AVISO (toast do Bootstrap) — aparece quando 'msg' tem texto. */}
      {msg && <div className="toast-wrap"><div className="toast show text-bg-success fw-bold"><div className="toast-body">{msg}</div></div></div>}

      {/* CONTEÚDO: mostra só a aba escolhida. 'container' centraliza e limita a largura em telas grandes. */}
      <main className="container py-3">
        {/* Aviso da data de nascimento: aparece em qualquer aba enquanto a pessoa logada ainda não cadastrou. */}
        {user && <BirthNotice user={user} onUser={setUser} notify={notify} />}
        {/* ABA CADASTRO: logado → resumo da conta; deslogado → formulário de cadastro/login. */}
        {tab === 'cad' && (user
          ? <div className="card p-4 mx-auto" style={{ maxWidth: 520 }}>
              <h2>Olá, {user.name}!</h2>
              <p className="text-secondary">{user.team} · {user.phone}</p>
              <div className="d-flex gap-2 flex-wrap"><button className="btn btn-primary" onClick={() => setTab('loja')}>Ir para a loja</button><button className="btn btn-outline-primary" onClick={logout}>Sair</button></div>
            </div>
          : <Auth onLogin={(u) => { setUser(u); setTab('loja'); }} />)}
        {/* ABA MEUS GASTOS: exige login. */}
        {tab === 'gas' && (user ? <Spending notify={notify} /> : <div className="alert alert-warning">Faça login na aba Cadastro.</div>)}
        {/* ABA LOJA: exige login. Recebe o carrinho para ele sobreviver à troca de abas. */}
        {tab === 'loja' && (user ? <Shop user={user} prods={prods} week={week} cart={cart} setCart={setCart} notify={notify} /> : <div className="alert alert-warning">Faça login na aba Cadastro para comprar.</div>)}
        {/* ABA ADMINISTRAÇÃO: logada → painel; senão → tela de login da administração. */}
        {tab === 'adm' && (isAdm
          ? <Admin orders={orders} users={users} prods={prods} week={week} notify={notify} reload={loadCatalog} reloadOrders={loadOrders} known={known} onExit={() => { sessionStorage.removeItem('atk'); setIsAdm(false); }} />
          : <AdminLogin onOk={() => setIsAdm(true)} />)}
      </main>
    </>
  );
}

/* ---------- aviso da data de nascimento ---------- */
/* AVISO PARA QUEM AINDA NÃO TEM DATA DE NASCIMENTO (contas antigas). Aparece no topo de todas as abas, logo depois do login, com o campo já pronto. A data só pode ser cadastrada uma vez e serve para recuperar a senha em "Esqueci minha senha". */
function BirthNotice({ user, onUser, notify }) {
  const [bd, setBd] = useState('');
  const [err, setErr] = useState('');
  const [hide, setHide] = useState(false);
  if (user.hasBirth || hide) return null;
  const save = async (e) => {
    e.preventDefault(); setErr('');
    try { await call('setBirth', { birth: bd }); onUser({ ...user, hasBirth: true }); notify('Data de nascimento cadastrada. Obrigado!'); }
    catch (x) { setErr(x.message); }
  };
  return (
    <form className="alert alert-warning mb-3" onSubmit={save}>
      <b>🎂 Cadastre sua data de nascimento</b>
      <div className="small mb-2">Ela será pedida se você esquecer a senha. Só pode ser cadastrada uma vez, então confira antes de salvar.</div>
      <div className="d-flex gap-2 flex-wrap align-items-center">
        <input className="form-control" style={{ maxWidth: 200 }} type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={bd} onChange={(e) => setBd(e.target.value)} required aria-label="Data de nascimento" />
        <button className="btn btn-primary">Salvar</button>
        <button type="button" className="btn btn-link" onClick={() => setHide(true)}>Agora não</button>
      </div>
      {err && <div className="text-danger small mt-2">{err}</div>}
    </form>
  );
}

/* ---------- cadastro / login ---------- */
/* CADASTRO, LOGIN E "ESQUECI MINHA SENHA". 'mode' escolhe a tela: 'in' = entrar · 'up' = criar conta · 'fp' = esqueci minha senha. */
function Auth({ onLogin }) {
  const [mode, setMode] = useState('in');
  /* f = campos do formulário (birth = data de nascimento AAAA-MM-DD) · err = erro · okMsg = sucesso · busy = enviando. */
  const [f, setF] = useState({ name: '', phone: '', team: '', birth: '', password: '' });
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(false);
  /* Cria o onChange de um campo: set('name') atualiza só f.name. */
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  /* Troca de tela e limpa as mensagens. */
  const go = (m) => { setMode(m); setErr(''); setOkMsg(''); };
  /* Envia para o servidor. Entrar/cadastrar: guarda o token no aparelho e avisa o App (onLogin). Esqueci a senha: só troca se a data de nascimento for igual à do cadastro. */
  const send = async (e) => {
    e.preventDefault(); setErr(''); setOkMsg(''); setBusy(true);
    try {
      if (mode === 'fp') {
        await call('forgotPassword', { phone: f.phone, birth: f.birth, password: f.password });
        setF({ ...f, password: '', birth: '' }); setMode('in'); setOkMsg('Senha alterada! Entre com a nova senha.');
      } else {
        const d = await call(mode === 'up' ? 'register' : 'login', f);
        localStorage.setItem('tk', d.token); onLogin(d.user);
      }
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <form className="card p-4 mx-auto" style={{ maxWidth: 520 }} onSubmit={send}>
      <h2>{mode === 'up' ? 'Criar cadastro' : mode === 'fp' ? 'Esqueci minha senha' : 'Entrar'}</h2>
      <p className="text-secondary">{mode === 'up' ? 'Preencha uma vez só.' : mode === 'fp' ? 'Informe seu número e a data de nascimento do cadastro.' : 'Use seu número e senha.'}</p>
      {/* Campo Nome — só no cadastro. */}
      {mode === 'up' && <div className="mb-3"><label className="form-label fw-bold">Nome</label><input className="form-control" value={f.name} onChange={set('name')} required /></div>}
      <div className="mb-3"><label className="form-label fw-bold">Número (celular)</label><input className="form-control" inputMode="tel" placeholder="(00) 00000-0000" value={f.phone} onChange={set('phone')} required /></div>
      {/* Equipe — só no cadastro. */}
      {mode === 'up' && <div className="mb-3"><label className="form-label fw-bold">Equipe</label>
        <select className="form-select" value={f.team} onChange={set('team')} required><option value="">Selecione sua equipe</option>{TEAMS.map((t) => <option key={t}>{t}</option>)}</select></div>}
      {/* Data de nascimento — no cadastro e no "esqueci minha senha". É ela que confirma quem é a pessoa. */}
      {mode !== 'in' && <div className="mb-3"><label className="form-label fw-bold">Data de nascimento</label><input className="form-control" type="date" min="1900-01-01" max={hoje} value={f.birth} onChange={set('birth')} required /></div>}
      <div className="mb-3"><label className="form-label fw-bold">{mode === 'fp' ? 'Nova senha (mín. 6 caracteres)' : 'Senha (mín. 6 caracteres)'}</label><input className="form-control" type="password" minLength={6} value={f.password} onChange={set('password')} required /></div>
      {/* Mensagens: sucesso (verde) e erro vindo do servidor (vermelho). */}
      {okMsg && <div className="alert alert-success py-2">{okMsg}</div>}
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <div className="d-grid gap-2 d-sm-flex">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Aguarde...' : mode === 'up' ? 'Cadastrar' : mode === 'fp' ? 'Trocar senha' : 'Entrar'}</button>
        {mode === 'fp'
          ? <button type="button" className="btn btn-outline-primary" onClick={() => go('in')}>Voltar</button>
          : <button type="button" className="btn btn-outline-primary" onClick={() => go(mode === 'up' ? 'in' : 'up')}>{mode === 'up' ? 'Já tenho conta' : 'Criar conta'}</button>}
      </div>
      {/* Link "Esqueci minha senha" só na tela de entrar. */}
      {mode === 'in' && <button type="button" className="btn btn-link px-0 mt-2" onClick={() => go('fp')}>Esqueci minha senha</button>}
    </form>
  );
}

/* ---------- loja ---------- */
/* LOJA. Mostra almoço da semana, categorias, produtos, carrinho (barra inferior + janela) e envia o pedido. */
function Shop({ user, prods, week, cart, setCart, notify }) {
  /* cat = categoria aberta · open = janela do carrinho aberta. */
  const [cat, setCat] = useState('doces');
  const [open, setOpen] = useState(false);
  /* Junta pratos da semana e produtos numa lista única. 'key' é o id do carrinho: 'w:seg' para pratos, número para produtos. */
  const items = [
    ...week.map((w) => ({ key: 'w:' + w.day, name: `${DAYS.find((d) => d[0] === w.day)?.[1]}: ${w.name}`, price: w.price, cat: 'w' })),
    ...prods.map((p) => ({ ...p, key: String(p.id) })),
  ];
  /* Dicionário key → item, para achar rápido o produto de cada linha do carrinho. */
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  /* Linhas do carrinho que ainda existem na loja (se o admin removeu algo, ignora). total = soma · n = quantidade de itens. */
  const lines = Object.entries(cart).filter(([k]) => by[k]);
  const total = lines.reduce((s, [k, q]) => s + by[k].price * q, 0), n = lines.reduce((s, [, q]) => s + q, 0);
  /* Botão '+': soma 1 na quantidade do item. */
  const add = (k) => { setCart((c) => ({ ...c, [k]: (c[k] || 0) + 1 })); notify('Adicionado ao carrinho'); };
  /* Botões − e + do carrinho. Se a quantidade chega a 0, o item sai do carrinho. */
  const qty = (k, d) => setCart((c) => { const v = { ...c, [k]: c[k] + d }; if (v[k] <= 0) delete v[k]; return v; });
  /* Saudação conforme o horário: Bom dia / Boa tarde / Boa noite. */
  const h = new Date().getHours(), g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  /* Finaliza: manda só ids e quantidades. O servidor busca os preços no banco (o navegador não consegue alterar valores). */
  const finish = async () => {
    try { await call('order', { items: lines.map(([id, q]) => ({ id, q })) }); setCart({}); setOpen(false); notify('Pedido registrado! ✅'); }
    catch (e) { notify('Erro ao enviar: ' + e.message); }
  };
  /* Cartão de um produto: emoji da categoria, nome, preço e botão '+'. A etiqueta Novidade dura 14 dias (12096e5 ms). */
  const Card = ({ x }) => (
    <div className="col"><div className="card pcard h-100 p-2">
      {x.novo && Date.now() - x.ts < 12096e5 && <span className="badge text-bg-danger tagnew">Novidade</span>}
      <div className="ph">{CATS[x.cat]?.[0] || '🍽️'}</div>
      <div className="nm mt-2">{x.name}</div><div className="price">{R(x.price)}</div>
      <button className="btn btn-primary add" aria-label={'Adicionar ' + x.name} onClick={() => add(x.key)}>+</button>
    </div></div>
  );
  /* Classes Bootstrap da grade: 2 colunas no celular, 3 / 4 / 5 em telas maiores. */
  const grid = 'row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 g-3';
  /* Pratos da semana (categoria especial 'w'). */
  const wk = items.filter((i) => i.cat === 'w');
  return (
    <>
      {/* FAIXA DE BOAS-VINDAS. */}
      <div className="hero p-4 mb-3"><h2>{g}, {user.name.split(' ')[0]}!</h2><p className="mb-0">Escolha, monte o carrinho e pronto: tudo entra na sua conta do mês.</p></div>
      {/* ALMOÇO DA SEMANA — só aparece se o administrador cadastrou pratos. */}
      {wk.length > 0 && <><h3 className="h4 mt-3">🍽️ Almoço da semana</h3><div className={grid}>{wk.map((x) => <Card key={x.key} x={x} />)}</div></>}
      {/* BOTÕES DE CATEGORIA — a ativa fica vermelha. */}
      <div className="d-flex gap-2 flex-wrap my-3">
        {Object.entries(CATS).map(([k, v]) => <button key={k} className={'btn rounded-pill ' + (k === cat ? 'btn-primary' : 'btn-outline-primary')} onClick={() => setCat(k)}>{v[0]} {v[1]}</button>)}
      </div>
      {/* PRODUTOS DA CATEGORIA — novidades primeiro (sort). */}
      <h3 className="h4">{CATS[cat][0]} {CATS[cat][1]}</h3>
      <div className={grid}>{items.filter((i) => i.cat === cat).sort((a, b) => !!b.novo - !!a.novo).map((x) => <Card key={x.key} x={x} />)}</div>

      {/* BARRA DO CARRINHO fixa no rodapé (aparece quando há itens). */}
      {n > 0 && <div className="cartbar bg-dark text-white p-3 d-flex justify-content-between align-items-center"><span>🛒 {n} item(ns) · {R(total)}</span><button className="btn btn-warning fw-bold" onClick={() => setOpen(true)}>Ver carrinho</button></div>}
      {/* JANELA DO CARRINHO (modal do Bootstrap controlado pelo React). Clicar no fundo escuro fecha. */}
      {open && <div className="modal d-block" style={{ background: '#0008' }} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable"><div className="modal-content">
          <div className="modal-header"><h5 className="modal-title">Seu carrinho</h5><button className="btn-close" onClick={() => setOpen(false)} /></div>
          <div className="modal-body">{lines.map(([k, q]) => (
            <div key={k} className="d-flex align-items-center gap-2 border-bottom py-2">
              <span className="flex-grow-1">{by[k].name}</span>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => qty(k, -1)}>−</button><b>{q}</b><button className="btn btn-sm btn-outline-secondary" onClick={() => qty(k, 1)}>+</button>
              <b className="text-end" style={{ minWidth: 70 }}>{R(by[k].price * q)}</b>
            </div>))}</div>
          <div className="modal-footer justify-content-between"><b className="fs-5">Total: {R(total)}</b><button className="btn btn-success" onClick={finish}>Finalizar pedido</button></div>
        </div></div>
      </div>}
    </>
  );
}

/* ---------- meus gastos ---------- */
/* MEUS GASTOS: histórico do usuário por mês + criação de nova senha. */
function Spending({ notify }) {
  const [os, setOs] = useState([]);
  const [m, setM] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  /* Ao abrir a aba, busca os pedidos do usuário logado. */
  useEffect(() => { call('myOrders').then((d) => setOs(d.orders)).catch(() => {}); }, []);
  /* ms = meses que têm compras (mais recente primeiro) · cur = mês selecionado · list = pedidos desse mês. */
  const ms = [...new Set(os.map((o) => ym(o.ts)))].sort().reverse();
  const cur = ms.includes(m) ? m : ms[0] || '';
  const list = os.filter((o) => ym(o.ts) === cur);
  /* Troca a senha: não pede a atual (o usuário já está logado). Mínimo de 6 caracteres validado também no servidor. */
  const save = async (e) => {
    e.preventDefault(); setErr('');
    try { await call('setPassword', { password: pw }); setPw(''); notify('Senha alterada. Use a nova no próximo login.'); }
    catch (x) { setErr(x.message); }
  };
  return (
    <div className="row g-3">
      {/* CARD DO HISTÓRICO (ocupa 7/12 em telas grandes e a largura toda no celular). */}
      <div className="col-12 col-lg-7"><div className="card p-3">
        <h2 className="h4">Meus gastos</h2>
        <label className="form-label fw-bold">Mês</label>
        <select className="form-select mb-3" value={cur} onChange={(e) => setM(e.target.value)}>
          {ms.length ? ms.map((x) => <option key={x} value={x}>{x.slice(5)}/{x.slice(0, 4)}</option>) : <option>Sem compras ainda</option>}
        </select>
        <div className="stat bg-success mb-3"><small>Total do mês</small><b>{R(list.reduce((s, o) => s + o.total, 0))}</b></div>
        {list.map((o) => <div key={o.id} className="d-flex justify-content-between gap-2 border-bottom py-2"><span><small className="text-secondary">{dt(o.ts)} {hr(o.ts)}</small><br />{o.items.map((i, k) => <span key={k} className="badge text-bg-light border me-1">{i.q}x {i.n}</span>)}</span><b>{R(o.total)}</b></div>)}
      </div></div>
      {/* CARD DA NOVA SENHA. */}
      <div className="col-12 col-lg-5"><form className="card p-3" onSubmit={save}>
        <h3 className="h5">Esqueceu a senha? Crie uma nova</h3>
        <label className="form-label fw-bold">Nova senha (mín. 6)</label>
        <input className="form-control mb-3" type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <div className="alert alert-danger py-2">{err}</div>}
        <button className="btn btn-primary">Salvar nova senha</button>
      </form></div>
    </div>
  );
}

/* ---------- administração ---------- */
/* LOGIN DA ADMINISTRAÇÃO. O token fica em sessionStorage (some ao fechar a aba) e vale 12 horas. */
function AdminLogin({ onOk }) {
  const [f, setF] = useState({ login: '', password: '' });
  const [err, setErr] = useState('');
  /* Valida login e senha no servidor (primeiro acesso usa ADMIN_LOGIN/ADMIN_PASSWORD da Vercel). */
  const send = async (e) => {
    e.preventDefault();
    try { const d = await call('adminLogin', f); sessionStorage.setItem('atk', d.token); onOk(); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card p-4 mx-auto" style={{ maxWidth: 420 }} onSubmit={send}>
      <h2 className="h4">Administração</h2>
      <label className="form-label fw-bold">Login</label><input className="form-control mb-3" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required />
      <label className="form-label fw-bold">Senha</label><input className="form-control mb-3" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      {err && <div className="alert alert-danger py-2">{err}</div>}
      <button className="btn btn-primary">Entrar</button>
    </form>
  );
}

/* PAINEL DA ADMINISTRAÇÃO. Recebe pedidos e usuários prontos do App (que consulta o servidor a cada 4 s) e tem os formulários de gestão. */
function Admin({ orders, users, prods, week, notify, reload, reloadOrders, known, onExit }) {
  /* fm = mês do fechamento (formato 2026-10). */
  const [fm, setFm] = useState(ym(Date.now()));
  /* rc = categoria mostrada na lista de remoção. */
  const [rc, setRc] = useState('doces');
  /* np = formulário de novo produto. */
  const [np, setNp] = useState({ cat: 'doces', name: '', price: '' });
  const [cred, setCred] = useState({ login: '', password: '' });
  /* wk = formulário do almoço da semana, já preenchido com o que está salvo no banco. */
  const [wk, setWk] = useState(() => Object.fromEntries(DAYS.map(([k]) => {
    const w = week.find((x) => x.day === k) || {};
    return [k, { name: w.name || '', price: w.price ? String(w.price).replace('.', ',') : '' }];
  })));
  /* du = uso do banco (bytes, limite e tamanho por tabela). Busca ao abrir e quando clicar em Atualizar. */
  const [du, setDu] = useState(null);
  const loadUsage = () => call('dbUsage', {}, true).then(setDu).catch(() => {});
  useEffect(() => { loadUsage(); }, []);
  /* Executa uma ação e avisa o resultado. Se der erro, mostra 'Erro: ...' em vez de quebrar a tela. */
  const run = async (fn, ok) => { try { await fn(); if (ok) notify(ok); } catch (e) { notify('Erro: ' + e.message); } };

  /* Pedidos de hoje (to) e do mês atual (mo), usados nos quadros coloridos e nos totais. */
  const today = new Date().toDateString(), cm = ym(Date.now());
  const to = orders.filter((o) => new Date(o.ts).toDateString() === today), mo = orders.filter((o) => ym(o.ts) === cm);
  /* gastoMes: { número: total gasto no mês }, usado na lista de usuários. */
  const gastoMes = {};
  mo.forEach((o) => { gastoMes[o.phone] = (gastoMes[o.phone] || 0) + o.total; });
  /* Quadro colorido de estatística (rótulo + valor). */
  const Stat = ({ c, l, v }) => <div className="col-6 col-md-3"><div className="stat" style={{ background: c }}><small>{l}</small><b>{v}</b></div></div>;

  /* REMOVER PRODUTO: confirma, apaga no banco, tira o produto da lista local (known) para não avisar duas vezes, mostra o aviso e recarrega a loja. */
  const remove = (p) => confirm(`Remover "${p.name}" da loja?`) && run(async () => {
    await call('removeProduct', { id: p.id }, true);
    known.current?.delete(p.id);             /* evita aviso duplicado do vigia do catálogo */
    notify(`🗑️ "${p.name}" foi removido da loja`);
    await reload();
  });
  /* NOVO PRODUTO: envia categoria, nome e valor. O servidor marca como 'novo' (etiqueta Novidade). */
  const addProduct = () => run(async () => {
    await call('addProduct', { ...np, price: parseFloat(np.price.replace(',', '.')) }, true);
    setNp({ ...np, name: '', price: '' }); await reload();
  }, 'Produto publicado como novidade!');
  /* Salva os pratos de segunda a sexta (dia sem nome fica de fora). */
  const saveWeek = () => run(() => call('saveWeek', { days: Object.fromEntries(Object.entries(wk).map(([k, w]) => [k, { ...w, price: parseFloat(w.price.replace(',', '.')) || 0 }])) }, true).then(reload), 'Cardápio da semana salvo.');
  /* REMOVER UM ITEM de um pedido: confirma, pede ao servidor (que recalcula o total) e recarrega a tabela. */
  const removeItem = (o, k) => confirm(`Remover "${o.items[k].n}" do pedido de ${o.name}?`) && run(async () => {
    await call('removeOrderItem', { id: o.id, idx: k, n: o.items[k].n }, true);
    await reloadOrders();
  }, 'Item removido do pedido.');
  /* Apaga os pedidos do mês escolhido. Peça sempre o PDF antes! */
  const clearMonth = () => {
    const n = orders.filter((o) => ym(o.ts) === fm).length;
    if (n && confirm(`Apagar ${n} pedidos de ${fm}? Baixe o PDF antes!`)) run(async () => { await call('clearMonth', { month: fm }, true); await reloadOrders(); }, 'Pedidos do mês apagados.');
  };

  return (
    <>
      {/* QUADROS DO TOPO: pedidos hoje, retirado hoje, total do mês, pessoas no mês. */}
      <div className="row g-2 mb-3">
        <Stat c="#e3342a" l="Pedidos hoje" v={to.length} />
        <Stat c="#e69500" l="Retirado hoje" v={R(to.reduce((s, o) => s + o.total, 0))} />
        <Stat c="#2e9b4e" l="Total do mês" v={R(mo.reduce((s, o) => s + o.total, 0))} />
        <Stat c="#2b1810" l="Pessoas no mês" v={new Set(mo.map((o) => o.phone)).size} />
      </div>

      {/* CARD: ARMAZENAMENTO DO BANCO. % = tamanho do banco ÷ 1 GB (limite do plano gratuito da Neon). */}
      {du && (() => {
        const pct = du.bytes / du.limit * 100, MB = (b) => (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
        const cor = pct < 70 ? 'bg-success' : pct < 90 ? 'bg-warning' : 'bg-danger';
        return (
          <div className="card p-3 mb-3">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h3 className="h5 mb-0">💾 Armazenamento do banco: {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</h3>
              <button className="btn btn-sm btn-outline-primary" onClick={loadUsage}>Atualizar</button>
            </div>
            <div className="progress my-2" style={{ height: 18 }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100">
              <div className={'progress-bar ' + cor} style={{ width: Math.max(pct, 1) + '%' }} />
            </div>
            <small className="text-secondary">{MB(du.bytes)} de {MB(du.limit)} (limite do plano gratuito). {du.tables.map((t) => `${t.nome}: ${MB(t.bytes)}`).join(' · ')}</small>
            <small className="text-secondary d-block">Este valor mostra o espaço dos dados. A transferência mensal da Neon (5 GB no plano gratuito) é medida só no painel da Neon.</small>
          </div>
        );
      })()}

      {/* CARD: usuários cadastrados, separados por equipe. Atualiza sozinho (mesma consulta de 4s dos pedidos). "Gasto no mês" vem da soma dos pedidos do mês atual (gastoMes). */}
      <div className="card p-3 mb-3">
        <h3 className="h5">👥 Usuários cadastrados ({users.length}){users.some((x) => !x.hb) && <span className="badge text-bg-warning ms-2 fs-6">🎂 {users.filter((x) => !x.hb).length} sem data de nascimento</span>}</h3>
        <p className="text-secondary small">Lista atualizada automaticamente e separada por equipe. O valor ao lado de cada nome é o gasto no mês atual.</p>
        <div className="row g-3">
          {TEAMS.map((t) => {
            const lista = users.filter((x) => x.team === t); /* só quem é desta equipe */
            return (
              <div className="col-12 col-md-6 col-xl-4" key={t}>
                <div className="border rounded-3 h-100 p-2">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="badge team fs-6">{t}</span>
                    <small className="text-secondary">{lista.length} pessoa(s) · {R(lista.reduce((s, x) => s + (gastoMes[x.phone] || 0), 0))}</small>
                  </div>
                  {lista.map((x) => (
                    <div key={x.phone} className="d-flex justify-content-between gap-2 border-top py-1 small">
                      <span>{x.name}<br /><span className="text-secondary">{x.phone} · desde {dt(x.ts)}</span>{!x.hb && <span className="badge text-bg-warning ms-1" title="Ainda não cadastrou a data de nascimento">🎂 sem data</span>}</span>
                      <b>{R(gastoMes[x.phone] || 0)}</b>
                    </div>
                  ))}
                  {!lista.length && <p className="text-secondary small mb-0">Ninguém cadastrado.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CARD: pedidos em tempo real (tabela com todos os pedidos, mais recentes primeiro) */}
      <div className="card p-3 mb-3">
        <h3 className="h5">📋 Pedidos em tempo real</h3>
        <p className="text-secondary small">Cada compra feita em qualquer aparelho aparece aqui sozinha (atualiza a cada 15 segundos). Use o ✕ ao lado de um item para removê-lo do pedido.</p>
        <div className="table-responsive"><table className="table table-sm table-striped align-middle">
          <thead className="table-danger"><tr><th>Dia</th><th>Hora</th><th>Equipe</th><th>Nome</th><th>Contato</th><th>Itens</th><th>Total</th><th /></tr></thead>
          <tbody>{orders.slice(0, 60).map((o) => (
            <tr key={o.id}><td>{dt(o.ts)}</td><td>{hr(o.ts)}</td><td><span className="badge team">{o.team}</span></td><td>{o.name}</td><td>{o.phone}</td>
              {/* Cada item tem um ✕ para removê-lo do pedido (o total é recalculado; sem itens, o pedido some). */}
              <td>{o.items.map((i, k) => <span key={k} className="badge text-bg-light border me-1 mb-1 d-inline-flex align-items-center gap-1">{i.q}x {i.n}<button type="button" className="btn-close" style={{ fontSize: '.55rem' }} aria-label={'Remover ' + i.n} title="Remover este item" onClick={() => removeItem(o, k)} /></span>)}</td>
              <td className="fw-bold text-danger">{R(o.total)}</td>
              <td><button className="btn btn-sm btn-outline-primary" onClick={() => confirm('Excluir este pedido?') && run(async () => { await call('deleteOrder', { id: o.id }, true); await reloadOrders(); })}>Excluir</button></td></tr>
          ))}{!orders.length && <tr><td colSpan="8">Nenhum pedido ainda.</td></tr>}</tbody>
        </table></div>
      </div>

      {/* CARD: ALMOÇO DA SEMANA (prato e preço por dia). */}
      <div className="card p-3 mb-3">
        <h3 className="h5">🍽️ Almoço da semana (segunda a sexta)</h3>
        <div className="row g-3">{DAYS.map(([k, n]) => (
          <div className="col-12 col-md-6 col-xl-4" key={k}>
            <label className="form-label fw-bold">{n}</label>
            <input className="form-control mb-2" placeholder="Nome do prato" value={wk[k].name} onChange={(e) => setWk({ ...wk, [k]: { ...wk[k], name: e.target.value } })} />
            <input className="form-control mb-2" placeholder="Preço (ex: 18,00)" value={wk[k].price} onChange={(e) => setWk({ ...wk, [k]: { ...wk[k], price: e.target.value } })} />
          </div>))}</div>
        <div className="d-flex gap-2 mt-3 flex-wrap">
          <button className="btn btn-primary" onClick={saveWeek}>Salvar cardápio da semana</button>
          <button className="btn btn-outline-primary" onClick={() => confirm('Limpar todos os pratos?') && run(async () => { await call('saveWeek', { days: {} }, true); setWk(Object.fromEntries(DAYS.map(([k]) => [k, { name: '', price: '' }]))); await reload(); }, 'Semana limpa.')}>Limpar semana</button>
        </div>
      </div>

      {/* LINHA COM DOIS CARDS: novo produto (esquerda) e remover produto (direita). */}
      <div className="row g-3 mb-3">
        {/* CARD: NOVO PRODUTO. */}
        <div className="col-12 col-lg-6"><div className="card p-3 h-100">
          <h3 className="h5">➕ Novo produto</h3>
          <label className="form-label fw-bold">Categoria</label>
          <select className="form-select mb-2" value={np.cat} onChange={(e) => setNp({ ...np, cat: e.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v[0]} {v[1]}</option>)}</select>
          <label className="form-label fw-bold">Nome</label><input className="form-control mb-2" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <label className="form-label fw-bold">Valor</label><input className="form-control mb-2" placeholder="ex: 4,50" value={np.price} onChange={(e) => setNp({ ...np, price: e.target.value })} />
          <button className="btn btn-primary" onClick={addProduct}>Publicar produto</button>
        </div></div>
        {/* CARD: REMOVER PRODUTO (lista da categoria escolhida; apaga de verdade no banco). */}
        <div className="col-12 col-lg-6"><div className="card p-3 h-100">
          <h3 className="h5">🗑️ Remover produto</h3>
          <p className="text-secondary small">Apaga o produto da loja de todos os usuários (os pedidos antigos continuam no histórico).</p>
          <select className="form-select mb-2" value={rc} onChange={(e) => setRc(e.target.value)}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v[0]} {v[1]}</option>)}</select>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {prods.filter((p) => p.cat === rc).map((p) => (
              <div key={p.id} className="d-flex align-items-center gap-2 border-bottom py-2">
                <span className="flex-grow-1">{p.name} · {R(p.price)}</span><button className="btn btn-sm btn-outline-danger" onClick={() => remove(p)}>Remover</button>
              </div>))}
            {!prods.some((p) => p.cat === rc) && <p className="text-secondary">Nenhum produto nesta categoria.</p>}
          </div>
        </div></div>
      </div>

      {/* CARD: FECHAMENTO MENSAL (PDF, CSV e limpeza do mês). */}
      <div className="card p-3 mb-3">
        <h3 className="h5">📜 Fechamento mensal (todo dia 1)</h3>
        <label className="form-label fw-bold">Mês a fechar</label>
        <input type="month" className="form-control mb-3" style={{ maxWidth: 240 }} value={fm} onChange={(e) => setFm(e.target.value)} />
        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-success" onClick={() => makePdf(orders, fm) || notify('Sem pedidos neste mês.')}>Gerar PDF do fechamento</button>
          <button className="btn btn-outline-primary" onClick={() => makeCsv(orders, fm)}>Baixar planilha (CSV)</button>
          <button className="btn btn-outline-danger" onClick={clearMonth}>Limpar pedidos deste mês</button>
        </div>
      </div>

      {/* CARD: LOGIN E SENHA DA ADMINISTRAÇÃO. */}
      <div className="card p-3 mb-3">
        <h3 className="h5">🔑 Alterar login e senha da administração</h3>
        <div className="row g-2">
          <div className="col-12 col-md-6"><label className="form-label fw-bold">Novo login</label><input className="form-control" value={cred.login} onChange={(e) => setCred({ ...cred, login: e.target.value })} /></div>
          <div className="col-12 col-md-6"><label className="form-label fw-bold">Nova senha (mín. 6)</label><input className="form-control" type="password" value={cred.password} onChange={(e) => setCred({ ...cred, password: e.target.value })} /></div>
        </div>
        <div className="d-flex gap-2 mt-3 flex-wrap">
          <button className="btn btn-primary" onClick={() => run(() => call('setAdmin', cred, true).then(() => setCred({ login: '', password: '' })), 'Novo acesso salvo.')}>Salvar novo acesso</button>
          <button className="btn btn-outline-primary" onClick={onExit}>Sair da administração</button>
        </div>
      </div>
    </>
  );
}
