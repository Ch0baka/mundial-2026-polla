const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = require("../app.js");
const realResults = JSON.parse(fs.readFileSync("data/real_results.json", "utf8"));
const scoringRules = JSON.parse(fs.readFileSync("data/scoring_rules.json", "utf8"));
const knockoutBracket = JSON.parse(fs.readFileSync("data/knockout_bracket.json", "utf8"));
const qualificationOverrides = JSON.parse(fs.readFileSync("data/qualification_overrides.json", "utf8"));
const bestThirdMatrix = JSON.parse(fs.readFileSync("data/best_third_matrix.json", "utf8"));

function setResults(matches) {
  app.setTestState({
    realResults: { ...realResults, matches },
    scoringRules,
    knockoutBracket,
    qualificationOverrides,
    bestThirdMatrix,
  });
}

function scoreMatch(home, away, status = "finished") {
  return {
    match_id: 1, phase: "group_stage", status,
    home_team: "Local", away_team: "Visita", home_score: home, away_score: away,
  };
}

const pending = scoreMatch(null, null, "scheduled");
const live = scoreMatch(1, 0, "live");
assert.equal(app.getPredictionStatus(app.calculateMatchPoints(scoreMatch(2, 0), pending, scoringRules), pending), "pending");
assert.equal(app.getPredictionStatus(app.calculateMatchPoints(scoreMatch(2, 0), live, scoringRules), live), "pending");
assert.equal(app.getPredictionStatus(app.calculateMatchPoints(scoreMatch(2, 0), scoreMatch(2, 0), scoringRules), scoreMatch(2, 0)), "exact");
assert.equal(app.getPredictionStatus(app.calculateMatchPoints(scoreMatch(3, 1), scoreMatch(2, 0), scoringRules), scoreMatch(2, 0)), "partial");
assert.equal(app.getPredictionStatus(app.calculateMatchPoints(scoreMatch(0, 1), scoreMatch(2, 0), scoringRules), scoreMatch(2, 0)), "zero");
assert.equal(app.shouldShowFixturePenalties([{ phase: "group_stage" }]), false);
assert.equal(app.shouldShowFixturePenalties([{ phase: "group_stage" }, { phase: "round_of_32" }]), true);
assert.equal(app.getLocalDateKey(new Date("2026-06-19T12:00:00")), "2026-06-19");
assert.equal(app.shiftDateKey("2026-06-19", -1), "2026-06-18");

setResults(realResults.matches);
let official = app.resolveOfficialFixtureMatch(73);
assert.equal(official.home_label, "2° Grupo A");
assert.equal(official.away_label, "2° Grupo B");
official = app.resolveOfficialFixtureMatch(90);
assert.equal(official.home_label, "Ganador partido 73");
assert.equal(official.away_label, "Ganador partido 75");

const completedGroups = realResults.matches.map((match) => {
  if (match.phase !== "group_stage" || !["A", "B", "C", "F"].includes(match.group)) return { ...match };
  return { ...match, status: "finished", home_score: 1, away_score: 0 };
});
setResults(completedGroups);
const standings = app.calculateGroupStandings({ ...realResults, matches: completedGroups });
official = app.resolveOfficialFixtureMatch(73);
assert.equal(official.home_team, standings.A.rows[1].team);
assert.equal(official.away_team, standings.B.rows[1].team);

const completedPriorMatches = completedGroups.map((match) => {
  if (match.match_id === 73) return { ...match, status: "finished", home_team: "Equipo 73A", away_team: "Equipo 73B", home_score: 2, away_score: 0 };
  if (match.match_id === 75) return { ...match, status: "finished", home_team: "Equipo 75A", away_team: "Equipo 75B", home_score: 0, away_score: 1 };
  return match;
});
setResults(completedPriorMatches);
official = app.resolveOfficialFixtureMatch(90);
assert.equal(official.home_team, "Equipo 73A");
assert.equal(official.away_team, "Equipo 75B");

const penaltiesReal = {
  match_id: 73, phase: "round_of_32", status: "finished",
  home_team: "Equipo A", away_team: "Equipo B",
  home_score: 1, away_score: 1, home_penalties: 4, away_penalties: 3,
};
const penaltiesPrediction = {
  phase: "round_of_32", home_team: "Equipo A", away_team: "Equipo B",
  home_score: 1, away_score: 1, home_penalties: 4, away_penalties: 3,
};
assert.equal(app.calculateMatchPoints(penaltiesPrediction, penaltiesReal, scoringRules).details.exact_score, true);

setResults([
  { match_id: 1, phase: "group_stage", group: "A", date: "2026-06-18", time: "15:00", status: "finished", home_team: "México", away_team: "Sudáfrica", home_score: 2, away_score: 0 },
  { match_id: 2, phase: "group_stage", group: "A", date: "2026-06-19", time: "18:00", status: "scheduled", home_team: "Corea del Sur", away_team: "República Checa", home_score: null, away_score: null },
]);
const dailyDashboard = app.renderDashboardDailyMatches(new Date("2026-06-19T12:00:00"));
assert.match(dailyDashboard, /Partidos de hoy/);
assert.match(dailyDashboard, /Resultados de ayer/);
assert.match(dailyDashboard, /Corea del Sur/);
assert.match(dailyDashboard, /México/);

console.log("OK estados visuales: pending, live, exact, partial y zero");
console.log("OK Fixture: penales ocultos en fase de grupos");
console.log("OK M73: slots oficiales y posiciones reales resueltas");
console.log("OK M90: ganadores reales de M73 y M75");
console.log("OK eliminatoria finalizada con penales");
console.log("OK Dashboard: partidos de hoy y resultados de ayer");
