// Token Radar: Production entry for make.fun token-radar-01 (Node 22, standard library only).
// Fits log-log OLS model on 129 traded comps, cross-validates out of sample (LOO & Walk-forward),
// and ranks 262 eligible pre-token protocols with concrete costed farm plans.

import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, type Board, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) input = argv[++i]!;
    else if (argv[i] === '--output' && i + 1 < argv.length) output = argv[++i]!;
  }
  return { input, output };
}

function loadSnapshot(input: string): Snapshot {
  const path = statSync(input).isDirectory() ? join(input, 'snapshot.json') : input;
  return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
}

function fmtMetric(label: string, m: { n: number; medianRatio: number; medianAbsLog10: number; typicalMultiple: number; within2x: number }): string {
  return (
    `  ${label}: n=${m.n} median pred/actual=${m.medianRatio.toFixed(3)} ` +
    `median |log10 err|=${m.medianAbsLog10.toFixed(3)} typical multiple=${m.typicalMultiple.toFixed(2)}x ` +
    `within [0.5, 2]=${(m.within2x * 100).toFixed(1)}%`
  );
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snap = loadSnapshot(input);
  const board = buildBoard(snap);
  const issue = boardIssue(board, snap);
  if (issue !== null) {
    process.stderr.write(`token radar: board self-check failed: ${issue}\n`);
    process.exit(1);
  }

  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), JSON.stringify({ rows: board.rows }, null, 2) + '\n');
  writeFileSync(join(output, 'data.js'), `window.RADAR = ${JSON.stringify(board, null, 2)};\n`);

  const root = dirname(fileURLToPath(import.meta.url));
  for (const dir of ['dashboard', 'screenshots']) {
    const src = join(root, dir);
    if (existsSync(src)) cpSync(src, join(output, dir), { recursive: true });
  }

  const dossier = buildDossier(output, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(output, 'dossier.json'), dossier);

  const c = board.counts;
  const v = board.model.validation;
  const verdicts = new Map<string, number>();
  for (const r of board.rows) verdicts.set(r.verdict, (verdicts.get(r.verdict) ?? 0) + 1);

  const impliedSorted = board.rows.map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const mid = Math.floor(impliedSorted.length / 2);
  const medImplied =
    impliedSorted.length % 2 === 1
      ? impliedSorted[mid]
      : Math.round((impliedSorted[mid - 1]! + impliedSorted[mid]!) / 2);

  process.stdout.write(
    `token radar: board successfully generated\n` +
    `  as_of=${board.as_of} floor_usd=${board.floor_usd}\n` +
    `  scanned=${c.scanned} traded=${c.traded} pre-token=${c.preToken} board rows=${c.boardRows} set aside=${c.setAside}\n` +
    `  watchlist covered=${c.watchlistCovered}/${c.watchlist}\n` +
    `  model trained on=${board.model.trainedOn} protocols\n` +
    `validation:\n` +
    `${fmtMetric('held-out A (fold 0)', v.chosen.heldoutA)}\n` +
    `${fmtMetric('held-out B (fold 2)', v.chosen.heldoutB)}\n` +
    `${fmtMetric('walk-forward (first 70% by listing date)', v.chosen.walkForward)}\n` +
    `${fmtMetric('leave-one-out (LOO)', v.chosen.loo)}\n` +
    `${fmtMetric('growth variant held-out A', v.growthVariant.heldoutA)}\n` +
    `${fmtMetric('growth variant held-out B', v.growthVariant.heldoutB)}\n` +
    `  verdicts: FARM FIRST=${verdicts.get('FARM FIRST') ?? 0} FARM=${verdicts.get('FARM') ?? 0} ` +
    `WATCH=${verdicts.get('WATCH') ?? 0} SKIP=${verdicts.get('SKIP') ?? 0}\n` +
    `  median implied=$${medImplied.toLocaleString('en-US')}\n` +
    `  top row: #1 ${board.rows[0]!.name} (${board.rows[0]!.slug}) implied=$${board.rows[0]!.implied_value_usd.toLocaleString('en-US')} [${board.rows[0]!.verdict}]\n`
  );
}

main();
