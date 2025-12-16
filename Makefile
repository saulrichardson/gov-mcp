REPO_ROOT := $(CURDIR)
SLUG ?= v2__agency__awards__count
BASE ?= main
PARALLEL ?= 2

.PHONY: discover validate profile pipeline clean-worktrees discover-all validate-all profile-all pipeline-all gather-runs merge-agent-branches mcp-server

discover:
	@$(REPO_ROOT)/scripts/codex/bin/run-agent.sh discover $(SLUG) $(BASE)

validate:
	@$(REPO_ROOT)/scripts/codex/bin/run-agent.sh validate $(SLUG) $(BASE)

profile:
	@$(REPO_ROOT)/scripts/codex/bin/run-agent.sh profile $(SLUG) $(BASE)

# Run discover -> validate -> profile in sequence for the same contract
pipeline: discover validate profile

# ---- bulk helpers ----

# Run a single pass for all staged slugs (parallel by PARALLEL, per-slug lock prevents clashes)
discover-all:
	@slugs=$$(python scripts/list_staged_slugs.py); \
	printf '%s\n' $$slugs | xargs -n1 -P $(PARALLEL) -I{} $(REPO_ROOT)/scripts/codex/bin/run-agent.sh discover {} $(BASE)

validate-all:
	@slugs=$$(python scripts/list_staged_slugs.py); \
	printf '%s\n' $$slugs | xargs -n1 -P $(PARALLEL) -I{} $(REPO_ROOT)/scripts/codex/bin/run-agent.sh validate {} $(BASE)

profile-all:
	@slugs=$$(python scripts/list_staged_slugs.py); \
	printf '%s\n' $$slugs | xargs -n1 -P $(PARALLEL) -I{} $(REPO_ROOT)/scripts/codex/bin/run-agent.sh profile {} $(BASE)

# Run discover->validate->profile for every staged slug, one doc at a time (keeps pass order serial per slug)
pipeline-all:
	@for s in $$(python scripts/list_staged_slugs.py); do \
		echo "[pipeline-all] $$s"; \
		$(REPO_ROOT)/scripts/codex/bin/run-agent.sh discover $$s $(BASE); \
		$(REPO_ROOT)/scripts/codex/bin/run-agent.sh validate $$s $(BASE); \
		$(REPO_ROOT)/scripts/codex/bin/run-agent.sh profile  $$s $(BASE); \
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
	@$(REPO_ROOT)/scripts/mcp/bin/stdio-server
