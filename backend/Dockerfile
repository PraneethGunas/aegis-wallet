FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY src ./src

RUN mkdir -p /data /certs

EXPOSE 3001

CMD ["node", "src/server.js"]
