const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveKujoBin() {
	const fromEnv = (process.env.KUJO_BIN || '').trim();
	if (fromEnv) {
		return fromEnv;
	}
	return 'kujo';
}

function verifyKujoBin(bin, contextLabel = 'test run') {
	const normalized = String(bin || '').trim();
	if (!normalized) {
		throw new Error('KUJO_BIN is empty for ' + contextLabel);
	}

	const looksLikePath = normalized.includes('/') || normalized.includes('\\');
	if (looksLikePath) {
		const resolvedPath = path.resolve(normalized);
		if (!fs.existsSync(resolvedPath)) {
			throw new Error('Configured KUJO_BIN path does not exist: ' + resolvedPath);
		}
	}

	const probe = spawnSync(normalized, ['run', '--help'], { encoding: 'utf8' });
	if (probe.error) {
		throw new Error('Failed to execute KUJO_BIN for ' + contextLabel + ': ' + probe.error.message);
	}
	if (probe.status !== 0) {
		const stderr = String(probe.stderr || '').trim();
		const stdout = String(probe.stdout || '').trim();
		throw new Error(
			'Invalid Kujo runtime for ' +
				contextLabel +
				'. Expected a binary supporting "run" subcommand.\n' +
				'KUJO_BIN=' +
				normalized +
				'\n' +
				(stdout ? 'stdout: ' + stdout + '\n' : '') +
				(stderr ? 'stderr: ' + stderr : '')
		);
	}
}

function resolveKujoBinOrThrow(contextLabel = 'test run') {
	const bin = resolveKujoBin();
	verifyKujoBin(bin, contextLabel);
	return bin;
}

module.exports = {
	resolveKujoBin,
	verifyKujoBin,
	resolveKujoBinOrThrow,
};
