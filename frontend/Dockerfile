# Pinned: docker/dockerfile:1 (latest) crashes with exit 255 on Docker Desktop 29.x.
# syntax=docker/dockerfile:1.20

# --- Build the static bundle ---------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
# Use a clean install when a lockfile exists; fall back to install otherwise.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# --- Serve with nginx ----------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
