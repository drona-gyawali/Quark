FROM node:20-alpine

# install python
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# install node deps + patches
COPY package*.json ./
COPY patches ./patches
RUN npm install

# install python deps (FIXED)
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# copy project
COPY . .

# build
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
