REPO_ROOT := $(CURDIR)
CONTRACT ?= staging/docs/v2/agency/awards/count.md
BASE ?= main
PARALLEL ?= 2

# Find all v2 contracts
CONTRACTS := $(shell find staging/docs/v2 -name '*.md' 2>/dev/null | sort)

.PHONY: discover validate profile pipeline clean-worktrees

discover:
	@$(REPO_ROOT)/scripts/codex/bin/run-agent.sh discover $(CONTRACT) $(BASE)

validate:
	@$(REPO_ROOT)/scripts/codex/bin/run-agent.sh validate $(CONTRACT) $(BASE)

profile:
	@$(REPO_ROOT)/scripts/codex/bin/run-agent.sh profile $(CONTRACT) $(BASE)

# Run discover -> validate -> profile in sequence for the same contract
pipeline: discover validate profile

# ---- bulk helpers ----

# Run a single pass for all contracts (parallel by PARALLEL, per-doc lock prevents clashes)
discover-all:
	@printf '%s\n' $(CONTRACTS) | xargs -n1 -P $(PARALLEL) -I{} $(REPO_ROOT)/scripts/codex/bin/run-agent.sh discover {} $(BASE)

validate-all:
	@printf '%s\n' $(CONTRACTS) | xargs -n1 -P $(PARALLEL) -I{} $(REPO_ROOT)/scripts/codex/bin/run-agent.sh validate {} $(BASE)

profile-all:
	@printf '%s\n' $(CONTRACTS) | xargs -n1 -P $(PARALLEL) -I{} $(REPO_ROOT)/scripts/codex/bin/run-agent.sh profile {} $(BASE)

# Run discover->validate->profile for every contract, one doc at a time (keeps pass order serial per doc)
pipeline-all:
	@for c in $(CONTRACTS); do \
		echo "[pipeline-all] $$c"; \
		$(REPO_ROOT)/scripts/codex/bin/run-agent.sh discover $$c $(BASE); \
		$(REPO_ROOT)/scripts/codex/bin/run-agent.sh validate $$c $(BASE); \
		$(REPO_ROOT)/scripts/codex/bin/run-agent.sh profile  $$c $(BASE); \
	done

# Consolidate run artifacts from all worktrees into the main worktree's runs/
# Default: do not overwrite existing files. Set GATHER_MODE=overwrite to replace.
gather-runs:
	@mode=$(GATHER_MODE); \
	for w in $(shell git worktree list | awk 'NR>1{print $$1}'); do \
	  if [ -d "$$w/runs" ]; then \
	    echo "[gather] from $$w"; \
	    if [ "$$mode" = "overwrite" ]; then \
	      rsync -a --delete "$$w/runs/" "$(REPO_ROOT)/runs/"; \
	    else \
	      rsync -a --ignore-existing "$$w/runs/" "$(REPO_ROOT)/runs/"; \
	    fi; \
	  fi; \
	done

# Merge all agent branches into main without deleting them
merge-agent-branches:
	@git branch | grep '^  agent/' | while read b; do \
	  echo "[merge] $$b"; \
	  git merge --no-ff $$b || exit $$?; \
	done

# Utility to prune all temporary worktrees created by run-agent
clean-worktrees:
	@test -d .worktrees && git worktree prune && rm -rf .worktrees || true

# Start the MCP-ish HTTP server that exposes profiles/prompts/tools
mcp-server:
	@npm --prefix scripts/mcp install --silent
	@npm --prefix scripts/mcp run start
