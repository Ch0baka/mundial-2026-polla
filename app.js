const PATHS = {
  index: "data/players_index.json",
  teams: "data/teams.json",
  config: "data/app_config.json",
  results: "data/real_results.json",
  scoring: "data/scoring_rules.json",
  bracket: "data/knockout_bracket.json",
  qualificationOverrides: "data/qualification_overrides.json",
  bestThirdMatrix: "data/best_third_matrix.json",
  topScorersStats: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/statistics?season=2026",
  topScorersScoreboard: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=20260611-20260719",
  topScorersSummary: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=",
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
const PHASE_MATCH_START = {
  group_stage: 1,
  round_of_32: 73,
  round_of_16: 89,
  quarter_finals: 97,
  semi_finals: 101,
  third_place: 103,
  final: 104,
};
const THEME_STORAGE_KEY = "worldcup-2026-theme";
const TOP_SCORERS_REFRESH_MS = 5 * 60 * 1000;
const ESPN_TEAM_NAMES = {
  Algeria: "Argelia",
  Argentina: "Argentina",
  Australia: "Australia",
  Austria: "Austria",
  Belgium: "Bélgica",
  "Bosnia-Herzegovina": "Bosnia y Herzegovina",
  "Bosnia and Herzegovina": "Bosnia y Herzegovina",
  Brazil: "Brasil",
  Canada: "Canadá",
  "Cape Verde": "Cabo Verde",
  Colombia: "Colombia",
  "Congo DR": "RD Congo",
  Croatia: "Croacia",
  Curacao: "Curazao",
  Czechia: "República Checa",
  Ecuador: "Ecuador",
  Egypt: "Egipto",
  England: "Inglaterra",
  France: "Francia",
  Germany: "Alemania",
  Ghana: "Ghana",
  Haiti: "Haití",
  Iran: "Irán",
  Iraq: "Irak",
  "Ivory Coast": "Costa de Marfil",
  Japan: "Japón",
  Jordan: "Jordania",
  Mexico: "México",
  Morocco: "Marruecos",
  Netherlands: "Países Bajos",
  "New Zealand": "Nueva Zelanda",
  Norway: "Noruega",
  Panama: "Panamá",
  Paraguay: "Paraguay",
  Portugal: "Portugal",
  Qatar: "Catar",
  "Saudi Arabia": "Arabia Saudita",
  Scotland: "Escocia",
  Senegal: "Senegal",
  "South Africa": "Sudáfrica",
  "South Korea": "Corea del Sur",
  Spain: "España",
  Sweden: "Suecia",
  Switzerland: "Suiza",
  Turkey: "Turquía",
  Tunisia: "Túnez",
  "United States": "Estados Unidos",
  Uruguay: "Uruguay",
  Uzbekistan: "Uzbekistán",
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
  knockoutBracket: { matches: [] },
  qualificationOverrides: { group_positions: {}, best_thirds: [], round_of_32_assignments: {} },
  bestThirdMatrix: { implemented: false, assignments: {} },
  topScorers: [],
  topScorersAvailable: false,
  topScorersUpdatedAt: null,
  topScorersError: "",
  topScorersRefreshTimer: null,
  controlWarnings: [],
  scoringWarnings: [],
  leaderboard: [],
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
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status} al cargar ${path}`);
  return response.json();
}

function cacheBustedUrl(path) {
  if (!/^https?:\/\//i.test(path)) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_=${Date.now()}`;
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

async function loadTopScorers() {
  try {
    const data = await loadJson(cacheBustedUrl(PATHS.topScorersScoreboard));
    const events = (data?.events ?? []).filter((event) =>
      event?.id && (event.status?.type?.completed || event.status?.type?.state === "in")
    );
    const summaries = await Promise.allSettled(events.map(async (event) => ({
      event,
      summary: await loadJson(cacheBustedUrl(`${PATHS.topScorersSummary}${event.id}`)),
    })));
    const eventSummaries = summaries
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    state.topScorers = parseTopScorersFromEspnSummaries(eventSummaries);
    if (!state.topScorers.length) {
      const fallbackData = await loadJson(cacheBustedUrl(PATHS.topScorersStats));
      state.topScorers = parseTopScorersFromEspnStats(fallbackData);
    }
    state.topScorersAvailable = true;
    state.topScorersUpdatedAt = data?.timestamp || new Date().toISOString();
    state.topScorersError = "";
  } catch {
    state.topScorersError = "No se pudo actualizar desde ESPN.";
    if (!state.topScorers.length) {
      state.topScorers = [];
      state.topScorersAvailable = false;
      state.topScorersUpdatedAt = null;
    }
  }
  return state.topScorers;
}

async function refreshTopScorers() {
  await loadTopScorers();
  const container = document.querySelector("#dashboard-top-scorers");
  if (container) container.innerHTML = renderTopScorers();
}

function startTopScorersAutoRefresh() {
  if (state.topScorersRefreshTimer) window.clearInterval(state.topScorersRefreshTimer);
  state.topScorersRefreshTimer = window.setInterval(refreshTopScorers, TOP_SCORERS_REFRESH_MS);
}

async function loadBracketConfiguration() {
  const [bracket, overrides, matrix] = await Promise.all([
    loadJson(PATHS.bracket),
    loadJson(PATHS.qualificationOverrides).catch(() => state.qualificationOverrides),
    loadJson(PATHS.bestThirdMatrix).catch(() => state.bestThirdMatrix),
  ]);
  state.knockoutBracket = bracket;
  state.qualificationOverrides = overrides;
  state.bestThirdMatrix = matrix;
}

async function init() {
  setupThemeToggle();
  setupNavigation();
  try {
    await loadPlayersIndex();
    await Promise.all([
      loadPlayers(), loadTeams(), loadConfig(), loadRealResults(), loadScoringRules(), loadTopScorers(),
      loadBracketConfiguration(),
    ]);
    if (state.players.length) {
      state.selected.groups = state.players[0].player.id;
      state.selected.knockout = state.players[0].player.id;
    }
    renderAll();
    startTopScorersAutoRefresh();
    if (state.errors.length) {
      showError(`Carga parcial: ${state.errors.join(" | ")}`);
      setStatus(`${state.players.length} jugadores · carga parcial`, "is-error");
    } else {
      setStatus(`${state.players.length} jugadores participando`, "is-ready");
    }
  } catch (error) {
    showError(`No se pudieron cargar los datos. Usa un servidor local. Detalle: ${error.message}`);
    setStatus("Error de carga", "is-error");
  }
}

function setupThemeToggle() {
  const button = document.querySelector("#theme-toggle");
  const savedTheme = readStoredTheme();
  const initialTheme = ["light", "dark"].includes(savedTheme) ? savedTheme : getPreferredTheme();
  applyTheme(initialTheme);
  button?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    storeTheme(nextTheme);
    applyTheme(nextTheme);
  });
}

function readStoredTheme() {
  try {
    return window.localStorage?.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeTheme(theme) {
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Safari private contexts can block storage; the in-memory theme still applies.
  }
}

function getPreferredTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = safeTheme;
  const button = document.querySelector("#theme-toggle");
  if (!button) return;
  const isDark = safeTheme === "dark";
  button.textContent = isDark ? "Tema claro" : "Tema oscuro";
  button.setAttribute("aria-label", isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
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
  renderWarnings();
}

function renderDashboard() {
  const realMatches = state.realResults?.matches ?? [];
  const totalGoals = countTournamentGoals(realMatches);
  const playedMatches = realMatches.filter((match) => match.status === "finished").length;
  const pendingMatches = realMatches.filter((match) => match.status !== "finished").length;
  document.querySelector("#dashboard-metrics").innerHTML = [
    metricCard("Jugadores", state.players.length, "Participantes cargados"),
    metricCard("Cantidad de goles", totalGoals, "Goles convertidos"),
    metricCard("Partidos jugados", playedMatches, "Resultados finalizados"),
    metricCard("Partidos pendientes", pendingMatches, "Encuentros por completar"),
  ].join("");
  document.querySelector("#dashboard-daily-matches").innerHTML = renderDashboardDailyMatches();
  document.querySelector("#dashboard-top-scorers").innerHTML = renderTopScorers();
  const rows = state.leaderboard.map((leaderboardEntry) => {
    const player = getPlayer(leaderboardEntry.id);
    return `<tr><td><strong>${escapeHtml(player.player.name)}</strong></td>
    <td class="points-cell">${leaderboardEntry.points}</td>
    <td class="number-cell">${countPredictions(player)}</td>
    <td>${warningBadge(getPlayerWarnings(player).length)}</td>
    <td>${renderTeamName(player.honor_roll?.champion)}</td></tr>`;
  }).join("");
  document.querySelector("#dashboard-players").innerHTML = table(
    ["Jugador", "Puntos", "Partidos", "Avisos", "Campeón pronosticado"], rows,
  );
}

function countTournamentGoals(matches) {
  return (matches ?? []).reduce((total, match) => {
    if (!["finished", "live"].includes(match.status)) return total;
    const homeScore = numericScore(match.home_score);
    const awayScore = numericScore(match.away_score);
    if (homeScore === null || awayScore === null) return total;
    return total + homeScore + awayScore;
  }, 0);
}

function renderTopScorers() {
  const updatedLabel = state.topScorersUpdatedAt ? `Actualizado ${formatDate(state.topScorersUpdatedAt)}` : "ESPN";
  const warning = state.topScorersError ? `<p class="muted top-scorers-note">${escapeHtml(state.topScorersError)}</p>` : "";
  if (!state.topScorersAvailable) {
    return `<div class="panel top-scorers-panel">
      <div class="panel-heading"><h3>Top 5 goleadores</h3><span class="muted">${escapeHtml(updatedLabel)}</span></div>
      ${emptyState("Goleadores no disponibles.")}
      ${warning}
    </div>`;
  }
  if (!state.topScorers.length) {
    return `<div class="panel top-scorers-panel">
      <div class="panel-heading"><h3>Top 5 goleadores</h3><span class="muted">${escapeHtml(updatedLabel)}</span></div>
      ${emptyState("Sin goleadores registrados.")}
      ${warning}
    </div>`;
  }
  const rows = state.topScorers.slice(0, 5).map((scorer, index) => `
    <tr><td class="rank-cell">${index + 1}</td><td><strong>${escapeHtml(scorer.name)}</strong></td>
    <td>${renderTeamName(scorer.team)}</td><td class="points-cell">${escapeHtml(scorer.goals)}</td></tr>`).join("");
  return `<div class="panel top-scorers-panel">
    <div class="panel-heading"><h3>Top 5 goleadores</h3><span class="muted">${escapeHtml(updatedLabel)}</span></div>
    ${table(["#", "Jugador", "Selección", "Goles"], rows)}
    ${warning}
  </div>`;
}

function renderDashboardDailyMatches(today = new Date()) {
  const todayKey = getLocalDateKey(today);
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const matches = resolveControlMatches(state.realResults);
  return [
    renderDashboardMatchPanel("Partidos de hoy", todayKey, matches.filter((match) => match.date === todayKey), false),
    renderDashboardMatchPanel("Resultados de ayer", yesterdayKey, matches.filter((match) => match.date === yesterdayKey), true),
  ].join("");
}

function renderDashboardMatchPanel(title, dateKey, matches, resultsOnly) {
  const sortedMatches = [...matches].sort(compareMatchesByDate);
  const content = sortedMatches.length
    ? `<div class="dashboard-match-list">${sortedMatches.map((match) => renderDashboardMatch(match, resultsOnly)).join("")}</div>`
    : emptyState(resultsOnly ? "No hubo partidos registrados." : "No hay partidos programados.");
  return `<section class="panel dashboard-match-panel">
    <div class="panel-heading"><h3>${escapeHtml(title)}</h3><span class="muted">${escapeHtml(formatDateKey(dateKey))}</span></div>
    ${content}
  </section>`;
}

function renderDashboardMatch(match, resultsOnly) {
  return `<article class="dashboard-match-item">
    <div class="dashboard-match-meta">
      <span>${escapeHtml(match.time || "Sin hora")}</span>
      <span>${escapeHtml(phaseLabel(match.phase))}${match.group ? ` · Grupo ${escapeHtml(match.group)}` : ""}</span>
    </div>
    <div class="dashboard-match-teams">
      ${renderControlTeam(match, "home")}
      <span class="versus-mark">vs</span>
      ${renderControlTeam(match, "away")}
    </div>
    <div class="dashboard-match-result">
      ${resultsOnly && match.status !== "finished" ? statusBadge(match.status) : renderRealResult(match)}
    </div>
  </article>`;
}

function parseTopScorersFromEspnStats(data) {
  const goalsCategory = (data?.stats ?? []).find((category) => category.name === "goalsLeaders");
  return (goalsCategory?.leaders ?? []).map((leader) => {
    const athlete = leader.athlete ?? {};
    const team = athlete.team ?? leader.team ?? {};
    return {
      id: athlete.id ?? "",
      name: athlete.displayName ?? athlete.shortName ?? "Jugador sin nombre",
      team: mapEspnTeamName(team.displayName ?? team.name ?? ""),
      goals: Number(leader.value ?? 0),
      displayValue: leader.displayValue ?? "",
    };
  }).filter((scorer) => scorer.goals > 0);
}

function parseTopScorersFromEspnSummaries(eventSummaries) {
  const scorers = new Map();
  eventSummaries.forEach(({ summary }) => {
    const seenPlayIds = new Set();
    (summary?.keyEvents ?? []).forEach((play) => {
      if (!isGoalScoringPlay(play) || seenPlayIds.has(play.id)) return;
      seenPlayIds.add(play.id);
      const athlete = play.participants?.[0]?.athlete;
      const name = athlete?.displayName || athlete?.shortName;
      if (!name) return;
      const id = athlete.id || `${name}|${play.team?.displayName || ""}`;
      const existing = scorers.get(id) ?? {
        id,
        name,
        team: mapEspnTeamName(play.team?.displayName ?? ""),
        goals: 0,
        displayValue: "",
      };
      existing.goals += 1;
      existing.displayValue = `${existing.goals}`;
      scorers.set(id, existing);
    });
  });
  return [...scorers.values()]
    .filter((scorer) => scorer.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

function isGoalScoringPlay(play) {
  const type = String(play?.type?.type || play?.type?.text || "").toLowerCase();
  return play?.scoringPlay === true && ["goal", "penalty---scored"].includes(type);
}

function mapEspnTeamName(teamName) {
  return ESPN_TEAM_NAMES[teamName] || teamName || "Sin definir";
}

function renderRanking() {
  const rows = state.leaderboard.map((entry, index) => `
    <tr><td class="rank-cell">${index + 1}</td><td><strong>${escapeHtml(entry.name)}</strong></td>
    <td class="points-cell">${entry.points}</td><td class="number-cell">${entry.scoredMatches}</td>
    <td class="number-cell">${entry.exactScores}</td><td>${renderTeamName(entry.champion)}</td></tr>`).join("");
  document.querySelector("#ranking-content").innerHTML = table(
    ["Posición", "Jugador", "Puntos", "Partidos puntuados", "Resultados exactos", "Campeón pronosticado"], rows,
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
  const matches = (player?.predictions?.group_stage ?? [])
    .map((prediction, index) => enrichPredictionWithRealMatchData(
      withPredictionMatchId(prediction, "group_stage", index),
    ))
    .filter((match) => state.selected.group === "all" || match.group === state.selected.group)
    .sort(state.selected.groupOrder === "date"
      ? compareMatchesByDate
      : (a, b) => String(a.group || "").localeCompare(String(b.group || ""), "es"));
  const rows = matches.map((match) => `
    <tr><td>${escapeHtml(formatGroupMatchDate(match))}</td><td>${escapeHtml(match.time || "Sin hora")}</td>
    <td><span class="badge">Grupo ${escapeHtml(match.group)}</span></td>
    <td>${renderMatchTeams(match)}</td><td>${renderPredictionScore(match, match.realMatch)}</td>
    <td>${renderRealResult(match.realMatch)}</td></tr>`).join("");
  const cards = matches.map((match) => `
    <article class="group-stage-card">
      <div class="group-stage-card-head">
        <span>${escapeHtml(formatGroupMatchDate(match))} · ${escapeHtml(match.time || "Sin hora")}</span>
        <span class="badge">Grupo ${escapeHtml(match.group)}</span>
      </div>
      <div class="group-stage-card-teams">${renderMatchTeams(match)}</div>
      <div class="group-stage-card-result">
        <span><span class="muted">Pronóstico</span>${renderPredictionScore(match, match.realMatch)}</span>
        <span><span class="muted">Resultado</span>${renderRealResult(match.realMatch)}</span>
      </div>
    </article>`).join("");
  document.querySelector("#groups-content").innerHTML = matches.length
    ? `${renderPredictionLegend()}<div class="panel group-stage-table">${table(["Fecha", "Hora", "Grupo", "Partido", "Pronóstico", "Resultado"], rows)}</div>
      <div class="group-stage-cards">${cards}</div>`
    : emptyState("No hay partidos para el filtro seleccionado.");
  renderGroupStandings("#groups-standings", state.selected.group);
}

function renderKnockout() {
  const player = getPlayer(state.selected.knockout);
  document.querySelector("#knockout-content").innerHTML = renderPredictionLegend()
    + Object.entries(PHASE_LABELS).map(([phase, label], index) => {
    const matches = (player?.predictions?.[phase] ?? []).map(
      (prediction, predictionIndex) => withPredictionMatchId(prediction, phase, predictionIndex),
    );
    return `<details class="phase-section" ${index === 0 ? "open" : ""}>
      <summary><span>${label}</span><span class="phase-count">${matches.length} partidos</span></summary>
      <div class="knockout-comparison-list">${matches.length
        ? matches.map((prediction) => renderKnockoutComparison(prediction, player)).join("")
        : emptyState("Sin pronósticos.")}</div>
    </details>`;
  }).join("");
}

function renderFixture() {
  const content = document.querySelector("#fixture-content");
  const summary = document.querySelector("#fixture-summary");
  const standings = document.querySelector("#fixture-standings");
  if (!state.fixtureAvailable) {
    summary.innerHTML = "";
    content.innerHTML = emptyState("Fixture no disponible");
    standings.innerHTML = emptyState("Clasificados calculados no disponibles");
    document.querySelector("#groups-standings").innerHTML = emptyState("Clasificados calculados no disponibles");
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
    renderGroupStandings("#fixture-standings", state.selected.fixtureGroup);
    return;
  }

  const showPenalties = shouldShowFixturePenalties(matches);
  const rows = matches.map((match) => `
    <tr><td class="number-cell">${escapeHtml(match.match_id)}</td><td>${escapeHtml(formatFixtureDate(match))}</td>
    <td>${escapeHtml(phaseLabel(match.phase))}</td><td>${escapeHtml(match.group || "—")}</td>
    <td>${renderControlTeam(match, "home")}</td><td>${renderControlTeam(match, "away")}</td>
    <td><span class="score">${escapeHtml(formatRealScore(match))}</span></td>
    ${showPenalties ? `<td>${escapeHtml(formatRealPenalties(match))}</td>` : ""}
    <td>${statusBadge(match.status)}</td></tr>`).join("");
  const cards = matches.map((match) => `
    <article class="fixture-card">
      <div class="fixture-card-head"><span>#${escapeHtml(match.match_id)} · ${escapeHtml(phaseLabel(match.phase))}${match.group ? ` · Grupo ${escapeHtml(match.group)}` : ""}</span>${statusBadge(match.status)}</div>
      <div class="fixture-card-teams">${renderControlTeam(match, "home")}${renderControlTeam(match, "away")}</div>
      <div class="fixture-card-result"><span class="muted">${escapeHtml(formatFixtureDate(match))}</span><strong>${escapeHtml(formatRealScore(match))}${isKnockoutPhase(match.phase) && formatRealPenalties(match) !== "—" ? ` · pen. ${escapeHtml(formatRealPenalties(match))}` : ""}</strong></div>
    </article>`).join("");
  content.innerHTML = `<div class="panel fixture-table">${table(
    ["ID", "Fecha", "Fase", "Grupo", "Local", "Visita", "Resultado", ...(showPenalties ? ["Penales"] : []), "Estado"],
    rows,
  )}</div><div class="fixture-cards">${cards}</div>`;
  renderGroupStandings("#fixture-standings", state.selected.fixtureGroup);
}

function renderGroupStandings(targetSelector, selectedGroup = "all") {
  const standings = getGroupStandings(state.realResults);
  const groups = selectedGroup === "all" ? GROUPS : GROUPS.filter((group) => group === selectedGroup);
  const groupTables = groups.map((group) => {
    const rows = (standings[group]?.rows ?? []).map((team) => `
      <tr><td class="number-cell">${team.position}°</td><td class="standings-team">${renderTeamName(team.team)}</td>
      <td class="number-cell">${team.played}</td><td class="number-cell">${team.wins}</td>
      <td class="number-cell">${team.draws}</td><td class="number-cell">${team.losses}</td>
      <td class="number-cell">${team.points}</td><td class="number-cell">${team.gf}</td>
      <td class="number-cell">${team.gc}</td><td class="number-cell">${team.gd}</td>
      <td>${team.tie_pending ? '<span class="control-pending">Desempate pendiente</span>'
        : standings[group].complete ? '<span class="control-ok">Completo</span>' : '<span class="control-pending">Provisional</span>'}</td></tr>`).join("");
    return rows ? `<section class="panel group-standings-card">
      <div class="group-standings-heading"><h4>Grupo ${escapeHtml(group)}</h4>
        <span class="badge">${standings[group].complete ? "Completo" : "Provisional"}</span></div>
      ${table(["Posición", "Equipo", "J", "G", "E", "P", "Pts", "GF", "GC", "DG", "Estado"], rows)}
    </section>` : "";
  }).filter(Boolean);
  document.querySelector(targetSelector).innerHTML = groupTables.length
    ? `<div class="message message-info">Las posiciones solo resuelven slots eliminatorios cuando todos los partidos del grupo están finalizados. Los cruces de mejores terceros permanecen por definir.</div>
      <div class="group-standings-grid">${groupTables.join("")}</div>`
    : emptyState("No hay grupos disponibles para calcular posiciones.");
}

function renderAwards() {
  const rows = Object.entries(AWARD_LABELS).map(([key, label]) => `
    <tr><td><strong>${label}</strong></td>${state.players.map((player) => `<td>${escapeHtml(player.awards?.[key] || "Sin definir")}</td>`).join("")}</tr>`).join("");
  document.querySelector("#awards-content").innerHTML = table(["Premio", ...state.players.map((player) => player.player.name)], rows);
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

function renderPredictionLegend() {
  return `<div class="prediction-legend" aria-label="Leyenda de pronósticos">
    <span class="prediction-exact">Verde: exacto</span>
    <span class="prediction-partial">Amarillo: sumó puntos</span>
    <span class="prediction-zero">Rojo: cero puntos</span>
    <span class="prediction-pending">Gris: pendiente</span>
  </div>`;
}

function getPredictionStatus(scoreResult, realMatch) {
  if (!realMatch || realMatch.status !== "finished") return "pending";
  if (scoreResult?.details?.exact_score) return "exact";
  if ((scoreResult?.points ?? 0) > 0) return "partial";
  return "zero";
}

function getPredictionStatusClass(status) {
  return `prediction-${["exact", "partial", "zero"].includes(status) ? status : "pending"}`;
}

function predictionStatusLabel(status) {
  return {
    exact: "Resultado exacto",
    partial: "Puntuación parcial",
    zero: "Sin puntos",
    pending: "Partido pendiente",
  }[status] || "Partido pendiente";
}

function scorePrediction(prediction, realMatch) {
  if (!realMatch) return { points: 0, details: {}, warnings: [] };
  return calculateMatchPoints(prediction, realMatch, state.scoringRules);
}

function renderPredictionScore(prediction, realMatch, includeTeams = false) {
  const scoreResult = scorePrediction(prediction, realMatch);
  const status = getPredictionStatus(scoreResult, realMatch);
  const label = predictionStatusLabel(status);
  const content = includeTeams
    ? `${renderTeamName(prediction.home_team)} <span class="versus-mark">vs</span> ${renderTeamName(prediction.away_team)} <span class="score">${escapeHtml(formatScore(prediction))}</span>`
    : `<span class="score">${escapeHtml(formatScore(prediction))}</span>`;
  return `<span class="prediction-result ${getPredictionStatusClass(status)}" title="${label}" aria-label="${label}">${content}</span>`;
}

function renderRealResult(match) {
  if (!match || match.status === "scheduled") return '<span class="real-result pending">Pendiente</span>';
  if (match.status === "postponed") return '<span class="real-result pending">Postergado</span>';
  if (match.status === "live") {
    return `<span class="real-result live">${escapeHtml(formatRealScore(match))} · En juego</span>`;
  }
  if (match.status !== "finished") return `<span class="real-result pending">${escapeHtml(statusLabel(match.status))}</span>`;
  const penalties = formatRealPenalties(match);
  return `<span class="real-result finished">${escapeHtml(formatRealScore(match))}${penalties !== "—" ? ` · pen. ${escapeHtml(penalties)}` : ""}</span>`;
}

function renderKnockoutComparison(prediction, player) {
  const officialMatch = resolveOfficialFixtureMatch(prediction.match_id);
  const realMatch = getRealMatchById(prediction.match_id);
  return `<article class="knockout-comparison">
    <div class="comparison-block"><span class="comparison-label">Partido oficial</span>
      <strong>${renderOfficialMatch(officialMatch)}</strong></div>
    <div class="comparison-block"><span class="comparison-label">Pronóstico ${escapeHtml(player.player.name)}</span>
      ${renderPredictionScore(prediction, realMatch, true)}</div>
    <div class="comparison-block"><span class="comparison-label">Resultado</span>
      <strong>${renderRealResult(realMatch)}</strong></div>
  </article>`;
}

function renderOfficialMatch(match) {
  return `${match.home_team ? renderTeamName(match.home_team) : `<span class="control-slot">${escapeHtml(match.home_label)}</span>`}
    <span class="versus-mark">vs</span>
    ${match.away_team ? renderTeamName(match.away_team) : `<span class="control-slot">${escapeHtml(match.away_label)}</span>`}`;
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

function withPredictionMatchId(prediction, phase, index) {
  return {
    ...prediction,
    phase,
    match_id: prediction.match_id ?? (PHASE_MATCH_START[phase] + index),
  };
}

function getRealMatchById(matchId) {
  return (state.realResults?.matches ?? []).find((match) => match.match_id === Number(matchId)) || null;
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
  const realMatch = getRealMatchById(prediction.match_id);
  return {
    ...prediction,
    date: prediction.date || realMatch?.date || null,
    time: prediction.time || realMatch?.time || null,
    realMatch,
  };
}

function buildMatchKey(match) {
  return `${match.phase}|${normalizeTeamName(match.home_team)}|${normalizeTeamName(match.away_team)}`;
}

function deriveMatchKey(match) {
  return `${match.phase}|${match.home_team}|${match.away_team}`;
}

function predictionMap(player) {
  const predictions = { byId: new Map(), exact: new Map(), normalized: new Map() };
  Object.entries(player.predictions ?? {}).forEach(([phase, matches]) => {
    (matches ?? []).forEach((prediction, index) => {
      const normalized = withPredictionMatchId(prediction, phase, index);
      predictions.byId.set(normalized.match_id, normalized);
      predictions.exact.set(prediction.match_key || deriveMatchKey(normalized), normalized);
      predictions.normalized.set(buildMatchKey(normalized), normalized);
    });
  });
  return predictions;
}

function findPrediction(predictions, realMatch) {
  if (realMatch.match_id && predictions.byId.has(realMatch.match_id)) {
    return predictions.byId.get(realMatch.match_id);
  }
  const exactKey = realMatch.match_key || deriveMatchKey(realMatch);
  return predictions.exact.get(exactKey) || predictions.normalized.get(buildMatchKey(realMatch));
}

function isKnockoutPhase(phase) {
  return Object.prototype.hasOwnProperty.call(PHASE_LABELS, phase);
}

function shouldShowFixturePenalties(matches) {
  return matches.some((match) => isKnockoutPhase(match.phase));
}

function calculateGroupStandings(realResults) {
  const standings = Object.fromEntries(GROUPS.map((group) => [group, { complete: false, rows: [] }]));
  GROUPS.forEach((group) => {
    const matches = (realResults?.matches ?? []).filter(
      (match) => match.phase === "group_stage" && match.group === group,
    );
    const teams = new Map();
    matches.forEach((match) => {
      [match.home_team, match.away_team].filter(Boolean).forEach((team) => {
        if (!teams.has(team)) teams.set(team, {
          team, played: 0, wins: 0, draws: 0, losses: 0, points: 0, gf: 0, gc: 0, gd: 0,
        });
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
      if (match.home_score > match.away_score) {
        home.wins += 1;
        away.losses += 1;
      } else if (match.away_score > match.home_score) {
        away.wins += 1;
        home.losses += 1;
      } else {
        home.draws += 1;
        away.draws += 1;
      }
    });
    const finishedMatches = matches.filter((match) => match.status === "finished" && hasScore(match));
    const complete = matches.length > 0 && finishedMatches.length === matches.length;
    const rows = rankGroupTeams([...teams.values()].map((team) => ({ ...team, gd: team.gf - team.gc })), finishedMatches);
    const override = state.qualificationOverrides?.group_positions?.[group];
    if (override) applyGroupPositionOverride(rows, override);
    standings[group] = {
      complete,
      resolved: complete && rows.every((team) => !team.tie_pending),
      rows: rows.map((team, index) => ({ ...team, position: index + 1 })),
    };
  });
  return standings;
}

function getGroupStandings(realResults) {
  return calculateGroupStandings(realResults);
}

function rankGroupTeams(teams, matches) {
  const buckets = teams.reduce(
    (map, team) => map.set(team.points, [...(map.get(team.points) || []), team]),
    new Map(),
  );
  return [...buckets.entries()].sort((a, b) => b[0] - a[0]).flatMap(([, tied]) => {
    if (tied.length === 1) return tied;
    const tiedNames = new Set(tied.map((team) => team.team));
    const mini = calculateMiniTable(matches.filter(
      (match) => tiedNames.has(match.home_team) && tiedNames.has(match.away_team),
    ), tiedNames);
    const sorted = [...tied].sort((a, b) => {
      const aMini = mini.get(a.team);
      const bMini = mini.get(b.team);
      return bMini.points - aMini.points || bMini.gd - aMini.gd || bMini.gf - aMini.gf
        || b.gd - a.gd || b.gf - a.gf;
    });
    sorted.forEach((team, index) => {
      const next = sorted[index + 1];
      if (!next) return;
      const aMini = mini.get(team.team);
      const bMini = mini.get(next.team);
      if (aMini.points === bMini.points && aMini.gd === bMini.gd && aMini.gf === bMini.gf
        && team.gd === next.gd && team.gf === next.gf) {
        team.tie_pending = true;
        next.tie_pending = true;
      }
    });
    return sorted;
  });
}

function calculateMiniTable(matches, teams) {
  const mini = new Map([...teams].map((team) => [team, { points: 0, gf: 0, gc: 0, gd: 0 }]));
  matches.forEach((match) => {
    const home = mini.get(match.home_team);
    const away = mini.get(match.away_team);
    home.gf += numericScore(match.home_score);
    home.gc += numericScore(match.away_score);
    away.gf += numericScore(match.away_score);
    away.gc += numericScore(match.home_score);
    if (match.home_score > match.away_score) home.points += 3;
    else if (match.away_score > match.home_score) away.points += 3;
    else { home.points += 1; away.points += 1; }
  });
  mini.forEach((team) => { team.gd = team.gf - team.gc; });
  return mini;
}

function applyGroupPositionOverride(rows, override) {
  const order = Array.isArray(override)
    ? override
    : Object.entries(override).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, team]) => team);
  rows.sort((a, b) => {
    const aIndex = order.findIndex((team) => compareTeams(team, a.team));
    const bIndex = order.findIndex((team) => compareTeams(team, b.team));
    return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
  });
  rows.forEach((team) => { team.tie_pending = false; });
}

function calculateBestThirdTeams(groupStandings) {
  if (!GROUPS.every((group) => groupStandings[group]?.complete)) {
    return { resolved: false, teams: [], reason: "Grupos pendientes" };
  }
  const thirds = GROUPS.map((group) => ({ ...groupStandings[group].rows[2], group }));
  const sorted = [...thirds].sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
  const boundary = sorted[7];
  const next = sorted[8];
  const unresolvedBoundary = boundary && next
    && boundary.points === next.points && boundary.gd === next.gd && boundary.gf === next.gf;
  if (unresolvedBoundary && !(state.qualificationOverrides?.best_thirds?.length)) {
    return { resolved: false, teams: [], reason: "Clasificación pendiente" };
  }
  const overridden = state.qualificationOverrides?.best_thirds;
  return { resolved: true, teams: overridden?.length ? overridden : sorted.slice(0, 8) };
}

function resolveControlMatches(realResults) {
  return buildOfficialFixture(realResults);
}

function buildOfficialFixture(realResults) {
  const standings = calculateGroupStandings(realResults);
  const resolvedById = new Map();
  return (realResults?.matches ?? []).map((sourceMatch) => {
    const match = { ...sourceMatch };
    if (isKnockoutPhase(match.phase)) {
      const bracketMatch = state.knockoutBracket.matches.find((item) => item.match_id === match.match_id);
      const home = resolveBracketSource(bracketMatch?.home_source, standings, resolvedById, match.match_id);
      const away = resolveBracketSource(bracketMatch?.away_source, standings, resolvedById, match.match_id);
      match.home_team = match.home_team || home.team;
      match.away_team = match.away_team || away.team;
      match.home_slot = home.label;
      match.away_slot = away.label;
      if (match.home_team && match.away_team) match.match_key = deriveMatchKey(match);
    }
    resolvedById.set(match.match_id, match);
    return match;
  });
}

function resolveOfficialFixtureMatch(matchId) {
  const match = buildOfficialFixture(state.realResults).find((item) => item.match_id === Number(matchId));
  return {
    ...match,
    home_label: match?.home_team || match?.home_slot || "Por definir",
    away_label: match?.away_team || match?.away_slot || "Por definir",
  };
}

function resolveBracketSource(source, standings, resolvedById, targetMatchId) {
  if (!source) return { team: null, label: "Por definir" };
  if (source.type === "group_position") {
    return { team: resolveGroupPosition(source.group, source.position, standings), label: `${source.position}° Grupo ${source.group}` };
  }
  if (source.type === "best_third") {
    return { team: resolveBestThirdSlot(targetMatchId), label: `Mejor 3° ${source.groups.join("/")}` };
  }
  if (source.type === "winner_of") return { team: resolveWinner(source.match_id, resolvedById), label: `Ganador partido ${source.match_id}` };
  if (source.type === "loser_of") return { team: resolveLoser(source.match_id, resolvedById), label: `Perdedor semifinal ${source.match_id}` };
  return { team: null, label: "Por definir" };
}

function resolveGroupPosition(group, position, standings = calculateGroupStandings(state.realResults)) {
  const groupStanding = standings[group];
  if (!groupStanding?.complete || !groupStanding.resolved) return null;
  return groupStanding.rows[position - 1]?.team || null;
}

function resolveWinner(matchId, resolvedById) {
  const match = resolvedById.get(Number(matchId));
  return match?.status === "finished" ? getQualifiedTeam(match) : null;
}

function resolveLoser(matchId, resolvedById) {
  const match = resolvedById.get(Number(matchId));
  const winner = match?.status === "finished" ? getQualifiedTeam(match) : null;
  if (!winner) return null;
  return compareTeams(winner, match.home_team) ? match.away_team : match.home_team;
}

function resolveBestThirdSlot(matchId) {
  const override = state.qualificationOverrides?.round_of_32_assignments?.[String(matchId)];
  if (override) return override;
  if (!state.bestThirdMatrix?.implemented) return null;
  const standings = calculateGroupStandings(state.realResults);
  const bestThirds = calculateBestThirdTeams(standings);
  if (!bestThirds.resolved) return null;
  const key = bestThirds.teams.map((team) => team.group || team).sort().join("");
  return state.bestThirdMatrix.assignments?.[key]?.[String(matchId)] || null;
}

function getOfficialMatchLabel(matchId) {
  const match = resolveOfficialFixtureMatch(matchId);
  return `${match.home_label} vs ${match.away_label}`;
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

  const predictedHomeScore = Number(prediction.home_score);
  const predictedAwayScore = Number(prediction.away_score);
  const realHomeScore = Number(realMatch.home_score);
  const realAwayScore = Number(realMatch.away_score);
  const outcomeCorrect = getMatchOutcome(prediction) === getMatchOutcome(realMatch);
  const predictedGoalDifference = predictedHomeScore - predictedAwayScore;
  const realGoalDifference = realHomeScore - realAwayScore;
  const correctGoalDifference = outcomeCorrect
    && predictedGoalDifference === realGoalDifference;
  const exactScore = predictedHomeScore === realHomeScore
    && predictedAwayScore === realAwayScore;

  if (outcomeCorrect) {
    result.details.outcome = true;
    result.points += rules.outcome ?? 0;
  }
  if (correctGoalDifference) {
    result.details.goal_difference = true;
    result.points += rules.goal_difference ?? 0;
  }
  if (exactScore) {
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
  const homeScore = numericScore(match.home_score);
  const awayScore = numericScore(match.away_score);
  if (homeScore > awayScore) return "1";
  if (awayScore > homeScore) return "2";
  return "X";
}

function getQualifiedTeam(match) {
  if (!match || match.phase === "group_stage" || !hasScore(match)) return null;
  const homeScore = numericScore(match.home_score);
  const awayScore = numericScore(match.away_score);
  if (homeScore > awayScore) return match.home_team;
  if (awayScore > homeScore) return match.away_team;
  if (!hasPenalties(match)) return null;
  if (match.home_penalties > match.away_penalties) return match.home_team;
  if (match.away_penalties > match.home_penalties) return match.away_team;
  return null;
}

function getGoalDifference(match) {
  return hasScore(match)
    ? numericScore(match.home_score) - numericScore(match.away_score)
    : null;
}

function collectControlWarnings() {
  if (!state.fixtureAvailable) return [];
  const warnings = [];
  if (!state.bestThirdMatrix?.implemented) {
    warnings.push("Asignación de mejores terceros pendiente");
  }
  resolveControlMatches(state.realResults).forEach((match) => {
    if (!match.match_key) {
      warnings.push(`Partido #${match.match_id}: Falta match_key`);
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

function getFilteredFixtureMatches() {
  return resolveControlMatches(state.realResults).filter((match) =>
    (state.selected.fixturePhase === "all" || match.phase === state.selected.fixturePhase)
    && (state.selected.fixtureGroup === "all" || match.group === state.selected.fixtureGroup)
    && (state.selected.fixtureStatus === "all" || match.status === state.selected.fixtureStatus)
  );
}

function numericScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isInteger(score) ? score : null;
}

function hasScore(match) {
  return numericScore(match?.home_score) !== null && numericScore(match?.away_score) !== null;
}

function hasPenalties(match) {
  return Number.isInteger(match?.home_penalties) && Number.isInteger(match?.away_penalties);
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

function formatDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("es", { weekday: "long", day: "2-digit", month: "short", year: "numeric" }).format(date);
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
function metricCard(label, value, note) { return `<article class="metric-card"><p class="metric-label">${label}</p><p class="metric-value">${escapeHtml(value)}</p><p class="metric-note">${note}</p></article>`; }
function honorItem(label, team) { return `<div class="honor-item"><span>${label}</span><strong>${renderTeamName(team)}</strong></div>`; }
function awardGroup(title, keys, awards = {}) { return `<section class="award-group"><h4>${title}</h4>${keys.map((key) => `<div class="award-row"><span>${AWARD_LABELS[key]}</span><strong>${escapeHtml(awards?.[key] || "Sin definir")}</strong></div>`).join("")}</section>`; }
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`; }
function emptyState(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
if (typeof document !== "undefined") init();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateMatchPoints,
    getGoalDifference,
    getMatchOutcome,
    getPredictionStatus,
    getPredictionStatusClass,
    calculateGroupStandings,
    calculateBestThirdTeams,
    resolveOfficialFixtureMatch,
    buildOfficialFixture,
    withPredictionMatchId,
    shouldShowFixturePenalties,
    getLocalDateKey,
    shiftDateKey,
    renderDashboardDailyMatches,
    parseTopScorersFromEspnStats,
    parseTopScorersFromEspnSummaries,
    mapEspnTeamName,
    setTestState: (values) => Object.assign(state, values),
  };
}
