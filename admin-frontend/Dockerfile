# syntax=docker/dockerfile:1.7
#
# Static-site image for the admin SPA. Two stages:
#   1. node:22 — install deps + vite build → dist/
#   2. nginx:alpine — serve dist/ with SPA fallback (any unknown path → index.html)
#
# Build from the admin-frontend/ directory:
#   docker build -t eazyserv-admin -f admin-frontend/Dockerfile admin-frontend/
#
# Run locally:
#   docker run --rm -p 8080:80 eazyserv-admin

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
