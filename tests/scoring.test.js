const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { calculateMatchPoints } = require("../app.js");

const scoringRules = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/scoring_rules.json"), "utf8"),
);

function match(homeScore, awayScore, overrides = {}) {
  return {
    match_id: 1,
    phase: "group_stage",
    status: "finished",
    home_team: "México",
    away_team: "Sudáfrica",
    home_score: homeScore,
    away_score: awayScore,
    ...overrides,
  };
}

const cases = [
  ["2-1 vs 2-0", match(2, 1), match(2, 0), 10],
  ["3-2 vs 2-0", match(3, 2), match(2, 0), 10],
  ["3-1 vs 2-0", match(3, 1), match(2, 0), 20],
  ["2-0 vs 2-0", match(2, 0), match(2, 0), 30],
  ["0-1 vs 2-0", match(0, 1), match(2, 0), 0],
  ["1-1 vs 0-0", match(1, 1), match(0, 0), 20],
  ["0-0 vs 0-0", match(0, 0), match(0, 0), 30],
  ["1-2 vs 0-2", match(1, 2), match(0, 2), 10],
  ["1-3 vs 0-2", match(1, 3), match(0, 2), 20],
  ["numeric strings", match("3", "1"), match("2", "0"), 20],
];

for (const [name, prediction, realMatch, expected] of cases) {
  const result = calculateMatchPoints(prediction, realMatch, scoringRules);
  assert.equal(result.points, expected, `${name}: puntaje incorrecto`);
  console.log(`OK ${name}: ${result.points}`);
}
