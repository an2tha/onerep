# syntax=docker/dockerfile:1
FROM oven/bun:1.4.0-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0 PORT=3100 DATA_DIR=/data
EXPOSE 3100
CMD ["bun", "src/index.ts"]
