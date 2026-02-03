# syntax=docker/dockerfile:1

### 1) Build Stage
FROM node:22-alpine AS build

WORKDIR /app

# pnpm via corepack
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN npm install --frozen-lockfile

COPY . .

# Angular build (production default in angular.json)
RUN npm build


### 2) Runtime Stage
FROM nginx:1.27-alpine

# Nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app
COPY --from=build /app/dist/LayoutMenuEditor/browser /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]

