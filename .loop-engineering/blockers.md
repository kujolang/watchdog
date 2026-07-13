# External Blockers

blockers:
  - id: typed-env-default-contract
    command: "env_int/env_float/env_bool"
    evidence: "Kujo now supports typed env defaults for single-name missing/invalid values, but Watchdog normalization also combines multi-name precedence, positive bounds, enum normalization, and security defaults; replacing those policy paths directly would still change behavior."
    status: needs-contract-first
    next_action: "Add a documented multi-name/bounded normalization contract or retain the policy helper, then migrate only paths covered by compatibility fixtures."
