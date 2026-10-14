FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/init-db.js && node src/server.js"]
