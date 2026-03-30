FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Seed the database if seed_questions.json exists
RUN if [ -f seed_questions.json ]; then node seed.js; fi

EXPOSE 3000

ENV NODE_ENV=production
ENV JWT_SECRET=change-this-in-production

CMD ["node", "server.js"]
