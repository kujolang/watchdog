# External Blockers

blockers:
  - id: typed-env-default-contract
    command: "env_int/env_float/env_bool"
    evidence: "Watchdog config normalization combines multi-name environment precedence, invalid-value fallback, positive bounds, enum normalization, and security defaults; direct native typed env calls cannot preserve all of those semantics without a contract change."
    status: needs-contract-first
    next_action: "Define optional/default typed-env primitives or a documented fallback contract, then migrate only the normalization paths with compatibility fixtures."
