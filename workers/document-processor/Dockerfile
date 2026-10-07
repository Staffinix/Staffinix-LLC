FROM node:22.18.0-alpine3.22
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY workers/document-processor ./workers/document-processor
USER node
EXPOSE 8788
CMD ["node", "workers/document-processor/server.mjs"]
