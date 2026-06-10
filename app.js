const PATHS = {
  index: "data/players_index.json",
  teams: "data/teams.json",
  config: "data/app_config.json",
  results: "data/real_results.json",
  scoring: "data/scoring_rules.json",
};
const DEFAULT_CONFIG = {
  mode: "testing",
  title: "Polla Mundial 2026",
  prediction_lock: {
    enabled: true,
    date: "2026-06-11",
    time: "10:00",
    timezone: "America/Santiago",
    label: "Jueves 11 de junio de 2026, 10:00 hrs Chile",
  },
};
const GROUPS = "ABCDEFGHIJKL".split("");
const PHASE_LABELS = {
  round_of_32: "Dieciseisavos",
  round_of_16: "Octavos",
  quarter_finals: "Cuartos",
  semi_finals: "Semifinales",
  third_place: "Tercer lugar",
  final: "Final",
};
const AWARD_LABELS = {
  golden_boot: "Bota de Oro",
  silver_boot: "Bota de Plata",
  bronze_boot: "Bota de Bronce",
  golden_ball: "Balón de Oro",
  silver_ball: "Balón de Plata",
  bronze_ball: "Balón de Bronce",
};

const state = {
  index: [],
  players: [],
  teams: {},
  config: null,
  realResults: { schema_version: 1, status: "unavailable", matches: [] },
  fixtureAvailable: false,
  scoringRules: null,
  scoringAvailable: false,
  controlWarnings: [],
  scoringWarnings: [],
  leaderboard: [],
  errors: [],
  selected: {
    groups: "",
    knockout: "",
    group: "A",
    fixturePhase: "all",
    fixtureGroup: "all",
    fixtureStatus: "all",
  },
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status} al cargar ${path}`);
  return response.json();
}

async function loadPlayersIndex() {
  const data = await loadJson(PATHS.index);
  const players = Array.isArray(data) ? data : data.players;
  if (!Array.isArray(players)) throw new Error("players_index.json no contiene una lista válida.");
  state.index = players;
  return state.index;
}

async function loadPlayers() {
  const results = await Promise.allSettled(state.index.map(async (entry) => {
    const path = entry.file
      ? entry.file.startsWith("data/") ? entry.file : `data/${entry.file}`
      : `data/players/${entry.id}.json`;
    const player = await loadJson(path);
    if (!player.player?.id || !player.player?.name) throw new Error(`${path} no contiene un jugador válido.`);
    return { ...player, index: entry };
  }));
  results.forEach((result, index) => {
    if (result.status === "fulfilled") state.players.push(result.value);
    else state.errors.push(`${state.index[index]?.name ?? "Jugador"}: ${result.reason.message}`);
  });
  return state.players;
}

async function loadTeams() {
  try {
    state.teams = await loadJson(PATHS.teams);
  } catch (error) {
    state.errors.push(`Banderas: ${error.message}`);
    state.teams = {};
  }
  return state.teams;
}

async function loadConfig() {
  try {
    state.config = await loadJson(PATHS.config);
  } catch {
    state.config = null;
  }
  return state.config;
}

async function loadRealResults() {
  try {
    const data = await loadJson(PATHS.results);
    if (!Array.isArray(data.matches)) throw new Error("real_results.json no contiene una lista de partidos.");
    state.realResults = data;
    state.fixtureAvailable = true;
  } catch {
    state.realResults = { schema_version: 1, status: "unavailable", matches: [] };
    state.fixtureAvailable = false;
  }
  return state.realResults;
}

async function loadScoringRules() {
  try {
    const data = await loadJson(PATHS.scoring);
    if (!data.match_points) throw new Error("scoring_rules.json no contiene match_points.");
    state.scoringRules = data;
    state.scoringAvailable = true;
  } catch {
    state.scoringRules = null;
    state.scoringAvailable = false;
  }
  return state.scoringRules;
}

async function init() {
  setupNavigation();
  try {
    await loadPlayersIndex();
    await Promise.all([loadPlayers(), loadTeams(), loadConfig(), loadRealResults(), loadScoringRules()]);
    if (state.players.length) {
      state.selected.groups = state.players[0].player.id;
      state.selected.knockout = state.players[0].player.id;
    }
    renderAll();
    if (state.errors.length) {
      showError(`Carga parcial: ${state.errors.join(" | ")}`);
      setStatus(`${state.players.length} jugadores · carga parcial`, "is-error");
    } else {
      setStatus(`${state.players.length} jugadores cargados`, "is-ready");
    }
  } catch (error) {
    showError(`No se pudieron cargar los datos. Usa un servidor local. Detalle: ${error.message}`);
    setStatus("Error de carga", "is-error");
  }
}

function setupNavigation() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => openView(tab.dataset.view)));
}

function openView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.view === viewName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${viewName}`));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll() {
  state.controlWarnings = collectControlWarnings();
  state.scoringWarnings = [];
  state.leaderboard = calculateLeaderboard();
  renderSelectors();
  renderDashboard();
  renderRanking();
  renderPlayers();
  renderGroupStage();
  renderKnockout();
  renderFixture();
  renderRules();
  renderAwards();
  renderAudit();
  renderWarnings();
}

function renderDashboard() {
  const totalWarnings = state.controlWarnings.length + state.scoringWarnings.length
    + state.players.reduce((sum, player) => sum + getPlayerWarnings(player).length, 0);
  const counts = state.players.map(countPredictions);
  const latest = state.players.map((player) => player.source?.generated_at).filter(Boolean).sort().at(-1);
  document.querySelector("#dashboard-lock-notice").innerHTML = renderLockNotice(false);
  document.querySelector("#dashboard-metrics").innerHTML = [
    metricCard("Jugadores", state.players.length, "Participantes cargados"),
    metricCard("Partidos por jugador", counts.length ? Math.max(...counts) : 0, "Pronósticos disponibles"),
    metricCard("Warnings", totalWarnings, "Avisos de validación"),
    metricCard("Última actualización", formatDate(latest), "Desde source.generated_at", true),
  ].join("");
  const rows = state.players.map((player) => `
    <tr><td><strong>${escapeHtml(player.player.name)}</strong></td>
    <td class="number-cell">${countPredictions(player)}</td>
    <td>${warningBadge(getPlayerWarnings(player).length)}</td>
    <td>${renderTeamName(player.honor_roll?.champion)}</td>
    <td>${escapeHtml(formatDate(player.source?.generated_at))}</td></tr>`).join("");
  document.querySelector("#dashboard-players").innerHTML = table(
    ["Jugador", "Partidos", "Warnings", "Campeón pronosticado", "Actualizado"], rows,
  );
}

function renderRanking() {
  document.querySelector("#ranking-lock-notice").innerHTML = renderLockNotice(true);
  const rows = state.leaderboard.map((entry, index) => `
    <tr><td class="rank-cell">${index + 1}</td><td><strong>${escapeHtml(entry.name)}</strong></td>
    <td class="points-cell">${entry.points}</td><td class="number-cell">${entry.scoredMatches}</td>
    <td class="number-cell">${entry.exactScores}</td><td>${renderTeamName(entry.champion)}</td>
    <td>${warningBadge(entry.warnings)}</td></tr>`).join("");
  document.querySelector("#ranking-content").innerHTML = table(
    ["Posición", "Jugador", "Puntos", "Partidos puntuados", "Exactos", "Campeón pronosticado", "Warnings"], rows,
  );
}

function calculateLeaderboard() {
  state.scoringWarnings = [];
  return state.players.map((player) => calculatePlayerScore(
    player,
    state.realResults,
    state.scoringRules,
  )).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "es"));
}

function renderPlayers() {
  document.querySelector("#player-cards").innerHTML = state.players.map((player) => `
    <article class="player-card">
      <header class="player-card-header"><div><p class="card-kicker">Participante</p><h3>${escapeHtml(player.player.name)}</h3></div>
      ${warningBadge(getPlayerWarnings(player).length)}</header>
      <div class="player-card-body">
        <div class="honor-grid">
          ${honorItem("Campeón", player.honor_roll?.champion)}
          ${honorItem("Subcampeón", player.honor_roll?.runner_up)}
          ${honorItem("Tercer lugar", player.honor_roll?.third_place)}
        </div>
        <div class="award-columns">
          ${awardGroup("Botas", ["golden_boot", "silver_boot", "bronze_boot"], player.awards)}
          ${awardGroup("Balones", ["golden_ball", "silver_ball", "bronze_ball"], player.awards)}
        </div>
        <button class="button button-primary" data-show-player="${escapeHtml(player.player.id)}">Ver predicciones</button>
      </div>
    </article>`).join("");
  document.querySelectorAll("[data-show-player]").forEach((button) => button.addEventListener("click", () => {
    state.selected.groups = button.dataset.showPlayer;
    document.querySelector('[data-player-select="groups"]').value = state.selected.groups;
    renderGroupStage();
    openView("groups");
  }));
}

function renderGroupStage() {
  const player = getPlayer(state.selected.groups);
  const matches = (player?.predictions?.group_stage ?? []).filter((match) => match.group === state.selected.group);
  const rows = matches.map((match) => `
    <tr><td><span class="badge">Grupo ${escapeHtml(match.group)}</span></td>
    <td>${renderMatchTeams(match)}</td><td><span class="score">${escapeHtml(formatScore(match))}</span></td>
    <td><span class="outcome">${escapeHtml(match.outcome || "—")}</span></td></tr>`).join("");
  document.querySelector("#groups-content").innerHTML = matches.length
    ? `<div class="panel">${table(["Grupo", "Partido", "Marcador pronosticado", "Resultado"], rows)}</div>`
    : emptyState("No hay partidos para este grupo.");
}

function renderKnockout() {
  const player = getPlayer(state.selected.knockout);
  document.querySelector("#knockout-content").innerHTML = Object.entries(PHASE_LABELS).map(([phase, label], index) => {
    const matches = player?.predictions?.[phase] ?? [];
    return `<details class="phase-section" ${index === 0 ? "open" : ""}>
      <summary><span>${label}</span><span class="phase-count">${matches.length} partidos</span></summary>
      <div class="match-list">${matches.length ? matches.map(renderMatch).join("") : emptyState("Sin pronósticos.")}</div>
    </details>`;
  }).join("");
}

function renderFixture() {
  const content = document.querySelector("#fixture-content");
  const summary = document.querySelector("#fixture-summary");
  if (!state.fixtureAvailable) {
    summary.innerHTML = "";
    content.innerHTML = emptyState("Fixture de control no disponible");
    return;
  }

  const matches = getFilteredFixtureMatches();
  const finished = state.realResults.matches.filter((match) => match.status === "finished").length;
  summary.innerHTML = `<div class="fixture-summary">
    <span class="badge">${state.realResults.matches.length} partidos</span>
    <span class="badge badge-success">${finished} finalizados</span>
    <span class="badge ${state.controlWarnings.length ? "badge-warning" : "badge-success"}">${state.controlWarnings.length} warnings de control</span>
    <span class="muted">Actualizado: ${escapeHtml(formatDate(state.realResults.updated_at))}</span>
  </div>`;

  if (!matches.length) {
    content.innerHTML = emptyState("No hay partidos para los filtros seleccionados.");
    return;
  }

  const rows = matches.map((match) => `
    <tr><td class="number-cell">${escapeHtml(match.match_id)}</td><td>${escapeHtml(formatFixtureDate(match))}</td>
    <td>${escapeHtml(phaseLabel(match.phase))}</td><td>${escapeHtml(match.group || "—")}</td>
    <td>${renderTeamName(match.home_team)}</td><td>${renderTeamName(match.away_team)}</td>
    <td><span class="score">${escapeHtml(formatRealScore(match))}</span></td>
    <td>${escapeHtml(formatRealPenalties(match))}</td><td>${statusBadge(match.status)}</td>
    <td>${controlLabel(match)}</td></tr>`).join("");
  const cards = matches.map((match) => `
    <article class="fixture-card">
      <div class="fixture-card-head"><span>#${escapeHtml(match.match_id)} · ${escapeHtml(phaseLabel(match.phase))}${match.group ? ` · Grupo ${escapeHtml(match.group)}` : ""}</span>${statusBadge(match.status)}</div>
      <div class="fixture-card-teams">${renderTeamName(match.home_team)}${renderTeamName(match.away_team)}</div>
      <div class="fixture-card-result"><span class="muted">${escapeHtml(formatFixtureDate(match))} · ${controlLabel(match)}</span><strong>${escapeHtml(formatRealScore(match))}${formatRealPenalties(match) !== "—" ? ` · pen. ${escapeHtml(formatRealPenalties(match))}` : ""}</strong></div>
    </article>`).join("");
  content.innerHTML = `<div class="panel fixture-table">${table(
    ["ID", "Fecha", "Fase", "Grupo", "Local", "Visita", "Resultado", "Penales", "Estado", "Control"],
    rows,
  )}</div><div class="fixture-cards">${cards}</div>`;
}

function renderRules() {
  const content = document.querySelector("#rules-content");
  if (!state.scoringAvailable) {
    content.innerHTML = emptyState("Reglas de puntuación no disponibles");
    return;
  }
  const rows = Object.entries(state.scoringRules.match_points).map(([phase, rules]) => `
    <tr><td><strong>${escapeHtml(phaseLabel(phase))}</strong></td>
    <td>${escapeHtml(rules.outcome ?? "—")}</td><td>${escapeHtml(rules.goal_difference ?? "—")}</td>
    <td>${escapeHtml(rules.exact_score ?? "—")}</td><td>${escapeHtml(rules.qualified_team ?? "—")}</td></tr>`).join("");
  content.innerHTML = `<div class="rules-grid">
    <div class="panel">${table(["Fase", "Signo 1X2", "Diferencia", "Marcador exacto", "Clasificado"], rows)}</div>
    <div class="rules-copy">
      <div class="message message-info">Los puntos son acumulativos: signo 1X2, diferencia de gol y marcador exacto se suman cuando corresponden.</div>
      <div class="message message-info">En eliminatorias, el clasificado correcto suma puntos adicionales.</div>
      <div class="message message-info">Los penales no otorgan puntos por marcador exacto. Solo se usan para determinar qué equipo clasificó.</div>
    </div>
  </div>`;
}

function renderAwards() {
  const rows = Object.entries(AWARD_LABELS).map(([key, label]) => `
    <tr><td><strong>${label}</strong></td>${state.players.map((player) => `<td>${escapeHtml(player.awards?.[key] || "Sin definir")}</td>`).join("")}</tr>`).join("");
  document.querySelector("#awards-content").innerHTML = table(["Premio", ...state.players.map((player) => player.player.name)], rows);
}

function renderAudit() {
  document.querySelector("#audit-content").innerHTML = state.players.map((player) => {
    const path = `pdf/${player.player.id}.pdf`;
    return `<article class="audit-card"><div><p class="card-kicker">PDF esperado</p><h3>${escapeHtml(player.player.name)}</h3>
      <p class="muted">Fuente: ${escapeHtml(player.source?.file || "Excel no identificado")}</p></div>
      <a class="button button-secondary" href="${escapeHtml(path)}" target="_blank" rel="noopener">Abrir PDF esperado</a></article>`;
  }).join("");
}

function renderWarnings() {
  const controlCard = `<article class="warning-card"><div class="warning-heading"><h3>Warnings de control</h3>${warningBadge(state.controlWarnings.length)}</div>
    ${state.controlWarnings.length ? `<ul class="warning-list">${state.controlWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : emptyState("Sin warnings")}</article>`;
  const scoringCard = `<article class="warning-card"><div class="warning-heading"><h3>Warnings de scoring</h3>${warningBadge(state.scoringWarnings.length)}</div>
    ${state.scoringWarnings.length ? `<ul class="warning-list">${state.scoringWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : emptyState("Sin warnings")}</article>`;
  document.querySelector("#warnings-content").innerHTML = controlCard + scoringCard + state.players.map((player) => {
    const warnings = getPlayerWarnings(player);
    return `<article class="warning-card"><div class="warning-heading"><h3>Jugador: ${escapeHtml(player.player.name)}</h3>${warningBadge(warnings.length)}</div>
      ${warnings.length ? `<ul class="warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : emptyState("Sin warnings")}</article>`;
  }).join("");
}

function renderTeamName(teamName) {
  if (!teamName) return '<span class="muted">Sin definir</span>';
  const team = state.teams[teamName];
  if (!team?.flag) return `<span class="team-name"><span class="team-label">${escapeHtml(teamName)}</span></span>`;
  return `<span class="team-name"><img class="team-flag" src="${escapeHtml(team.flag)}" alt="" loading="lazy" onload="this.classList.add('is-loaded')" onerror="this.remove()"><span class="team-label">${escapeHtml(teamName)}</span></span>`;
}

function renderMatch(match) {
  return `<article class="match-card"><div class="match-teams">${renderMatchTeams(match)}</div>
    <div class="match-result"><span class="score">${escapeHtml(formatScore(match))}</span><span class="outcome">${escapeHtml(match.outcome || "—")}</span></div></article>`;
}

function renderMatchTeams(match) {
  return `<span class="versus">${renderTeamName(match.home_team)}<span class="versus-mark">vs</span>${renderTeamName(match.away_team)}</span>`;
}

function renderSelectors() {
  if (!state.players.length) {
    document.querySelectorAll("[data-player-select]").forEach((select) => {
      select.innerHTML = '<option value="">Sin jugadores</option>';
      select.disabled = true;
    });
    document.querySelector("#group-select").innerHTML = GROUPS.map((group) => `<option value="${group}">Grupo ${group}</option>`).join("");
    renderFixtureSelectors();
    return;
  }
  document.querySelectorAll("[data-player-select]").forEach((select) => {
    const context = select.dataset.playerSelect;
    select.innerHTML = state.players.map((player) => `<option value="${escapeHtml(player.player.id)}">${escapeHtml(player.player.name)}</option>`).join("");
    select.value = state.selected[context];
    select.addEventListener("change", () => {
      state.selected[context] = select.value;
      context === "groups" ? renderGroupStage() : renderKnockout();
    });
  });
  const groupSelect = document.querySelector("#group-select");
  groupSelect.innerHTML = GROUPS.map((group) => `<option value="${group}">Grupo ${group}</option>`).join("");
  groupSelect.value = state.selected.group;
  groupSelect.addEventListener("change", () => { state.selected.group = groupSelect.value; renderGroupStage(); });
  renderFixtureSelectors();
}

function renderFixtureSelectors() {
  const phaseSelect = document.querySelector("#fixture-phase-filter");
  const groupFilter = document.querySelector("#fixture-group-filter");
  const statusSelect = document.querySelector("#fixture-status-filter");
  phaseSelect.innerHTML = `<option value="all">Todas las fases</option>${["group_stage", ...Object.keys(PHASE_LABELS)].map((phase) => `<option value="${phase}">${escapeHtml(phaseLabel(phase))}</option>`).join("")}`;
  groupFilter.innerHTML = `<option value="all">Todos los grupos</option>${GROUPS.map((group) => `<option value="${group}">Grupo ${group}</option>`).join("")}`;
  statusSelect.innerHTML = `<option value="all">Todos los estados</option>${["scheduled", "live", "finished", "postponed"].map((status) => `<option value="${status}">${escapeHtml(statusLabel(status))}</option>`).join("")}`;
  phaseSelect.value = state.selected.fixturePhase;
  groupFilter.value = state.selected.fixtureGroup;
  statusSelect.value = state.selected.fixtureStatus;
  [phaseSelect, groupFilter, statusSelect].forEach((select) => select.addEventListener("change", () => {
    state.selected.fixturePhase = phaseSelect.value;
    state.selected.fixtureGroup = groupFilter.value;
    state.selected.fixtureStatus = statusSelect.value;
    renderFixture();
  }));
}

function countPredictions(player) {
  return Object.values(player.predictions ?? {}).reduce((sum, matches) => sum + (Array.isArray(matches) ? matches.length : 0), 0);
}

function getPlayerWarnings(player) {
  return Array.isArray(player.warnings) ? player.warnings : [];
}

function normalizeTeamName(teamName) {
  return String(teamName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

function compareTeams(a, b) {
  return normalizeTeamName(a) === normalizeTeamName(b);
}

function buildMatchKey(match) {
  return `${match.phase}|${normalizeTeamName(match.home_team)}|${normalizeTeamName(match.away_team)}`;
}

function deriveMatchKey(match) {
  return `${match.phase}|${match.home_team}|${match.away_team}`;
}

function predictionMap(player) {
  const predictions = { exact: new Map(), normalized: new Map() };
  Object.entries(player.predictions ?? {}).forEach(([phase, matches]) => {
    (matches ?? []).forEach((prediction) => {
      const normalized = { ...prediction, phase };
      predictions.exact.set(prediction.match_key || deriveMatchKey(normalized), normalized);
      predictions.normalized.set(buildMatchKey(normalized), normalized);
    });
  });
  return predictions;
}

function findPrediction(predictions, realMatch) {
  const exactKey = realMatch.match_key || deriveMatchKey(realMatch);
  return predictions.exact.get(exactKey) || predictions.normalized.get(buildMatchKey(realMatch));
}

function calculatePlayerScore(player, realResults, scoringRules) {
  const predictions = predictionMap(player);
  const result = {
    id: player.player.id,
    name: player.player.name,
    points: 0,
    scoredMatches: 0,
    exactScores: 0,
    champion: player.honor_roll?.champion,
    warnings: getPlayerWarnings(player).length,
  };
  if (!realResults?.matches?.length || !scoringRules?.match_points) return result;

  realResults.matches.filter((match) => match.status === "finished").forEach((realMatch) => {
    const prediction = findPrediction(predictions, realMatch);
    if (!prediction) {
      state.scoringWarnings.push(
        `${player.player.name}: no se encuentra predicción para ${realMatch.match_key || deriveMatchKey(realMatch)}.`,
      );
      result.warnings += 1;
      return;
    }
    const score = calculateMatchPoints(prediction, realMatch, scoringRules);
    result.points += score.points;
    if (hasScore(realMatch)) result.scoredMatches += 1;
    if (score.details.exact_score) result.exactScores += 1;
    score.warnings.forEach((warning) => {
      state.scoringWarnings.push(`${player.player.name}: ${warning}`);
      result.warnings += 1;
    });
  });
  return result;
}

function calculateMatchPoints(prediction, realMatch, scoringRules) {
  const result = {
    points: 0,
    details: {
      exact_score: false,
      outcome: false,
      goal_difference: false,
      qualified_team: false,
    },
    warnings: [],
  };
  if (realMatch.status !== "finished") return result;
  if (!hasScore(realMatch)) {
    result.warnings.push(`Partido #${realMatch.match_id}: finalizado sin goles válidos.`);
    return result;
  }
  const rules = scoringRules?.match_points?.[realMatch.phase];
  if (!rules) {
    result.warnings.push(`Partido #${realMatch.match_id}: fase sin reglas de scoring (${realMatch.phase}).`);
    return result;
  }

  const outcomeCorrect = getMatchOutcome(prediction) === getMatchOutcome(realMatch);
  if (outcomeCorrect) {
    result.details.outcome = true;
    result.points += rules.outcome ?? 0;
  }
  if (getGoalDifference(prediction) === getGoalDifference(realMatch)) {
    result.details.goal_difference = true;
    result.points += rules.goal_difference ?? 0;
  }
  if (
    prediction.home_score === realMatch.home_score
    && prediction.away_score === realMatch.away_score
  ) {
    result.details.exact_score = true;
    result.points += rules.exact_score ?? 0;
  }

  if (realMatch.phase !== "group_stage") {
    const realQualified = getQualifiedTeam(realMatch);
    const predictedQualified = getQualifiedTeam(prediction);
    if (!realQualified) {
      result.warnings.push(`Partido #${realMatch.match_id}: no se puede determinar clasificado.`);
    } else if (predictedQualified && compareTeams(predictedQualified, realQualified)) {
      result.details.qualified_team = true;
      result.points += rules.qualified_team ?? 0;
    }
  }
  return result;
}

function getMatchOutcome(match) {
  if (!hasScore(match)) return null;
  if (match.home_score > match.away_score) return "1";
  if (match.away_score > match.home_score) return "2";
  return "X";
}

function getQualifiedTeam(match) {
  if (!match || match.phase === "group_stage" || !hasScore(match)) return null;
  if (match.home_score > match.away_score) return match.home_team;
  if (match.away_score > match.home_score) return match.away_team;
  if (!hasPenalties(match)) return null;
  if (match.home_penalties > match.away_penalties) return match.home_team;
  if (match.away_penalties > match.home_penalties) return match.away_team;
  return null;
}

function getGoalDifference(match) {
  return hasScore(match) ? match.home_score - match.away_score : null;
}

function collectControlWarnings() {
  if (!state.fixtureAvailable) return [];
  const warnings = [];
  state.realResults.matches.forEach((match) => {
    if (!match.match_key) {
      warnings.push(`Partido #${match.match_id}: partido real sin match_key.`);
    }
    if (match.status !== "finished") return;
    if (!hasScore(match)) {
      warnings.push(`Partido #${match.match_id}: estado finished sin goles.`);
    } else if (match.phase !== "group_stage" && match.home_score === match.away_score) {
      if (!hasPenalties(match)) {
        warnings.push(`Partido #${match.match_id}: eliminatoria empatada sin penales.`);
      } else if (match.home_penalties === match.away_penalties) {
        warnings.push(`Partido #${match.match_id}: penales empatados ${match.home_penalties}-${match.away_penalties}.`);
      }
    }
  });
  return warnings;
}

function getControlState(match) {
  if (match.status !== "finished") return { label: "Pendiente", className: "control-pending" };
  if (!hasScore(match)) return { label: "Revisar", className: "control-review" };
  if (
    match.phase !== "group_stage"
    && match.home_score === match.away_score
    && (!hasPenalties(match) || match.home_penalties === match.away_penalties)
  ) {
    return { label: "Revisar", className: "control-review" };
  }
  return { label: "Calcula", className: "control-ok" };
}

function controlLabel(match) {
  const control = getControlState(match);
  return `<span class="${control.className}">${control.label}</span>`;
}

function getFilteredFixtureMatches() {
  return state.realResults.matches.filter((match) =>
    (state.selected.fixturePhase === "all" || match.phase === state.selected.fixturePhase)
    && (state.selected.fixtureGroup === "all" || match.group === state.selected.fixtureGroup)
    && (state.selected.fixtureStatus === "all" || match.status === state.selected.fixtureStatus)
  );
}

function hasScore(match) {
  return Number.isInteger(match?.home_score) && Number.isInteger(match?.away_score);
}

function hasPenalties(match) {
  return Number.isInteger(match?.home_penalties) && Number.isInteger(match?.away_penalties);
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatFixtureDate(match) {
  if (!match.date) return "Por definir";
  const date = new Date(`${match.date}T${match.time || "00:00"}:00`);
  if (Number.isNaN(date.getTime())) return `${match.date}${match.time ? ` ${match.time}` : ""}`;
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    hour: match.time ? "2-digit" : undefined,
    minute: match.time ? "2-digit" : undefined,
  }).format(date);
}

function formatRealScore(match) {
  return hasScore(match) ? `${match.home_score}-${match.away_score}` : "Pendiente";
}

function formatRealPenalties(match) {
  return hasPenalties(match) ? `${match.home_penalties}-${match.away_penalties}` : "—";
}

function phaseLabel(phase) {
  return phase === "group_stage" ? "Fase de grupos" : (PHASE_LABELS[phase] || phase || "Sin fase");
}

function statusLabel(status) {
  return {
    scheduled: "Pendiente",
    live: "En juego",
    finished: "Finalizado",
    postponed: "Postergado",
    cancelled: "Cancelado",
  }[status] || status || "Sin estado";
}

function statusBadge(status) {
  return `<span class="badge status-${escapeHtml(status || "scheduled")}">${escapeHtml(statusLabel(status))}</span>`;
}

function formatScore(match) {
  if (!Number.isInteger(match.home_score) || !Number.isInteger(match.away_score)) return match.prediction_raw || "Sin interpretar";
  const penalties = match.penalties ? ` · pen. ${match.penalties.home_score}-${match.penalties.away_score}` : "";
  return `${match.home_score}-${match.away_score}${penalties}`;
}

function getPlayer(id) { return state.players.find((player) => player.player.id === id); }
function setStatus(text, type = "") { const el = document.querySelector("#load-status"); el.textContent = text; el.className = `status-pill ${type}`.trim(); }
function showError(message) { const el = document.querySelector("#global-error"); el.hidden = false; el.textContent = message; }
function warningBadge(count) { return `<span class="badge ${count ? "badge-warning" : "badge-success"}">${count} warning${count === 1 ? "" : "s"}</span>`; }
function metricCard(label, value, note, compact = false) { return `<article class="metric-card"><p class="metric-label">${label}</p><p class="metric-value ${compact ? "metric-value-compact" : ""}">${escapeHtml(value)}</p><p class="metric-note">${note}</p></article>`; }
function honorItem(label, team) { return `<div class="honor-item"><span>${label}</span><strong>${renderTeamName(team)}</strong></div>`; }
function awardGroup(title, keys, awards = {}) { return `<section class="award-group"><h4>${title}</h4>${keys.map((key) => `<div class="award-row"><span>${AWARD_LABELS[key]}</span><strong>${escapeHtml(awards?.[key] || "Sin definir")}</strong></div>`).join("")}</section>`; }
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`; }
function emptyState(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
function renderLockNotice(brief) {
  const lock = state.config?.prediction_lock;
  if (!lock) {
    return '<div class="message lock-notice lock-notice-brief">Los pronósticos quedarán congelados antes del inicio del Mundial. Luego solo se actualizarán resultados reales.</div>';
  }
  if (!lock.enabled) return "";
  const fullText = `Cierre de cambios: ${lock.label}. Después de ese horario los pronósticos quedan congelados y solo se actualizarán los resultados reales del Mundial.`;
  const briefText = `Cierre de cambios: ${lock.label}. Luego solo se actualizarán resultados reales.`;
  return `<div class="message lock-notice ${brief ? "lock-notice-brief" : ""}">${escapeHtml(brief ? briefText : fullText)}</div>`;
}

init();
