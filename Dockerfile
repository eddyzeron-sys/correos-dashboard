FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/data
COPY --from=build /app/dist ./dist
COPY src/views ./src/views
COPY src/public ./src/public

EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/server.js"]
