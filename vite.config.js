/* vite.config.js — Configuração do Vite (ferramenta que compila o projeto: 'npm run build'). */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
/* Usa o plugin do React para entender JSX. A pasta api/ não passa pelo Vite: a Vercel a publica como funções do servidor. */
export default defineConfig({ plugins: [react()] });
