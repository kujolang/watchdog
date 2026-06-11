const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function readText(relPath) {
	const fullPath = path.join(ROOT, relPath);
	assert.ok(fs.existsSync(fullPath), relPath + ' should exist');
	return fs.readFileSync(fullPath, 'utf8');
}

function assertIncludesAll(text, needles, label) {
	for (const needle of needles) {
		assert.ok(text.includes(needle), label + ' missing required text: ' + needle);
	}
}

function run() {
	const security = readText('SECURITY.md');
	assertIncludesAll(
		security,
		['# Security Policy', 'GitHub Security Advisory', 'Response Targets', 'Disclosure Policy'],
		'SECURITY.md'
	);

	const contributing = readText('CONTRIBUTING.md');
	assertIncludesAll(
		contributing,
		['# Contributing', 'tests/*.js', 'Pull Request Expectations', 'Security Changes'],
		'CONTRIBUTING.md'
	);

	const codeowners = readText('.github/CODEOWNERS');
	assertIncludesAll(codeowners, ['* @robertdevore', '/src/dashboard_server.kujo @robertdevore'], '.github/CODEOWNERS');

	const changelog = readText('CHANGELOG.md');
	assertIncludesAll(changelog, ['# Changelog', '## [Unreleased]', '## [0.1.0] - 2026-05-22'], 'CHANGELOG.md');

	const releaseChecklist = readText('docs/RELEASE_CHECKLIST.md');
	assertIncludesAll(
		releaseChecklist,
		['# Release Checklist', '## Versioning Policy', '## Pre-Release', '## Release', '## Post-Release'],
		'docs/RELEASE_CHECKLIST.md'
	);

	const readme = readText('README.md');
	assertIncludesAll(
		readme,
		[
			'docs/ENTERPRISE_RELEASE_LOOP_CHECKLIST.md',
			'docs/RELEASE_CHECKLIST.md',
			'SECURITY.md',
			'CONTRIBUTING.md',
			'CHANGELOG.md',
		],
		'README.md'
	);

	console.log('governance_release_docs_check: PASS');
}

try {
	run();
} catch (err) {
	console.error('governance_release_docs_check: FAIL');
	console.error(err && err.stack ? err.stack : err);
	process.exit(1);
}
