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
  pdfAvailability: {},
  errors: [],
  selected: {
    groups: "",
    knockout: "",
    group: "all",
    groupOrder: "group",
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

async function fileExists(path) {
  try {
    const response = await fetch(path, { method: "HEAD", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function checkPdfExists(path) {
  return fileExists(path);
}

function getPlayerPdfPath(playerId) {
  return `pdf/${playerId}.pdf`;
}

async function loadPdfAvailability() {
  const entries = await Promise.all(state.players.map(async (player) => {
    const path = getPlayerPdfPath(player.player.id);
    return [player.player.id, { path, available: await checkPdfExists(path) }];
  }));
  state.pdfAvailability = Object.fromEntries(entries);
  return state.pdfAvailability;
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
    await loadPdfAvailability();
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
  renderAwards();
  renderAudit();
  renderWarnings();
}

function renderDashboard() {
  const totalWarnings = state.controlWarnings.length + state.scoringWarnings.length
    + state.players.reduce((sum, player) => sum + getPlayerWarnings(player).length, 0);
  const counts = state.players.map(countPredictions);
  const latest = state.players.map((player) => player.source?.generated_at).filter(Boolean).sort().at(-1);
  document.querySelector("#dashboard-metrics").innerHTML = [
    metricCard("Jugadores", state.players.length, "Participantes cargados"),
    metricCard("Partidos por jugador", counts.length ? Math.max(...counts) : 0, "Pronósticos disponibles"),
    metricCard("Avisos", totalWarnings, "Validaciones y pendientes"),
    metricCard("Última actualización", formatDate(latest), "Desde source.generated_at", true),
  ].join("");
  const rows = state.players.map((player) => {
    const leaderboardEntry = state.leaderboard.find((entry) => entry.id === player.player.id);
    return `<tr><td><strong>${escapeHtml(player.player.name)}</strong></td>
    <td class="points-cell">${leaderboardEntry?.points ?? 0}</td>
    <td class="number-cell">${countPredictions(player)}</td>
    <td>${warningBadge(getPlayerWarnings(player).length)}</td>
    <td>${renderTeamName(player.honor_roll?.champion)}</td>
    <td>${escapeHtml(formatDate(player.source?.generated_at))}</td></tr>`;
  }).join("");
  document.querySelector("#dashboard-players").innerHTML = table(
    ["Jugador", "Puntos", "Partidos", "Avisos", "Campeón pronosticado", "Actualizado"], rows,
  );
}

function renderRanking() {
  const rows = state.leaderboard.map((entry, index) => `
    <tr><td class="rank-cell">${index + 1}</td><td><strong>${escapeHtml(entry.name)}</strong></td>
    <td class="points-cell">${entry.points}</td><td class="number-cell">${entry.scoredMatches}</td>
    <td class="number-cell">${entry.exactScores}</td><td>${renderTeamName(entry.champion)}</td>
    <td>${warningBadge(entry.warnings)}</td></tr>`).join("");
  document.querySelector("#ranking-content").innerHTML = table(
    ["Posición", "Jugador", "Puntos", "Partidos puntuados", "Exactos", "Campeón pronosticado", "Avisos"], rows,
  );
}

function calculateLeaderboard() {
  state.scoringWarnings = [];
  const resolvedResults = { ...state.realResults, matches: resolveControlMatches(state.realResults) };
  return state.players.map((player) => calculatePlayerScore(
    player,
    resolvedResults,
    state.scoringRules,
  )).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "es"));
}

function renderPlayers() {
  document.querySelector("#player-cards").innerHTML = state.players.map((player) => {
    const pdf = state.pdfAvailability[player.player.id];
    return `
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
        <div class="player-actions">
          <button class="button button-primary" data-show-player="${escapeHtml(player.player.id)}">Ver predicciones</button>
          ${renderPdfAction(pdf)}
        </div>
      </div>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-show-player]").forEach((button) => button.addEventListener("click", () => {
    state.selected.groups = button.dataset.showPlayer;
    document.querySelector('[data-player-select="groups"]').value = state.selected.groups;
    renderGroupStage();
    openView("groups");
  }));
}

function renderGroupStage() {
  const player = getPlayer(state.selected.groups);
  const matches = (player?.predictions?.group_stage ?? [])
    .map(enrichPredictionWithRealMatchData)
    .filter((match) => state.selected.group === "all" || match.group === state.selected.group)
    .sort(state.selected.groupOrder === "date"
      ? compareMatchesByDate
      : (a, b) => String(a.group || "").localeCompare(String(b.group || ""), "es"));
  const rows = matches.map((match) => `
    <tr><td>${escapeHtml(formatGroupMatchDate(match))}</td><td>${escapeHtml(match.time || "Sin hora")}</td>
    <td><span class="badge">Grupo ${escapeHtml(match.group)}</span></td>
    <td>${renderMatchTeams(match)}</td><td><span class="score">${escapeHtml(formatScore(match))}</span></td>
    <td><span class="outcome">${escapeHtml(match.outcome || "—")}</span></td></tr>`).join("");
  const cards = matches.map((match) => `
    <article class="group-stage-card">
      <div class="group-stage-card-head">
        <span>${escapeHtml(formatGroupMatchDate(match))} · ${escapeHtml(match.time || "Sin hora")}</span>
        <span class="badge">Grupo ${escapeHtml(match.group)}</span>
      </div>
      <div class="group-stage-card-teams">${renderMatchTeams(match)}</div>
      <div class="group-stage-card-result">
        <span class="muted">Pronóstico</span>
        <span><span class="score">${escapeHtml(formatScore(match))}</span> <span class="outcome">${escapeHtml(match.outcome || "—")}</span></span>
      </div>
    </article>`).join("");
  document.querySelector("#groups-content").innerHTML = matches.length
    ? `<div class="panel group-stage-table">${table(["Fecha", "Hora", "Grupo", "Partido", "Pronóstico", "Resultado 1/X/2"], rows)}</div>
      <div class="group-stage-cards">${cards}</div>`
    : emptyState("No hay partidos para el filtro seleccionado.");
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
  const standings = document.querySelector("#fixture-standings");
  if (!state.fixtureAvailable) {
    summary.innerHTML = "";
    content.innerHTML = emptyState("Fixture de control no disponible");
    standings.innerHTML = emptyState("Clasificados calculados no disponibles");
    return;
  }

  const matches = getFilteredFixtureMatches();
  const finished = state.realResults.matches.filter((match) => match.status === "finished").length;
  summary.innerHTML = `<div class="fixture-summary">
    <span class="badge">${state.realResults.matches.length} partidos</span>
    <span class="badge badge-success">${finished} finalizados</span>
    <span class="badge ${state.controlWarnings.length ? "badge-warning" : "badge-success"}">${state.controlWarnings.length} avisos de control</span>
    <span class="muted">Actualizado: ${escapeHtml(formatDate(state.realResults.updated_at))}</span>
  </div>`;

  if (!matches.length) {
    content.innerHTML = emptyState("No hay partidos para los filtros seleccionados.");
    renderGroupStandings();
    return;
  }

  const rows = matches.map((match) => `
    <tr><td class="number-cell">${escapeHtml(match.match_id)}</td><td>${escapeHtml(formatFixtureDate(match))}</td>
    <td>${escapeHtml(phaseLabel(match.phase))}</td><td>${escapeHtml(match.group || "—")}</td>
    <td>${renderControlTeam(match, "home")}</td><td>${renderControlTeam(match, "away")}</td>
    <td><span class="score">${escapeHtml(formatRealScore(match))}</span></td>
    <td>${escapeHtml(formatRealPenalties(match))}</td><td>${statusBadge(match.status)}</td>
    <td>${controlLabel(match)}</td></tr>`).join("");
  const cards = matches.map((match) => `
    <article class="fixture-card">
      <div class="fixture-card-head"><span>#${escapeHtml(match.match_id)} · ${escapeHtml(phaseLabel(match.phase))}${match.group ? ` · Grupo ${escapeHtml(match.group)}` : ""}</span>${statusBadge(match.status)}</div>
      <div class="fixture-card-teams">${renderControlTeam(match, "home")}${renderControlTeam(match, "away")}</div>
      <div class="fixture-card-result"><span class="muted">${escapeHtml(formatFixtureDate(match))} · ${controlLabel(match)}</span><strong>${escapeHtml(formatRealScore(match))}${formatRealPenalties(match) !== "—" ? ` · pen. ${escapeHtml(formatRealPenalties(match))}` : ""}</strong></div>
    </article>`).join("");
  content.innerHTML = `<div class="panel fixture-table">${table(
    ["ID", "Fecha", "Fase", "Grupo", "Local", "Visita", "Resultado", "Penales", "Estado", "Control"],
    rows,
  )}</div><div class="fixture-cards">${cards}</div>`;
  renderGroupStandings();
}

function renderGroupStandings() {
  const standings = getGroupStandings(state.realResults);
  const rows = GROUPS.flatMap((group) => (standings[group]?.rows ?? []).map((team) => `
    <tr><td><span class="badge">Grupo ${escapeHtml(group)}</span></td>
    <td class="number-cell">${team.position}°</td><td class="standings-team">${renderTeamName(team.team)}</td>
    <td class="number-cell">${team.points}</td><td class="number-cell">${team.gf}</td>
    <td class="number-cell">${team.gc}</td><td class="number-cell">${team.gd}</td>
    <td>${standings[group].complete ? '<span class="control-ok">Completo</span>' : '<span class="control-pending">Provisional</span>'}</td></tr>`));
  document.querySelector("#fixture-standings").innerHTML = rows.length
    ? `<div class="message message-info">Las posiciones solo resuelven slots eliminatorios cuando todos los partidos del grupo están finalizados. Los cruces de mejores terceros permanecen por definir.</div>
      <div class="panel">${table(["Grupo", "Posición", "Equipo", "Puntos", "GF", "GC", "DG", "Estado"], rows.join(""))}</div>`
    : emptyState("No hay grupos disponibles para calcular posiciones.");
}

function renderAwards() {
  const rows = Object.entries(AWARD_LABELS).map(([key, label]) => `
    <tr><td><strong>${label}</strong></td>${state.players.map((player) => `<td>${escapeHtml(player.awards?.[key] || "Sin definir")}</td>`).join("")}</tr>`).join("");
  document.querySelector("#awards-content").innerHTML = table(["Premio", ...state.players.map((player) => player.player.name)], rows);
}

function renderAudit() {
  document.querySelector("#audit-content").innerHTML = state.players.map((player) => {
    const pdf = state.pdfAvailability[player.player.id] || {
      path: getPlayerPdfPath(player.player.id),
      available: false,
    };
    return `<article class="audit-card"><div class="audit-meta"><p class="card-kicker">Auditoría de pronóstico</p>
      <h3>${escapeHtml(player.player.name)}</h3>
      <p><strong>Ruta esperada:</strong> <span class="audit-path">${escapeHtml(pdf.path)}</span></p>
      <p><strong>Estado:</strong> ${pdf.available ? '<span class="control-ok">Disponible</span>' : '<span class="control-pending">No disponible todavía</span>'}</p>
      </div>${renderPdfAction(pdf)}</article>`;
  }).join("");
}

function renderPdfAction(pdf) {
  if (pdf?.available) {
    return `<a class="button button-secondary" href="${escapeHtml(pdf.path)}" download>Descargar PDF</a>`;
  }
  return '<button class="button button-secondary" type="button" disabled>PDF no disponible</button>';
}

function renderWarnings() {
  const pendingControl = state.controlWarnings.filter((warning) => /: Sin equipos definidos$/.test(warning));
  const reviewControl = state.controlWarnings.filter((warning) => !/: Sin equipos definidos$/.test(warning));
  const pendingDetails = pendingControl.length
    ? `<details class="notice-details"><summary>${pendingControl.length} partidos pendientes sin equipos definidos</summary>
        <ul class="warning-list">${pendingControl.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
      </details>`
    : "";
  const reviewList = reviewControl.length
    ? `<ul class="warning-list">${reviewControl.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : (!pendingControl.length ? emptyState("Sin avisos") : "");
  const controlCard = `<article class="warning-card"><div class="warning-heading"><h3>Avisos de control</h3>${warningBadge(state.controlWarnings.length, "aviso")}</div>
    ${pendingDetails}${reviewList}</article>`;
  const scoringCard = `<article class="warning-card"><div class="warning-heading"><h3>Avisos de scoring</h3>${warningBadge(state.scoringWarnings.length, "aviso")}</div>
    ${state.scoringWarnings.length ? `<ul class="warning-list">${state.scoringWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : emptyState("Sin avisos")}</article>`;
  document.querySelector("#warnings-content").innerHTML = controlCard + scoringCard + state.players.map((player) => {
    const warnings = getPlayerWarnings(player);
    return `<article class="warning-card"><div class="warning-heading"><h3>Avisos de jugador: ${escapeHtml(player.player.name)}</h3>${warningBadge(warnings.length, "aviso")}</div>
      ${warnings.length ? `<ul class="warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>` : emptyState("Sin avisos")}</article>`;
  }).join("");
}

function renderTeamName(teamName) {
  if (!teamName) return '<span class="muted">Sin definir</span>';
  const team = state.teams[teamName];
  if (!team?.flag) return `<span class="team-name"><span class="team-label">${escapeHtml(teamName)}</span></span>`;
  return `<span class="team-name"><img class="team-flag" src="${escapeHtml(team.flag)}" alt="" loading="lazy" onload="this.classList.add('is-loaded')" onerror="this.remove()"><span class="team-label">${escapeHtml(teamName)}</span></span>`;
}

function renderControlTeam(match, side) {
  const team = match?.[`${side}_team`];
  if (team) return renderTeamName(team);
  const slot = match?.[`${side}_slot`] || "Por definir";
  return `<span class="control-slot">${escapeHtml(slot)}</span>`;
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
    document.querySelector("#group-select").innerHTML = `<option value="all">Fase completa</option>${GROUPS.map((group) => `<option value="${group}">Grupo ${group}</option>`).join("")}`;
    document.querySelector("#group-order-select").innerHTML = '<option value="group">Grupo</option><option value="date">Fecha</option>';
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
  groupSelect.innerHTML = `<option value="all">Fase completa</option>${GROUPS.map((group) => `<option value="${group}">Grupo ${group}</option>`).join("")}`;
  groupSelect.value = state.selected.group;
  groupSelect.addEventListener("change", () => { state.selected.group = groupSelect.value; renderGroupStage(); });
  const groupOrderSelect = document.querySelector("#group-order-select");
  groupOrderSelect.innerHTML = '<option value="group">Grupo</option><option value="date">Fecha</option>';
  groupOrderSelect.value = state.selected.groupOrder;
  groupOrderSelect.addEventListener("change", () => {
    state.selected.groupOrder = groupOrderSelect.value;
    renderGroupStage();
  });
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

function getMatchDateTime(match) {
  if (!match?.date || !match?.time) return null;
  const value = new Date(`${match.date}T${match.time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function compareMatchesByDate(a, b) {
  const aDate = getMatchDateTime(a);
  const bDate = getMatchDateTime(b);
  if (!aDate && !bDate) return String(a.group || "").localeCompare(String(b.group || ""), "es");
  if (!aDate) return 1;
  if (!bDate) return -1;
  return aDate - bDate || String(a.group || "").localeCompare(String(b.group || ""), "es");
}

function enrichPredictionWithRealMatchData(prediction) {
  const realMatch = (state.realResults?.matches ?? []).find((match) =>
    match.phase === "group_stage"
    && (
      (prediction.match_key && match.match_key === prediction.match_key)
      || (
        compareTeams(match.home_team, prediction.home_team)
        && compareTeams(match.away_team, prediction.away_team)
      )
    )
  );
  return {
    ...prediction,
    date: prediction.date || realMatch?.date || null,
    time: prediction.time || realMatch?.time || null,
  };
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

function isKnockoutPhase(phase) {
  return Object.prototype.hasOwnProperty.call(PHASE_LABELS, phase);
}

function getGroupStandings(realResults) {
  const standings = Object.fromEntries(GROUPS.map((group) => [group, { complete: false, rows: [] }]));
  GROUPS.forEach((group) => {
    const matches = (realResults?.matches ?? []).filter(
      (match) => match.phase === "group_stage" && match.group === group,
    );
    const teams = new Map();
    matches.forEach((match) => {
      [match.home_team, match.away_team].filter(Boolean).forEach((team) => {
        if (!teams.has(team)) teams.set(team, { team, points: 0, gf: 0, gc: 0, gd: 0, played: 0 });
      });
      if (match.status !== "finished" || !hasScore(match) || !match.home_team || !match.away_team) return;
      const home = teams.get(match.home_team);
      const away = teams.get(match.away_team);
      home.played += 1;
      away.played += 1;
      home.gf += match.home_score;
      home.gc += match.away_score;
      away.gf += match.away_score;
      away.gc += match.home_score;
      if (match.home_score > match.away_score) home.points += 3;
      else if (match.away_score > match.home_score) away.points += 3;
      else {
        home.points += 1;
        away.points += 1;
      }
    });
    const rows = [...teams.values()]
      .map((team) => ({ ...team, gd: team.gf - team.gc }))
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, "es"))
      .map((team, index) => ({ ...team, position: index + 1 }));
    standings[group] = {
      complete: matches.length > 0 && matches.every((match) => match.status === "finished" && hasScore(match)),
      rows,
    };
  });
  return standings;
}

function resolveControlMatches(realResults) {
  const standings = getGroupStandings(realResults);
  const resolvedById = new Map();
  return (realResults?.matches ?? []).map((sourceMatch) => {
    const match = { ...sourceMatch };
    if (isKnockoutPhase(match.phase)) {
      match.home_team = match.home_team || resolveControlSlot(match.home_slot, standings, resolvedById);
      match.away_team = match.away_team || resolveControlSlot(match.away_slot, standings, resolvedById);
      if (match.home_team && match.away_team) match.match_key = deriveMatchKey(match);
    }
    resolvedById.set(match.match_id, match);
    return match;
  });
}

function resolveControlSlot(slot, standings, resolvedById) {
  const groupSlot = /^([1-4])° Grupo ([A-L])$/.exec(slot || "");
  if (groupSlot) {
    const group = standings[groupSlot[2]];
    return group?.complete ? group.rows[Number(groupSlot[1]) - 1]?.team || null : null;
  }
  const priorSlot = /^(Ganador|Perdedor) partido (\d+)$/.exec(slot || "");
  if (!priorSlot) return null;
  const priorMatch = resolvedById.get(Number(priorSlot[2]));
  if (!priorMatch || priorMatch.status !== "finished" || !priorMatch.home_team || !priorMatch.away_team) return null;
  const winner = getQualifiedTeam(priorMatch);
  if (!winner) return null;
  if (priorSlot[1] === "Ganador") return winner;
  return compareTeams(winner, priorMatch.home_team) ? priorMatch.away_team : priorMatch.home_team;
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
    if (!realMatch.home_team || !realMatch.away_team) {
      state.scoringWarnings.push(
        `${player.player.name}: Partido #${realMatch.match_id}: No se puede calcular ranking para partido sin equipos reales.`,
      );
      result.warnings += 1;
      return;
    }
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
  if (!realMatch.home_team || !realMatch.away_team) {
    result.warnings.push(`Partido #${realMatch.match_id}: No se puede calcular ranking para partido sin equipos reales.`);
    return result;
  }
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
  resolveControlMatches(state.realResults).forEach((match) => {
    if (!match.match_key) {
      warnings.push(`Partido #${match.match_id}: Falta match_key`);
    }
    if (isKnockoutPhase(match.phase) && (!match.home_team || !match.away_team)) {
      warnings.push(`Partido #${match.match_id}: Sin equipos definidos`);
    }
    if (match.status !== "finished") return;
    if (!match.home_team || !match.away_team) {
      warnings.push(`Partido #${match.match_id}: Partido finalizado sin equipos definidos`);
      return;
    }
    if (!hasScore(match)) {
      warnings.push(`Partido #${match.match_id}: Sin marcador final`);
    } else if (match.phase !== "group_stage" && match.home_score === match.away_score) {
      if (!hasPenalties(match)) {
        warnings.push(`Partido #${match.match_id}: Faltan penales`);
      } else if (match.home_penalties === match.away_penalties) {
        warnings.push(`Partido #${match.match_id}: Penales inválidos`);
      }
    }
  });
  return warnings;
}

function getControlState(match) {
  if (isKnockoutPhase(match.phase) && (!match.home_team || !match.away_team)) {
    return { label: "Por definir", className: "control-pending" };
  }
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
  return resolveControlMatches(state.realResults).filter((match) =>
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

function formatGroupMatchDate(match) {
  if (!match?.date) return "Sin fecha";
  const date = new Date(`${match.date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(date);
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
function warningBadge(count, label = "warning") { return `<span class="badge ${count ? "badge-warning" : "badge-success"}">${count} ${label}${count === 1 ? "" : "s"}</span>`; }
function metricCard(label, value, note, compact = false) { return `<article class="metric-card"><p class="metric-label">${label}</p><p class="metric-value ${compact ? "metric-value-compact" : ""}">${escapeHtml(value)}</p><p class="metric-note">${note}</p></article>`; }
function honorItem(label, team) { return `<div class="honor-item"><span>${label}</span><strong>${renderTeamName(team)}</strong></div>`; }
function awardGroup(title, keys, awards = {}) { return `<section class="award-group"><h4>${title}</h4>${keys.map((key) => `<div class="award-row"><span>${AWARD_LABELS[key]}</span><strong>${escapeHtml(awards?.[key] || "Sin definir")}</strong></div>`).join("")}</section>`; }
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`; }
function emptyState(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
init();
