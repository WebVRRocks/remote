const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const ecstatic = require('ecstatic');
const SocketPeer = require('socketpeer');

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

function notFound (res, msg, contentType) {
  res.writeHead(404, {
    'Content-Type': contentType || 'text/plain'
  });
  res.end(msg || 'File not found');
  return res;
}

httpServer.on('request', (req, res) => {
  const pathname = url.parse(req.url).pathname;
  if (pathname.startsWith('/socketpeer/')) {
    return;
  }
  if (pathname.endsWith('/index.html')) {
    return redirect(res, pathname.substr(0, '/index.html'.length - 1));
  }
  if (pathname.endsWith('//')) {
    return redirect(res, pathname.replace(/\/+/, '/'));
  }
  if (pathname === '/') {
    return redirect(res, '/' + generatePinCode());
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
