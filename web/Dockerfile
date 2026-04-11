FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws

RUN npm run build

# Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.js ./
# Copy public dir only if it exists
RUN mkdir -p /app/public

EXPOSE 3000

CMD ["npm", "start"]
