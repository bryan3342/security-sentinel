# Multi-stage build for the webhook service.
# Run with: docker build -t sentinel-webhook .

# --- deps stage: install production dependencies only ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Use `npm ci` once a package-lock.json exists; falling back to install for now.
RUN npm install --omit=dev

# --- runtime stage: minimal image, non-root user ---
FROM node:20-alpine AS runtime

# Create a non-root user; running as root in a container that handles
# external HTTP is an unnecessary privilege.
RUN addgroup -S sentinel && adduser -S sentinel -G sentinel

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=sentinel:sentinel . .

# Create logs/ writable by the runtime user.
RUN mkdir -p logs && chown -R sentinel:sentinel logs

USER sentinel

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Liveness probe — orchestrators (k8s, ECS) can use HTTP /healthz directly,
# but this lets `docker run` show health status too.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --spider -q http://localhost:3000/healthz || exit 1

CMD ["node", "src/index.js"]
