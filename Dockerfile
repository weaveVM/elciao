FROM node:alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8546

RUN chmod +x cmd.sh

CMD ["./cmd.sh"]