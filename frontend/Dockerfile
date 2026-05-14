# Stage 1 — build
FROM node:20-slim AS builder

WORKDIR /app

# Copy root assets (vite.config publicDir: '../assets' resolves to /app/assets)
COPY assets/ ./assets/

# Install deps first for better layer caching
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install

# Copy source and build
COPY frontend/ ./
RUN npm run build

# Stage 2 — serve with nginx
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
