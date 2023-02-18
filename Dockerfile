FROM node:16-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV CHROMIUM_PATH /usr/bin/chromium-browser
ENV PUPPETEER_EXECUTABLE_PATH="${CHROMIUM_PATH}"

RUN apk add --update chromium chromium-chromedriver ffmpeg && rm -rf /var/cache/apk/*
RUN npm ci --omit=dev

CMD [ "node", "bot.js" ]