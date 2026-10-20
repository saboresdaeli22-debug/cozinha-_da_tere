/* main.jsx — Ponto de entrada do React: liga o componente App à <div id="root"> do index.html. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
/* CSS do Bootstrap 5 (grade, botões, formulários, tabelas, menu). Vem ANTES do styles.css para o nosso tema poder sobrescrever. */
import 'bootstrap/dist/css/bootstrap.min.css';
/* Nosso tema (cores da Cozinha da Tere). */
import './styles.css';
/* Desenha o aplicativo na página. */
createRoot(document.getElementById('root')).render(<App />);
