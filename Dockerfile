# App self-hosted (Node + Hono via @hono/node-server). Chạy TS trực tiếp bằng tsx.
# Phase 5 có thể đổi sang esbuild bundle nếu muốn image nhẹ hơn.
FROM node:22-alpine

WORKDIR /app

# Cài deps (gồm tsx ở dependencies để chạy runtime).
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8787
EXPOSE 8787

CMD ["npm", "run", "start"]
