import {createHash, randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat, mkdir, open, readdir, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';

const SCHEMA_VERSION = 'watchdog.telemetry.v2';
const MAX_BATCH_BYTES = 512 * 1024;
const SPOOL_FILENAME = /^\d{13}-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_FILES = 1000;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function boundedInt(value, fallback, min, max) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function endpointUrl(baseUrl) {
	const url = new URL(String(baseUrl));
	if (url.username || url.password || url.search || url.hash) throw new Error('Watchdog telemetry endpoint cannot contain credentials, query, or fragment');
	const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Watchdog telemetry requires HTTPS or explicit loopback HTTP');
	return new URL('/telemetry/v2/batches', url);
}

function metadataOnlyBatch(input) {
	if (!input || input.schema_version !== SCHEMA_VERSION || !Array.isArray(input.records) || input.records.length < 1 || input.records.length > 100) {
		throw new Error('Expected a watchdog.telemetry.v2 batch with 1-100 records');
	}
	return {
		...structuredClone({...input, records: []}),
		records: input.records.map((source) => {
			const record = structuredClone({...source, content: []});
			const transformations = Array.isArray(record.privacy?.transformations) ? record.privacy.transformations.slice(0, 31) : [];
			if (Array.isArray(source.content) && source.content.length) transformations.push('content_dropped_by_shared_client');
			record.content = [];
			record.privacy = {content_mode: 'off', policy_version: 'watchdog.privacy.v1', transformations};
			return record;
		}),
	};
}

function encodeBatch(batch) {
	const encoded = JSON.stringify(batch);
	if (Buffer.byteLength(encoded) > MAX_BATCH_BYTES) {
		throw new Error('Telemetry batch exceeds the 512 KiB client limit');
	}
	return encoded;
}

async function readSpoolBatch(file) {
	const stats = await file.stat();
	if (!stats.isFile() || stats.size > MAX_BATCH_BYTES) return null;
	const buffer = Buffer.allocUnsafe(stats.size + 1);
	let offset = 0;
	while (offset < buffer.length) {
		const {bytesRead} = await file.read(buffer, offset, buffer.length - offset, offset);
		if (bytesRead === 0) break;
		offset += bytesRead;
	}
	return offset === stats.size ? buffer.toString('utf8', 0, offset) : null;
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
		const entries = await readdir(this.directory, {withFileTypes: true});
		return entries.filter((entry) => entry.isFile() && SPOOL_FILENAME.test(entry.name))
			.map((entry) => entry.name).sort();
	}

	async append(batch) {
		const operation = async () => {
			const encoded = encodeBatch(batch);
			const bytes = Buffer.byteLength(encoded);
			if (bytes > this.maxBytes) throw new Error('Telemetry batch exceeds configured spool byte limit');
			await mkdir(this.directory, {recursive: true, mode: 0o700});
			const name = `${String(Date.now()).padStart(13, '0')}-${randomUUID()}.json`;
			const finalPath = join(this.directory, name);
			const tempPath = `${finalPath}.${randomUUID()}.tmp`;
			const file = await open(tempPath, 'wx', 0o600);
			try {
				try {
					await file.writeFile(encoded);
				} finally {
					await file.close();
				}
				await rename(tempPath, finalPath);
			} catch (error) {
				await rm(tempPath, {force: true});
				throw error;
			}
			await this.enforceBounds(name);
			return finalPath;
		};
		const result = this.writeChain.then(operation);
		// Track completion for later operations. The submitter still sees a write error.
		this.writeChain = result.catch(() => {});
		return result;
	}

	async enforceBounds(newestName) {
		const now = Date.now();
		const entries = [];
		let newestEntry;
		for (const name of await this.files()) {
			const path = join(this.directory, name);
			let details;
			try {
				details = await lstat(path);
			} catch (error) {
				if (error.code === 'ENOENT') continue;
				throw error;
			}
			if (!details.isFile()) continue;
			const entry = {path, size: details.size};
			if (name === newestName) {
				newestEntry = entry;
			} else if (now - details.mtimeMs > this.maxAgeMs) {
				await rm(path, {force: true});
			} else {
				entries.push(entry);
			}
		}
		if (newestEntry) entries.push(newestEntry);
		let bytes = entries.reduce((total, entry) => total + entry.size, 0);
		for (let i = 0; entries.length - i > this.maxFiles || bytes > this.maxBytes; i++) {
			bytes -= entries[i].size;
			await rm(entries[i].path, {force: true});
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

	async function send(encoded) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(endpoint, {
				method: 'POST', redirect: 'manual', signal: controller.signal,
				headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
				body: encoded,
			});
			return {ok: response.ok, status: response.status, retryable: response.status === 408 || response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403};
		} catch (error) {
			return {ok: false, status: 0, retryable: true, error: String(error)};
		} finally {
			// Delivery is status-only; release unread/streaming response bodies now.
			controller.abort();
			clearTimeout(timer);
		}
	}

	async function flushOnce() {
		await spool.writeChain;
		await spool.initialize();
		let sent = 0;
		let retained = 0;
		for (const name of await spool.files()) {
			const path = join(spool.directory, name);
			let text;
			try {
				const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
				try {
					text = await readSpoolBatch(file);
				} finally {
					await file.close();
				}
			} catch (error) {
				if (error.code === 'ENOENT' || error.code === 'ELOOP') continue;
				throw error;
			}
			if (text === null) {
				await rm(path, {force: true});
				continue;
			}
			try { JSON.parse(text); } catch (error) {
				if (!(error instanceof SyntaxError)) throw error;
				await rm(path, {force: true});
				continue;
			}
			const result = await send(text);
			if (result.ok) { await rm(path, {force: true}); sent += 1; continue; }
			if (!result.retryable) { await rm(path, {force: true}); continue; }
			retained += 1;
			break;
		}
		return {sent, retained};
	}

	let flushing = null;
	function flush() {
		if (!flushing) flushing = flushOnce().finally(() => { flushing = null; });
		return flushing;
	}

	async function submit(input) {
		const batch = metadataOnlyBatch(input);
		const result = await send(encodeBatch(batch));
		if (result.ok) return {...result, spooled: false};
		if (result.retryable) { await spool.append(batch); return {...result, spooled: true}; }
		return {...result, spooled: false};
	}

	return {schemaVersion: SCHEMA_VERSION, endpoint: endpoint.toString(), spool, submit, flush};
}
