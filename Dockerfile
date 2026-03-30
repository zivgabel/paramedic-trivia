FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

ENV NODE_ENV=production
ENV JWT_SECRET=change-this-in-production

CMD ["node", "server.js"]
