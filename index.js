require('dotenv').config();

const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const bodyParser = require('body-parser');
const ecstatic = require('ecstatic');
const SocketPeer = require('socketpeer');
const twilio = require('twilio');

const host = process.env.SOCKETPEER_HOST || process.env.HOST || '0.0.0.0';
const port = process.env.SOCKETPEER_PORT || process.env.PORT || 3000;
const nodeEnv = process.env.NODE_ENV || 'development';
const httpServer = http.createServer();
const ecstaticMiddleware = ecstatic({
  root: __dirname
});
const peer = new SocketPeer({
  httpServer: httpServer,
  serveLibrary: true
});
const staticPaths = [
  '/',
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

function redirect (res, locationUrl) {
  res.writeHead(302, {
    'Location': locationUrl,
    'Content-Length': '0'
  });
  res.end();
  return res;
}

function jsonBody (res, data, statusCode, contentType) {
  res.writeHead(statusCode || 200, {
    'Content-Type': contentType || 'application/json'
  });
  res.end(JSON.stringify(data || {success: true}));
  return res;
}

function notFound (res, msg, contentType) {
  res.writeHead(404, {
    'Content-Type': contentType || 'text/plain'
  });
  res.end(msg || 'File not found');
  return res;
}

httpServer.on('request', (req, res) => {
  const urlParsed = url.parse(req.url);
  const pathname = urlParsed.pathname;
  const qs = urlParsed.qs;
  if (pathname.startsWith('/socketpeer/')) {
    return;
  }
  if (pathname.endsWith('/index.html')) {
    return redirect(res, pathname.substr(0, '/index.html'.length - 1));
  }
  if (pathname.endsWith('//')) {
    return redirect(res, pathname.replace(/\/+/g, '/'));
  }
  if (pathname === '/') {
    return redirect(res, '/' + generatePinCode());
  }

  if (pathname === '/sms/') {
    return redirect(res, '/sms');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Access-Control-Allow-Headers, Access-Control-Request-Method, Access-Control-Request-Headers, Origin, Accept, Authorization, X-Requested-With, Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname === '/sms') {
    const contentType = req.headers['content-type'] || '';
    const parser = contentType.includes('json') ? bodyParser.json() : bodyParser.urlencoded({extended: false});

    // Values taken from the Twilio dashboard: https://www.twilio.com/console
    // Stored in `.env` locally (i.e., this file is not checked in to Git repository, so ask @cvan).
    // The environment values are stored in production on Heroku: https://dashboard.heroku.com/apps/webxr-remote/settings#ember1901
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    const twilioClient = new twilio(twilioAccountSid, twilioAuthToken);

    parser(req, res, next);

    function next () {
      const smsBody = req.body.body;
      const smsTo = req.body.to;
      return new Promise((resolve, reject) => {
        if (!smsBody) {
          throw new Error('Value missing for `body` field (e.g., `Check this out!`)');
        }
        if (!smsTo) {
          throw new Error('Value missing for `to` field (e.g., `+16505551212`)');
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
        jsonBody(res, {success: true, sid: msg.sid}, 200);
      }).catch(err => {
        console.warn(err);
        jsonBody(res, {error: {message: err.message || 'Unknown error'}}, 400);
      });
    }

    return;
  }

  const pathnameHasPin = /^\/[0-9]+$/.test(pathname);
  if (pathnameHasPin) {
    req.url = '/';
  }
  if (pathnameHasPin || staticPaths.includes(pathname)) {
    return ecstaticMiddleware(req, res);
  }

  notFound(res);
});

if (!module.parent) {
  httpServer.listen(port, host, () => {
    console.log('[%s] Server listening on %s:%s', nodeEnv, host, port);
  });
}

module.exports.httpServer = httpServer;

module.exports.peer = peer;
