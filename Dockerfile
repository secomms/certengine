FROM node:20.16.0

WORKDIR /home/node/app/

COPY ./package*.json ./

RUN npm install --include=dev

COPY . .

RUN chown -R node:node /home/node/app

USER node

CMD ["node", "src/bin/www"]