"use strict";

// Fonte única das pessoas no backend (o frontend tem a sua cópia em public/index.html).
const PEOPLE = [
  { id: "pedro", name: "Pedro", role: "Custos" },
  { id: "jean", name: "Jean", role: "PCP" },
  { id: "haniel", name: "Haniel", role: "PCP" },
  { id: "gustavo", name: "Gustavo", role: "Qualidade" },
  { id: "bruna", name: "Bruna", role: "Projetos" }
];

const ADMIN_IDS = ["pedro"];

// Gestores: entram com login, acompanham tudo (só leitura) e mandam avisos.
// Não são "pessoas" da agenda: não marcam presença e não contam na semana liberada.
const MANAGERS = [
  { id: "leonardo", name: "Leonardo", role: "Gestor" }
];

module.exports = { PEOPLE, ADMIN_IDS, MANAGERS };
