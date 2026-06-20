FROM node:26-slim

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --package-lock=false

COPY app.ts ./
COPY bin ./bin
COPY middleware ./middleware
COPY routes ./routes
COPY src ./src

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV FOOD_INDEX_PATH=/data/food-index.sqlite

EXPOSE 3000

CMD ["node", "dist/bin/www.js"]
