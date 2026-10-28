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

module.exports = { PEOPLE, ADMIN_IDS };
