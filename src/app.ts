import http from 'http';
import express from 'express';
import apolloServer from './apollo_server';
import cors from 'cors';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const httpServer = http.createServer(app);

const crmConvoso = require('./routes/convoso');
const crmNotary = require('./routes/notary');
const crmSMS = require('./routes/sms');
const crmTitle = require('./routes/title');
const crmSign = require('./routes/sign');
const crmZillow = require('./routes/zillow');

const dataAppend = require('./routes/append');
var multipart = require('connect-multiparty');

import Dashboard from './routes/dashboard';
import Import from './routes/import';

const multipartMiddleware = multipart()
const dashboard = new Dashboard();

// HEALTH CHECK - do not remove!
app.get('/health', function (req, res) {
  res.sendStatus(200);
})

  app.use(cors())

// START -- BUSINESS CRITICAL REST API FUNCTIONALITY - do not remove!
  /**Convoso - Call Center**/
  app.post('/v1/crm/convoso', crmConvoso.recordUpdate);
  app.post('/v1/crm/convoso/callback', crmConvoso.callback);

  /**Data - Append**/
  app.get('/v1/dashboard/export', dashboard.export);
  app.post('/v1/dashboard/import', multipartMiddleware, Import);
  app.get('/v1/data/append', dataAppend.waterfall);

  /**Notary - Photos and appointments**/
  app.get('/v1/crm/notary', crmNotary.default);

  /**Sendii - CRM/SMS Integration**/
  app.get('/v1/crm/sms/checkmessage', crmSMS.checkmessage);
  app.post('/v1/crm/sms/inbound', cors(), crmSMS.inbound);
  app.post('/v1/crm/sms/outbound', cors(), crmSMS.outbound);

  /**Title - Qualia**/
  app.get('/v1/crm/title', crmTitle.default);

  /**Zoho Sign - E-Signature Contracts**/
  app.get('/v1/crm/sign/send', crmSign.send);
  app.get('/v1/crm/sign/test', crmSign.test);
  app.post('/v1/crm/sign/webhook', crmSign.webhook);

  /**Zillow - Property data**/
  app.get('/v1/crm/zillow', crmZillow.recordUpdate);
// END -- BUSINESS CRITICAL REST API FUNCTIONALITY - do not remove!

const port = (process.env.NODE_PORT && Number.parseInt(process.env.NODE_PORT))  || 8080;
const host = process.env.NODE_HOST || 'localhost';

apolloServer.applyMiddleware({ app });
httpServer.listen(port, () => {
    console.log(
      `Server ready at http://${host}:${port}${apolloServer.graphqlPath}`);
});

// module.exports = app;
