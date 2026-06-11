#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_PROFILES = ['quick', 'soak'];

function parseArgs(argv) {
	const out = {
		profiles: DEFAULT_PROFILES.slice(),
		jsonOut: '',
		fixture: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const token = String(argv[i] || '');
		if (token.startsWith('--profiles=')) {
			const raw = token.slice('--profiles='.length);
			const parts = raw.split(',').map(v => String(v).trim()).filter(Boolean);
			if (parts.length > 0) out.profiles = parts;
		} else if (token.startsWith('--json-out=')) {
			out.jsonOut = token.slice('--json-out='.length).trim();
		} else if (token === '--fixture') {
			out.fixture = true;
		}
	}

	return out;
}

function parseLoadSummaryLine(stdout) {
	const line = String(stdout || '')
		.split('\n')
		.map(l => l.trim())
		.find(l => l.startsWith('load_soak_suite profile='));

	if (!line) {
		throw new Error('Benchmark output missing load_soak_suite summary line');
	}

	const regex = /^load_soak_suite profile=([^\s]+) total=(\d+) concurrency=(\d+) rps=([\d.]+) p95_ms=(\d+) baseline_stats_ms=(\d+) baseline_requests_ms=(\d+) baseline_charts_ms=(\d+) stats_ms=(\d+) requests_ms=(\d+) charts_ms=(\d+) db_size=(\d+) growth_per_request=([\d.]+)/;
	const match = line.match(regex);
	if (!match) {
		throw new Error('Benchmark summary line did not match expected schema: ' + line);
	}

	return {
		profile: match[1],
		total: Number(match[2]),
		concurrency: Number(match[3]),
		rps: Number(match[4]),
		p95_ms: Number(match[5]),
		baseline_stats_ms: Number(match[6]),
		baseline_requests_ms: Number(match[7]),
		baseline_charts_ms: Number(match[8]),
		stats_ms: Number(match[9]),
		requests_ms: Number(match[10]),
		charts_ms: Number(match[11]),
		db_size: Number(match[12]),
		growth_per_request: Number(match[13]),
		raw_summary_line: line,
	};
}

function fixtureMetrics(profile) {
	if (profile === 'quick') {
		return {
			profile: 'quick',
			total: 60,
			concurrency: 6,
			rps: 16.2,
			p95_ms: 420,
			baseline_stats_ms: 3,
			baseline_requests_ms: 5,
			baseline_charts_ms: 2,
			stats_ms: 3,
			requests_ms: 11,
			charts_ms: 2,
			db_size: 147456,
			growth_per_request: 1092.27,
			raw_summary_line: 'fixture:quick',
		};
	}

	if (profile === 'soak') {
		return {
			profile: 'soak',
			total: 300,
			concurrency: 8,
			rps: 14.9,
			p95_ms: 510,
			baseline_stats_ms: 4,
			baseline_requests_ms: 7,
			baseline_charts_ms: 2,
			stats_ms: 4,
			requests_ms: 14,
			charts_ms: 2,
			db_size: 393216,
			growth_per_request: 1001.32,
			raw_summary_line: 'fixture:soak',
		};
	}

	return {
		profile,
		total: 120,
		concurrency: 4,
		rps: 10,
		p95_ms: 700,
		baseline_stats_ms: 6,
		baseline_requests_ms: 8,
		baseline_charts_ms: 3,
		stats_ms: 6,
		requests_ms: 16,
		charts_ms: 3,
		db_size: 262144,
		growth_per_request: 900,
		raw_summary_line: 'fixture:generic',
	};
}

function runProfile(profile, useFixture) {
	if (useFixture) {
		return {
			status: 'ok',
			metrics: fixtureMetrics(profile),
			stdout: '',
			stderr: '',
			exit_code: 0,
		};
	}

	const child = spawnSync(process.execPath, ['tests/load_soak_suite.js'], {
		cwd: ROOT,
		env: {
			...process.env,
			WDG_LOAD_PROFILE: profile,
		},
		encoding: 'utf8',
	});

	const stdout = String(child.stdout || '');
	const stderr = String(child.stderr || '');
	const exitCode = typeof child.status === 'number' ? child.status : 1;

	if (exitCode !== 0) {
		return {
			status: 'failed',
			metrics: null,
			stdout,
			stderr,
			exit_code: exitCode,
		};
	}

	return {
		status: 'ok',
		metrics: parseLoadSummaryLine(stdout),
		stdout,
		stderr,
		exit_code: exitCode,
	};
}

function percentDelta(baseValue, nextValue) {
	if (baseValue === 0) return 0;
	return ((nextValue - baseValue) / baseValue) * 100.0;
}

function buildReport(profiles) {
	const now = new Date().toISOString();
	const baseline = profiles.length > 0 ? profiles[0] : null;
	const comparisons = [];

	for (let i = 1; i < profiles.length; i += 1) {
		const current = profiles[i];
		if (!baseline || !baseline.metrics || !current.metrics) {
			continue;
		}

		comparisons.push({
			profile: current.profile,
			delta_rps_pct: Number(percentDelta(baseline.metrics.rps, current.metrics.rps).toFixed(2)),
			delta_p95_ms_pct: Number(percentDelta(baseline.metrics.p95_ms, current.metrics.p95_ms).toFixed(2)),
			delta_growth_per_request_pct: Number(percentDelta(baseline.metrics.growth_per_request, current.metrics.growth_per_request).toFixed(2)),
		});
	}

	return {
		generated_at: now,
		source: 'tests/load_soak_suite.js',
		baseline_profile: baseline ? baseline.profile : '',
		profiles,
		trend: {
			comparisons,
		},
	};
}

function printHumanSummary(report) {
	console.log('Watchdog benchmark summary');
	console.log('generated_at=' + report.generated_at);
	console.log('baseline=' + report.baseline_profile);
	console.log('');
	console.log('profile status total concurrency rps p95_ms growth_per_request');
	for (const item of report.profiles) {
		if (item.status !== 'ok' || !item.metrics) {
			console.log(item.profile + ' failed - - - - -');
			continue;
		}
		console.log(
			item.profile +
				' ' + item.status +
				' ' + item.metrics.total +
				' ' + item.metrics.concurrency +
				' ' + item.metrics.rps.toFixed(2) +
				' ' + item.metrics.p95_ms +
				' ' + item.metrics.growth_per_request.toFixed(2)
		);
	}

	if (report.trend.comparisons.length > 0) {
		console.log('');
		console.log('trend_vs_' + report.baseline_profile + ' profile delta_rps_pct delta_p95_ms_pct delta_growth_per_request_pct');
		for (const trend of report.trend.comparisons) {
			console.log(
				report.baseline_profile +
				'->' + trend.profile +
				' ' + trend.profile +
				' ' + trend.delta_rps_pct.toFixed(2) +
				' ' + trend.delta_p95_ms_pct.toFixed(2) +
				' ' + trend.delta_growth_per_request_pct.toFixed(2)
			);
		}
	}
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const profiles = [];
	let hasFailure = false;

	for (const profile of args.profiles) {
		const result = runProfile(profile, args.fixture);
		if (result.status !== 'ok') {
			hasFailure = true;
		}
		profiles.push({
			profile,
			status: result.status,
			metrics: result.metrics,
			exit_code: result.exit_code,
			stderr: result.status === 'ok' ? '' : result.stderr,
		});
	}

	const report = buildReport(profiles);
	printHumanSummary(report);

	if (args.jsonOut) {
		const outPath = path.isAbsolute(args.jsonOut) ? args.jsonOut : path.join(ROOT, args.jsonOut);
		fs.mkdirSync(path.dirname(outPath), { recursive: true });
		fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
		console.log('json_report=' + outPath);
	}

	console.log('json_summary=' + JSON.stringify(report));

	if (hasFailure) {
		process.exit(1);
	}
}

main();
