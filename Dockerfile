FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/data/catalog.json ./data/catalog.json
COPY --from=build /app/data/menu_pdf/menu_antojitos_v2.pdf ./data/menu_pdf/menu_antojitos_v2.pdf

ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
