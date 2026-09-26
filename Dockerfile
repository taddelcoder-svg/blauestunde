FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=10000 DATA_DIR=/app/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js zugang.js index.html datenschutz.html ./
COPY vendor ./vendor
EXPOSE 10000
CMD ["node", "server.js"]
