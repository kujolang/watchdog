const fs = require('fs');
const path = require('path');

const docPath = path.join(__dirname, '..', 'docs', 'ENTERPRISE_DEPLOYMENT_ARCHITECTURE.md');
const source = fs.readFileSync(docPath, 'utf8');

function assertContains(snippet, message) {
	if (!source.includes(snippet)) {
		throw new Error(message + '\nMissing snippet: ' + snippet);
	}
}

assertContains('# Watchdog Enterprise Deployment Architecture', 'doc should include enterprise architecture title');
assertContains('## 2. Single-node pattern', 'doc should include single-node architecture section');
assertContains('## 3. Scaled pattern', 'doc should include scaled architecture section');
assertContains('## 4. TLS and auth boundary reference', 'doc should include TLS/auth boundary section');
assertContains('## 5. Retention and lifecycle pattern', 'doc should include retention strategy section');
assertContains('```mermaid', 'doc should include Mermaid diagrams');
assertContains('WDG_API_AUTH_MODE=token', 'doc should include API auth configuration example');
assertContains('WDG_PROXY_AUTHZ_MODE=token', 'doc should include proxy auth configuration example');
assertContains('/api/admin/prune', 'doc should include retention prune commands');
assertContains('/api/admin/diagnostics', 'doc should include diagnostics command example');

console.log('enterprise_architecture_doc_check: PASS');
