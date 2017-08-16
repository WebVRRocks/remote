const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const SocketPeer = require('socketpeer');

const host = process.env.SOCKETPEER_HOST || process.env.HOST || '0.0.0.0';
const port = process.env.SOCKETPEER_PORT || process.env.PORT || 3000;
const nodeEnv = process.env.NODE_ENV || 'development';
const httpServer = http.createServer();
const peer = new SocketPeer({
  httpServer: httpServer,
  serveLibrary: true
});

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

httpServer.on('request', (req, res) => {
  const pathname = url.parse(req.url).pathname;
  const pathnameHasPin = /\/[0-9]+$/.test(pathname);
  if (pathname === '/' || pathnameHasPin) {
    if (!pathnameHasPin) {
      res.statusCode = 302;
      res.setHeader('Location', '/' + generatePinCode());
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }
    res.writeHead(200, {'Content-Type': 'text/html'});
    fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  } else if (!pathname.startsWith('/socketpeer/')) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('File not found');
  }
});

if (!module.parent) {
  httpServer.listen(port, host, () => {
    console.log('[%s] Server listening on %s:%s', nodeEnv, host, port);
  });
}

module.exports.httpServer = httpServer;

module.exports.peer = peer;
