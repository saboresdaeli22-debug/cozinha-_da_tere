/*
 * api/_catalog.js — Lista INICIAL de produtos, carregada no banco uma única vez.
 * Formato: 'Nome|preço' separados por vírgula, um bloco por categoria. Preço com ponto (1.5 = R$ 1,50).
 * Depois que o banco foi preenchido, mudanças aqui NÃO afetam a loja: use a administração (novo/remover produto).
 */
const raw={
/* Categoria Doces */
doces:"Pé de moça|2,Pé de moleque|1.5,Paçoca|.5,Jujuba|2,Pingo de leite|.5,Trento|3,Goiabinha|2.5,Bauducco|2,Roll|2.5,Amendoim|1,Barra de chocolate|8,Ana Maria|5,Fofura|4,Torcida|4,Pirulito de iogurte|1.5,Pirulitão|2,Ouro branco|2,Tortuguita|2,Halls|2,Trident|3,Mentos|3,Freegels|2.5,Chiclete Mentos|.5,Gamadinho|.15,Bala Juquinha|.15,Bala Fini|2",
/* Categoria Sobremesas */
sobremesas:"Mousse de maracujá|8,Pavê de maracujá|10,Mousse de Nutella|8,Pavê de Nutella|10,Bolo de pote|10,Delícia de morango|8,Delícia de abacaxi|8,Iogurte grego|4.5",
/* Categoria Lanches */
lanches:"Empadão de frango|16,Empadão de camarão|25,Mini pizza|3,Mini pizza de Nutella|5,Esfiha|3.5,Tapioca de mussarela|6,Tapioca de frango|8,Tapioca de carne seca|10,Tapioca de Nutella|10,Pão com ovo|4,Pão com ovo e queijo (1 ovo)|5,Pão com 2 ovos e queijo|6,Pão da Tatá (1 fatia)|5,Pão da Tatá (2 fatias)|6",
/* Categoria Bebidas */
bebidas:"Yopro|10,Kapo|4,Suco caixinha|4,Del Valle lata|5,Guaravita|2.2,Guaraviton|4.5,Matte|4.5,Cokinha|3.5,Guaraná pet|3.5,Pepsi pet|3.5,Água sem gás|2,Água com gás|3,Água saborizada|6,Coca lata|5,Guaraná lata|5,Fanta uva/laranja lata|5,Pepsi lata|5,Schweppes|5,H2O|6,Redbull|10,Monster|12,Coca 2 litros|13"};
/* Converte o texto acima em lista de objetos { cat, name, price } usada para preencher a tabela products. */
export const BASE=Object.entries(raw).flatMap(([cat,s])=>s.split(',').map(x=>{const[name,p]=x.split('|');return{cat,name,price:+p}}));
