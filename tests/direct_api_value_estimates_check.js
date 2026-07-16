#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const shared = fs.readFileSync(path.join(root, 'src/watchdog_shared.kujo'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/dashboard_server.kujo'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'src/dashboard.html'), 'utf8');

function contains(text, expected, message) {
	if (!text.includes(expected)) throw new Error(message + ': missing ' + expected);
}

contains(shared, '"glm-5.2:cloud": {"input": 1.40, "output": 4.40}', 'GLM cloud pricing');
contains(shared, '"kimi-k2.7-code:cloud": {"input": 0.95, "output": 4.00}', 'Kimi cloud pricing');
contains(shared, '"minimax-m3:cloud": {"input": 0.30, "output": 1.20}', 'MiniMax cloud pricing');
contains(shared, '"qwen3.5:397b-cloud": {"input": 0.60, "output": 3.60}', 'Qwen cloud pricing');
contains(server, 'if !has_key(body, "cost_usd") && watchdog_has_known_pricing(model_name)', 'Known external telemetry should infer omitted cost');
contains(server, 'watchdog_estimate_cost(model_name, input_tokens * 1.0, output_tokens * 1.0)', 'External telemetry estimator');
contains(shared, '0007_direct_api_cost_estimates', 'Historical zero-cost backfill migration');
contains(shared, 'WHERE cost_usd = 0 AND (input_tokens > 0 OR output_tokens > 0)', 'Backfill selection');
contains(shared, '0008_ai_chat_direct_api_reprice', 'Historical AI Chat repricing migration');
contains(dashboard, 'Est. API Value', 'Dashboard value label');
contains(dashboard, 'direct API equivalent', 'Dashboard estimate explanation');

console.log('direct_api_value_estimates_check: PASS');
