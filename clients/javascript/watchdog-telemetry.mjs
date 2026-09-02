import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const SCHEMA_VERSION = 'watchdog.telemetry.v2';
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_FILES = 1000;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function boundedInt(value, fallback, min, max) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function endpointUrl(baseUrl) {
	const url = new URL('/telemetry/v2/batches', String(baseUrl));
	if (url.username || url.password || url.search || url.hash) throw new Error('Watchdog telemetry endpoint cannot contain credentials, query, or fragment');
	const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Watchdog telemetry requires HTTPS or explicit loopback HTTP');
	return url;
}

function metadataOnlyBatch(input) {
	if (!input || input.schema_version !== SCHEMA_VERSION || !Array.isArray(input.records) || input.records.length < 1 || input.records.length > 100) {
		throw new Error('Expected a watchdog.telemetry.v2 batch with 1-100 records');
	}
	return {
		...structuredClone(input),
		records: input.records.map((source) => {
			const record = structuredClone(source);
			const transformations = Array.isArray(record.privacy?.transformations) ? record.privacy.transformations.slice(0, 31) : [];
			if (Array.isArray(record.content) && record.content.length) transformations.push('content_dropped_by_shared_client');
			record.content = [];
			record.privacy = {content_mode: 'off', policy_version: 'watchdog.privacy.v1', transformations};
			return record;
		}),
	};
}

class DurableSpool {
	constructor(options) {
		this.directory = options.directory;
		this.maxBytes = boundedInt(options.maxBytes, DEFAULT_MAX_BYTES, 1024, 1024 * 1024 * 1024);
		this.maxFiles = boundedInt(options.maxFiles, DEFAULT_MAX_FILES, 1, 100000);
		this.maxAgeMs = boundedInt(options.maxAgeMs, DEFAULT_MAX_AGE_MS, 1000, 30 * 24 * 60 * 60 * 1000);
		this.writeChain = Promise.resolve();
	}

	async initialize() {
		await mkdir(this.directory, {recursive: true, mode: 0o700});
		await this.enforceBounds();
	}

	async files() {
		const names = await readdir(this.directory).catch(() => []);
		return names.filter((name) => name.endsWith('.json')).sort();
	}

	async append(batch) {
		const operation = async () => {
			await this.initialize();
			const encoded = JSON.stringify(batch);
			if (Buffer.byteLength(encoded) > 512 * 1024) throw new Error('Telemetry batch exceeds 512 KiB client spool bound');
			const name = `${String(Date.now()).padStart(13, '0')}-${randomUUID()}.json`;
			const finalPath = join(this.directory, name);
			const tempPath = `${finalPath}.${randomUUID()}.tmp`;
			await writeFile(tempPath, encoded, {mode: 0o600, flag: 'wx'});
			await rename(tempPath, finalPath);
			await this.enforceBounds();
			return finalPath;
		};
		this.writeChain = this.writeChain.then(operation, operation);
		return this.writeChain;
	}

	async enforceBounds() {
		const now = Date.now();
		const entries = [];
		for (const name of await this.files()) {
			const path = join(this.directory, name);
			const details = await stat(path).catch(() => null);
			if (!details) continue;
			if (now - details.mtimeMs > this.maxAgeMs) {
				await rm(path, {force: true});
				continue;
			}
			entries.push({name, path, size: details.size});
		}
		let bytes = entries.reduce((total, entry) => total + entry.size, 0);
		while (entries.length > this.maxFiles || bytes > this.maxBytes) {
			const oldest = entries.shift();
			if (!oldest) break;
			bytes -= oldest.size;
			await rm(oldest.path, {force: true});
		}
	}
}

export function createWatchdogTelemetryClient(options = {}) {
	const endpoint = endpointUrl(options.baseUrl || 'http://127.0.0.1:7700');
	const endpointHash = createHash('sha256').update(endpoint.origin).digest('hex').slice(0, 16);
	const spool = new DurableSpool({
		directory: join(options.spoolDirectory || '.watchdog-telemetry-spool', endpointHash),
		maxBytes: options.maxSpoolBytes,
		maxFiles: options.maxSpoolFiles,
		maxAgeMs: options.maxSpoolAgeMs,
	});
	const timeoutMs = boundedInt(options.timeoutMs, 3000, 100, 30000);
	const token = options.token ? String(options.token) : '';

	async function send(batch) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(endpoint, {
				method: 'POST', redirect: 'manual', signal: controller.signal,
				headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
				body: JSON.stringify(batch),
			});
			return {ok: response.ok, status: response.status, retryable: response.status === 408 || response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403};
		} catch (error) {
			return {ok: false, status: 0, retryable: true, error: String(error)};
		} finally {
			clearTimeout(timer);
		}
	}

	async function flush() {
		await spool.writeChain;
		await spool.initialize();
		let sent = 0;
		let retained = 0;
		for (const name of await spool.files()) {
			const path = join(spool.directory, name);
			let batch;
			try { batch = JSON.parse(await readFile(path, 'utf8')); } catch { await rm(path, {force: true}); continue; }
			const result = await send(batch);
			if (result.ok) { await rm(path, {force: true}); sent += 1; continue; }
			if (!result.retryable) { await rm(path, {force: true}); continue; }
			retained += 1;
			break;
		}
		return {sent, retained};
	}

	async function submit(input) {
		const batch = metadataOnlyBatch(input);
		const result = await send(batch);
		if (result.ok) return {...result, spooled: false};
		if (result.retryable) { await spool.append(batch); return {...result, spooled: true}; }
		return {...result, spooled: false};
	}

	return {schemaVersion: SCHEMA_VERSION, endpoint: endpoint.toString(), spool, submit, flush};
}
