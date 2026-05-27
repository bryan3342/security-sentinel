# Base image for the sandboxed-runtime used by the Validator subagent.
# This image executes patched code: it must be minimal, non-root, and pinned.
#
# Build with: docker build -t sentinel-sandbox:latest -f sandbox/Dockerfile .
#
# Toolchains: Node.js (npm) + Python 3 (pytest if present). Add more
# language stacks as the fixture corpus grows.

FROM node:20-alpine

# Install python3 (apk's "python3" already includes pip; add it for completeness)
# and git (some test suites read repo metadata).
RUN apk add --no-cache python3 py3-pip git

# Create a non-root user. Running patched, agent-generated code as root —
# even inside a network-less container — is an unnecessary privilege.
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox

# Workspace is bind-mounted at runtime; this directory exists so the user
# has a defined HOME and the WORKDIR setting is sensible.
WORKDIR /workspace
RUN chown sandbox:sandbox /workspace

USER sandbox

# Ensure pip-installed user binaries are on PATH (pytest if installed).
ENV PATH="/home/sandbox/.local/bin:${PATH}"

# Default to a no-op; the driver always sets `Cmd` explicitly.
CMD ["sh", "-c", "echo 'sentinel-sandbox: no command supplied'; exit 1"]
