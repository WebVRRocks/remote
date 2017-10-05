const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const ecstatic = require('ecstatic');
const express = require('express');
const expressPouchDB = require('express-pouchdb');
const PouchDB = require('pouchdb');
const resisdown = require('redisdown');
const SocketPeer = require('socketpeer');
const trailingSlash = require('trailing-slash');
const twilio = require('twilio');

dotenv.config({
  path: path.join(__dirname, '..')
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST,PUT',
  'Access-Control-Allow-Headers': 'Access-Control-Allow-Headers, Access-Control-Request-Method, Access-Control-Request-Headers, Origin, Accept, Authorization, X-Requested-With, Content-Type',
  'Access-Control-Expose-Headers': 'Location'
};

const host = process.env.SOCKETPEER_HOST || process.env.HOST || '0.0.0.0';
const port = process.env.SOCKETPEER_PORT || process.env.PORT || 3000;
const nodeEnv = process.env.NODE_ENV || 'development';

const app = express();

app.use(trailingSlash({slash: true});

const httpServer = http.createServer(app);
const ecstaticMiddleware = ecstatic({
  root: __dirname,
  headers: corsHeaders
});
const peer = new SocketPeer({
  httpServer: httpServer,
  serveLibrary: true,
  headers: corsHeaders
});
const staticPaths = [
  '/',
  '/arrow.svg',
  '/box.svg',
  '/client.js',
  '/tachyons.min.css'
];

let pins = {};

function generatePinCode (length, unique) {
  if (typeof length === 'undefined') {
    length = 4;
  }

  if (typeof unique === 'undefined') {
    unique = true;
  }

  var pinDigits = [];
  for (var idx = 0; idx < length; idx++) {
    pinDigits.push(Math.floor(Math.random() * 10));
  }

  var pin = pinDigits.join('');

  if (unique && pin in pins) {
    return generatePINCode();
  }

  if (typeof pins[pin] !== 'number') {
    pins[pin] = 1;
  } else {
    pins[pin]++;
  }
  return pin;
}

function redirect (req, res, locationUrl) {
  var corsHandled = cors(req, res);
  if (!corsHandled) {
    return;
  }

  res.writeHead(302, {
    'Location': locationUrl,
    'Content-Length': '0'
  });
  res.end();
  return res;
}

function jsonBody (req, res, data, statusCode, contentType) {
  var corsHandled = cors(req, res);
  if (!corsHandled) {
    return;
  }

  res.writeHead(statusCode || 200, {
    'Content-Type': contentType || 'application/json'
  });
  res.end(JSON.stringify(data || {success: true}));
  return res;
}

function notFound (req, res, msg, contentType) {
  var corsHandled = cors(req, res);
  if (!corsHandled) {
    return;
  }

  res.writeHead(404, {
    'Content-Type': contentType || 'text/plain'
  });
  res.end(msg || 'File not found');
  return res;
}

/**
 * Parse phone numbers as strings to format accepted by Twilio.
 *
 * Examples:
 *
 *   +1 (650) 555-1212  =>  +16505551212
 *   6505551212         =>  6505551212
 *   650 555 1212       =>  6505551212
 *   650.555.1212       =>  6505551212
 *
 */
function parsePhoneNumber (str) {
  return str.replace(/[^0-9\+]/g, '');
}

function cors (req, res) {
  Object.keys(corsHeaders).forEach(header => {
    res.setHeader(header, corsHeaders[header]);
  });
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return false;
  }
  return true;
}

function sms (req, res) {
  const contentType = req.headers['content-type'] || '';
  const parser = contentType.includes('json') ? bodyParser.json() : bodyParser.urlencoded({extended: false});

  // Values taken from the Twilio dashboard:
  //
  //   https://www.twilio.com/console
  //
  // Locally, these values are stored in the `.env` in the root directory,
  // which is not checked in to the Git repository (so ask @cvan for the details).
  //
  // In production (Heroku), values are stored as environment values:
  //
  //   https://dashboard.heroku.com/apps/webxr-remote/settings#ember1901
  //
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    let twilioErr;
    if (!twilioAccountSid) {
      twilioErr = new Error('Expected environment variable `TWILIO_ACCOUNT_SID` to be set (ask @cvan)');
    }
    if (!twilioAuthToken) {
      twilioErr = new Error('Expected environment variable `TWILIO_AUTH_TOKEN` to be set (ask @cvan)');
    }
    if (!twilioPhoneNumber) {
      twilioErr = new Error('Expected environment variable `TWILIO_PHONE_NUMBER` to be set (ask @cvan)');
    }
    console.warn(twilioErr);
    jsonBody(req, res, {error: {message: twilioErr.message || 'Unknown error'}}, 400);
    return;
  }

  const twilioClient = new twilio(twilioAccountSid, twilioAuthToken);

  return parser(req, res, next);

  function next () {
    const smsBody = req.body.body;
    let smsTo = req.body.to;
    return new Promise((resolve, reject) => {
      if (!smsBody) {
        throw new Error('Value missing for `body` field (e.g., `Check this out!`)');
      }
      if (!smsTo) {
        throw new Error('Value missing for `to` field (e.g., `+16505551212`)');
      }
      smsTo = parsePhoneNumber(smsTo);
      if (!smsTo) {
        throw new Error('Unexpected value for `to` field (e.g., `+16505551212`)');
      }
      return twilioClient.messages.create({
        body: smsBody,
        to: smsTo,
        from: twilioPhoneNumber
      }, function (err, msg) {
        if (err) {
          return reject(err);
        }
        resolve(msg);
      });
    }).then(msg => {
      jsonBody(req, res, {success: true, sid: msg.sid}, 200);
    }).catch(err => {
      console.warn(err);
      jsonBody(req, res, {error: {message: err.message || 'Unknown error'}}, 400);
    });
  }
}

httpServer.on('request', (req, res) => {
  const urlParsed = url.parse(req.url);
  const pathname = urlParsed.pathname;
  const qs = urlParsed.qs;

  if (pathname.startsWith('/socketpeer/')) {
    return;
  }
  if (pathname.endsWith('/index.html')) {
    return redirect(req, res, pathname.substr(0, '/index.html'.length - 1));
  }
  if (pathname.endsWith('//')) {
    return redirect(req, res, pathname.replace(/\/+/g, '/'));
  }
  if (pathname === '/') {
    return redirect(req, res, '/' + generatePinCode());
  }
  if (pathname === '/sms') {
    return sms(req, res);
  }

  const pathnameHasPin = /^\/[0-9]+$/.test(pathname);
  if (pathnameHasPin) {
    console.log('pathnameHasPin', pathnameHasPin);
    req.url = '/';
  }
  if (pathnameHasPin || staticPaths.includes(pathname)) {
    console.log('ECSTATIC', pathnameHasPin, staticPaths.includes(pathname));
    return ecstaticMiddleware(req, res);
  }

  console.log('not found');

  notFound(req, res);
});

if (!module.parent) {
  const redisdownPouchDB = PouchDB.defaults({db: resisdown});

  app.use('/db', expressPouchDB(redisdownPouchDB));

  httpServer.listen(port, host, () => {
    console.log('[%s] Server listening on %s:%s', nodeEnv, host, port);
  });
}

module.exports.app = app;

module.exports.httpServer = httpServer;

module.exports.peer = peer;
