# Cobot CI/CD & Verification Pipeline Architecture

This document details the modular verification pipeline, Git hooks, and GitHub Actions workflows for **Cobot**.

---

## 1. Design Philosophy: Verification as Components

Every pre-commit check and CI step is treated as an **isolated, single-responsibility component**:

- **Pre-commit**: Check scripts live under `scripts/checks/` as executable Bash components. They can be invoked directly in your terminal at any time without triggering a Git commit.
- **Git Hooks**: `.husky/pre-commit` and `.husky/commit-msg` are lightweight orchestrators that simply invoke the check components in sequence.
- **GitHub Actions**: Common environment setups (Node/pnpm, Rust/Tauri WebKitGTK) are packaged as **Composite Actions** under `.github/actions/` to eliminate duplicated YAML boilerplate.

---

## 2. Pre-Commit Verification Pipeline

The pre-commit pipeline executes 5 sequential verification stages:

```
git commit
   │
   ├──► [Stage 1] scripts/checks/check-secrets.sh
   │    Scans staged files & diffs for leaked Google OAuth tokens,
   │    Anthropic/OpenAI keys, and private key headers.
   │
   ├──► [Stage 2] scripts/checks/check-format.sh
   │    Runs lint-staged to format staged files with Prettier.
   │
   ├──► [Stage 3] scripts/checks/check-types.sh
   │    Executes Turborepo full check-types across all workspace packages.
   │
   ├──► [Stage 4] scripts/checks/check-rust.sh
   │    Compiles native Rust desktop shell via cargo check.
   │
   ├──► [Stage 5] scripts/checks/check-go.sh
   │    Runs gofmt, go vet, golangci-lint, and govulncheck on Go microservices.
   │
   └──► [Stage 6] scripts/checks/check-audit.sh
        Audits npm dependencies for critical security vulnerabilities.
```

### Running Individual Check Components Standalone:

You can test any check component independently during development:

```bash
# Scan staged diffs for sensitive tokens
./scripts/checks/check-secrets.sh

# Run staged formatter
./scripts/checks/check-format.sh

# Run monorepo TypeScript checks
./scripts/checks/check-types.sh

# Typecheck native Tauri Rust shell
./scripts/checks/check-rust.sh

# Run Go linter, compiler checks, and vulnerability audit
./scripts/checks/check-go.sh

# Audit dependencies for critical CVEs
./scripts/checks/check-audit.sh
```

./scripts/checks/check-rust.sh

# Audit dependencies for critical CVEs

./scripts/checks/check-audit.sh

```

---

## 3. Commit Message Standards (Conventional Commits)

Commit messages are automatically linted against the **Conventional Commits** specification via `@commitlint/cli` and `@commitlint/config-conventional`:

```

<type>(<scope>): <subject>

````

### Allowed Types:
- `feat`: A new feature or capability.
- `fix`: A bug fix or patch.
- `docs`: Documentation updates.
- `style`: Formatting, whitespace, or visual CSS tweaks.
- `refactor`: Code restructuring without functional changes.
- `perf`: Performance optimizations.
- `test`: Adding or updating test suites.
- `build`: Dependency updates or build system modifications.
- `ci`: CI/CD workflows and hook adjustments.
- `chore`: Repository maintenance tasks.
- `revert`: Reverting prior commits.

---

## 4. GitHub Actions CI Architecture

### A. Composite Action Components (`.github/actions/`)

1. **`setup-env` (`.github/actions/setup-env/action.yml`)**:
   - Installs pnpm 11.25.0 and Node.js 24.
   - Caches pnpm store using actions/setup-node.
   - Executes `pnpm install --frozen-lockfile` to prevent dependency drift.

2. **`setup-tauri` (`.github/actions/setup-tauri/action.yml`)**:
   - Installs Linux WebKitGTK 4.1 development libraries (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`).
   - Configures stable Rust toolchain with Clippy.
   - Configures `Swatinem/rust-cache` scoped to `apps/desktop/src-tauri`.

---

### B. CI Workflows (`.github/workflows/`)

#### 1. `ci.yml` (Primary Pipeline)
- **`quality` Job**: Runs on Ubuntu. Validates conventional commits on Pull Requests, runs Turborepo monorepo `check-types`, and audits dependencies.
- **`desktop-linux` Job**: Sets up WebKitGTK, builds the desktop Vite bundle, and verifies native compilation with `cargo check` and `cargo clippy -- -D warnings`.
- **`agent-daemon` Job**: Compiles and typechecks `@cobot/agent-daemon`.

#### 2. `codeql.yml` (Deep Semantic Security Analysis)
- Runs GitHub's CodeQL query engine with `security-extended` and `security-and-quality` suites.
- Tracks semantic data flow from HTTP request inputs through to system tool execution (`child_process.exec()`, filesystem access) to detect command injection, path traversal, or prototype pollution.

#### 3. `dependency-review.yml` (Pull Request Supply Chain Gate)
- Intercepts Pull Requests that introduce new or modified dependencies.
- Fails the check if high or critical vulnerabilities are introduced into `pnpm-lock.yaml` or `Cargo.lock`.

---

## 5. Cross-Platform Expansion Roadmap

While currently targeted to Linux (`ubuntu-latest`), the pipeline is structured for seamless multi-platform expansion. When enabling Windows and macOS binaries, update `ci.yml` to use a matrix strategy:

```yaml
jobs:
  desktop-build:
    strategy:
      matrix:
        platform: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
````
