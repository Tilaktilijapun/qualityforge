FROM node:20-alpine
WORKDIR /repo
COPY package.json ./
COPY app/backend/package.json app/backend/
RUN npm install --workspace app/backend
COPY app/backend app/backend
WORKDIR /repo/app/backend
EXPOSE 4000
CMD ["sh", "-c", "npm run migrate && npm run seed && npm start"]
