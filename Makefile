REPO_ROOT := $(CURDIR)
SLUG ?= v2__agency__awards__count
BASE ?= main
PARALLEL ?= 2
PIPELINE_VERSION ?= v2
JOB_DIR ?=
STAGE_MAX_ATTEMPTS ?= 3
STAGE_TIMEOUT_SECONDS ?= 3600
STAGE_KILL_GRACE_SECONDS ?= 20
SKIP_OUTPUT_VALIDATION ?= 0
FROM_JOB_DIR ?=

.PHONY: discover validate profile pipeline clean-worktrees discover-all validate-all profile-all pipeline-all gather-runs merge-agent-branches mcp-server promote-profile verify codex-preflight pipeline-coverage pipeline-run-foreground pipeline-run-bg pipeline-retry-failed pipeline-audit pipeline-status pipeline-status-watch

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

# Promote one generated run artifact into profiles/ + manifest
promote-profile:
	@npm --prefix scripts/mcp install --silent
	@$(REPO_ROOT)/scripts/mcp/bin/promote-profile --slug $(SLUG)

# Production verification gate: typecheck + tests + fixture validation + startup smoke
verify:
	@npm --prefix scripts/codex install --silent
	@npm --prefix scripts/mcp install --silent
	@npm --prefix scripts/codex run typecheck
	@npm --prefix scripts/mcp run typecheck
	@npm --prefix scripts/codex run test
	@npm --prefix scripts/mcp run test
	@python -m pytest -q scripts/tests/test_full_pipeline.py
	@$(REPO_ROOT)/scripts/mcp/bin/validate-profiles
	@$(REPO_ROOT)/scripts/mcp/bin/smoke-server

# Probe Codex auth + model config before launching bulk jobs.
codex-preflight:
	@npm --prefix scripts/codex install --silent
	@npm --prefix scripts/codex run preflight

# Coverage proof: staged contracts vs completed final artifacts vs promoted profiles.
pipeline-coverage:
	@python $(REPO_ROOT)/scripts/full_pipeline.py coverage --version $(PIPELINE_VERSION)

# Foreground full run with resumable per-slug status outputs under runs/_jobs.
pipeline-run-foreground:
	@python $(REPO_ROOT)/scripts/full_pipeline.py run --version $(PIPELINE_VERSION) --base $(BASE) --parallel $(PARALLEL) --stage-max-attempts $(STAGE_MAX_ATTEMPTS) --stage-timeout-seconds $(STAGE_TIMEOUT_SECONDS) --stage-kill-grace-seconds $(STAGE_KILL_GRACE_SECONDS) --job-dir $(REPO_ROOT)/runs/_jobs/$(PIPELINE_VERSION)-manual $(if $(filter 1,$(SKIP_OUTPUT_VALIDATION)),--skip-output-validation,)

# Detached background full run. Prints jobDir + monitor/tail commands.
pipeline-run-bg:
	@python $(REPO_ROOT)/scripts/full_pipeline.py start-bg --version $(PIPELINE_VERSION) --base $(BASE) --parallel $(PARALLEL) --stage-max-attempts $(STAGE_MAX_ATTEMPTS) --stage-timeout-seconds $(STAGE_TIMEOUT_SECONDS) --stage-kill-grace-seconds $(STAGE_KILL_GRACE_SECONDS) $(if $(filter 1,$(SKIP_OUTPUT_VALIDATION)),--skip-output-validation,)

# Replay only failed slugs from a previous job status.
pipeline-retry-failed:
	@test -n "$(FROM_JOB_DIR)" || (echo "FROM_JOB_DIR is required, e.g. make pipeline-retry-failed FROM_JOB_DIR=/abs/path/to/runs/_jobs/<job>"; exit 1)
	@python $(REPO_ROOT)/scripts/full_pipeline.py retry-failed --from-job-dir $(FROM_JOB_DIR) --stage-max-attempts $(STAGE_MAX_ATTEMPTS) --stage-timeout-seconds $(STAGE_TIMEOUT_SECONDS) --stage-kill-grace-seconds $(STAGE_KILL_GRACE_SECONDS) --parallel $(PARALLEL) $(if $(filter 1,$(SKIP_OUTPUT_VALIDATION)),--skip-output-validation,)

# Offline artifact audit for completed outputs in a job dir.
pipeline-audit:
	@test -n "$(JOB_DIR)" || (echo "JOB_DIR is required, e.g. make pipeline-audit JOB_DIR=/abs/path/to/runs/_jobs/<job>"; exit 1)
	@python $(REPO_ROOT)/scripts/full_pipeline.py audit --job-dir $(JOB_DIR)

pipeline-status:
	@test -n "$(JOB_DIR)" || (echo "JOB_DIR is required, e.g. make pipeline-status JOB_DIR=/abs/path/to/runs/_jobs/<job>"; exit 1)
	@python $(REPO_ROOT)/scripts/full_pipeline.py status --job-dir $(JOB_DIR)

pipeline-status-watch:
	@test -n "$(JOB_DIR)" || (echo "JOB_DIR is required, e.g. make pipeline-status-watch JOB_DIR=/abs/path/to/runs/_jobs/<job>"; exit 1)
	@python $(REPO_ROOT)/scripts/full_pipeline.py status --job-dir $(JOB_DIR) --watch
