FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --chown=node:node --chmod=0644 *.js ./
USER node
CMD ["npm", "start"]
