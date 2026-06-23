# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup Express Backend & Combine
FROM node:20-slim
WORKDIR /app/backend

# Install build dependencies for fallback native compilations
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install --only=production

COPY backend/ ./

# Copy built frontend from Stage 1 into backend public folder
COPY --from=frontend-builder /app/frontend/dist ./public

# Set environment
EXPOSE 3001
ENV PORT=3001
ENV NODE_ENV=production

# Create persistent storage volume for SQLite and uploaded images
VOLUME [ "/app/backend/data" ]

CMD [ "npm", "start" ]
