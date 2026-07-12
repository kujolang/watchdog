# External Blockers

blockers:
  - id: governance-release-docs-drift
    command: "node tests/governance_release_docs_check.js"
    evidence: "Current Watchdog full static gate fails because CONTRIBUTING.md is missing the documented 'Pull Request Expectations' section; this is outside the HLP-011 helper migration scope."
    status: out-of-scope
    next_action: "Restore the required governance documentation section in the owning documentation task, then rerun the full static test gate."
  - id: load-soak-threshold-drift
    command: "node tests/load_soak_suite.js"
    evidence: "Current Watchdog quick load profile exceeds its p95 latency threshold (observed 1566 ms versus 1200 ms); this is an unrelated performance/environment gate, not an HLP-011 helper failure."
    status: external-blocked
    next_action: "Rerun on the supported performance host or update the owning benchmark threshold with evidence, then rerun the load/soak suite."
