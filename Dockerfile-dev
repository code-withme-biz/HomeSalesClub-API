FROM 465464725359.dkr.ecr.us-east-2.amazonaws.com/scrapetorium-lite:1.0

WORKDIR /usr/src/app

RUN wget https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64 -O cloud_sql_proxy \
    && chmod +x cloud_sql_proxy

COPY package*.json ./

RUN npm install -g node-gyp
RUN npm install

COPY . .

EXPOSE 80
CMD [ "sh", "-c", "./cloud_sql_proxy -instances=total-method-280600:us-central1:homesalesclub:us-cent=tcp:3306 -credential_file=total-method-280600-05a5819088bb.json &  npm run serve" ]