# The room-booking image that the pipeline builds and deploys to Kubernetes.
# No npm install: the service uses Node built-ins only, and Node 26 runs the TypeScript directly.
FROM node:26-alpine

WORKDIR /app
COPY package.json ./
COPY src ./src

# Not root: the official image has an unprivileged "node" user.
USER node
ENV PORT=8080
EXPOSE 8080

# Kubernetes probes /health; Docker uses this when the image runs outside Kubernetes.
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

CMD ["node", "src/server.ts"]
