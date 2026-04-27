FROM node:20-alpine

# install python (for bin/vision-worker.py)
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# install node deps
COPY package*.json ./
RUN npm install

# install python deps (safe even if empty)
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt || true

# copy full project
COPY . .

# build typescript
RUN npm run build

EXPOSE 3000

# START API SERVER ONLY
CMD ["node", "dist/index.js"]
