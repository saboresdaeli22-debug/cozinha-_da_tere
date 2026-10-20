/*
 * api/_lib.js — Peças compartilhadas da API: conexão com o banco Neon, criação das tabelas e login (JWT).
 * O prefixo '_' no nome impede a Vercel de tratar este arquivo como uma rota pública.
 */
import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

/* Endereço do banco. A Vercel cria DATABASE_URL ao conectar o Neon (aceita também POSTGRES_URL). */
const URL_DB = process.env.DATABASE_URL || process.env.POSTGRES_URL;
/* 'sql' executa consultas: sql`select * from users where phone=${x}` (os valores ${} vão protegidos contra SQL injection). */
export const sql = neon(URL_DB || 'postgresql://sem:sem@localhost/sem'); /* evita travar na carga; checkEnv() avisa o que falta */

/* Diz com clareza o que está faltando na Vercel */
/* Confere se as variáveis obrigatórias existem e explica o que fazer se faltar. */
export const checkEnv = () => {
  const falta = (m) => Object.assign(new Error(m), { status: 500 });
  if (!URL_DB) throw falta('Falta a variável DATABASE_URL: conecte o banco Neon ao projeto na Vercel e faça Redeploy.');
  if (!process.env.JWT_SECRET) throw falta('Falta a variável JWT_SECRET na Vercel: crie em Settings > Environment Variables e faça Redeploy.');
};
/* bcrypt criptografa senhas (uma via: não dá para recuperar a senha original). */
export { bcrypt };

/* Tabelas criadas automaticamente na primeira chamada (não precisa rodar SQL na mão) */
/* TABELAS DO BANCO. São criadas automaticamente na primeira chamada. Para adicionar uma coluna depois, rode 'alter table ... add column ...' no SQL Editor do Neon. */
const TABELAS = [
  /* users — um registro por pessoa. A chave é o telefone; 'hash' é a senha criptografada. */
  `create table if not exists users(phone text primary key, name text not null, team text not null, photo text default '', hash text not null, created_at timestamptz default now())`,
  /* products — produtos da loja. 'novo' = foi cadastrado pelo admin (mostra Novidade por 14 dias). */
  `create table if not exists products(id serial primary key, cat text not null, name text not null, price numeric(8,2) not null, photo text default '', novo boolean default false, created_at timestamptz default now())`,
  /* orders — cada pedido. 'items' é JSON com nome, preço e quantidade da época da compra (por isso o histórico não muda se o produto mudar). */
  `create table if not exists orders(id serial primary key, phone text not null, name text not null, team text not null, items jsonb not null, total numeric(10,2) not null, created_at timestamptz default now())`,
  /* week — pratos da semana (um por dia: seg, ter, qua, qui, sex). */
  `create table if not exists week(day text primary key, name text, price numeric(8,2), photo text default '')`,
  /* settings — configurações: login da administração e marca de que o catálogo inicial já foi carregado. */
  `create table if not exists settings(key text primary key, value jsonb)`,
];
/* Guarda a promessa de criação das tabelas: roda uma vez por instância do servidor. */
let pronto;
/* Cria as tabelas que ainda não existem (se já existem, não faz nada). */
export const ensure = () => (pronto ??= (async () => { for (const t of TABELAS) await sql.query(t); })());

/* Gera o token (crachá) assinado com JWT_SECRET. exp = validade (usuário 30 dias, admin 12 h). */
export const sign = (payload, exp = '30d') => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: exp });
/* Lê e valida o token enviado no cabeçalho Authorization. Retorna os dados dele ou null se inválido/expirado. */
export const who = (req) => {
  try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); }
  catch { return null; }
};
