(function () {
  var navFormEl = document.getElementById('nav-form');

  var logsEl = document.createElement('div');
  logsEl.id = 'logs';
  logsEl.className = 'absolute bottom-0 left-0 right-0 o-50 bg-near-black white w-100 h-20 overflow-y-auto';

  var code = window.location.pathname.substr(1) || window.location.search.substr(1) || window.location.hash.substr(1);
  var big = Math.pow(16, 10);
  var connected = false;

  if (!code) {
    code = ((Math.random() * big | 0) + big).toString(16);
    window.history.replaceState(null, null, '/' + code);
  }

  var peer = new SocketPeer({
    pairCode: code,
    url: location.origin + '/socketpeer/'
  });

  function pad (n) {
    return ('0' + n).substr(-2);
  }

  function write (msg) {
    // logsEl.innerHTML += msg;
    console.log('[debug] ' + msg);
  }

  function directionChanged (value) {
    write('<button press> ' + value);

    peer.send(value);

    var stateData = {
      type: 'buttondown',
      value: value
    };

    window.top.postMessage(JSON.stringify(stateData), '*');

    window.location.hash = '#' + value;

    return stateData;
  }

  navFormEl.addEventListener('submit', function (evt) {
    evt.preventDefault();
    evt.stopPropagation();
  });
  navFormEl.addEventListener('mousedown', function (evt) {
    var el = evt.target.closest('button');
    if (!el) {
      return;
    }
    console.log('mousedown', evt);
    directionChanged(el.value);
  });
  navFormEl.addEventListener('input', function (evt) {
    console.log('input', evt);
  });
  navFormEl.addEventListener('change', function (evt) {
    console.log('change', evt);
  });

  // navFormEl.addEventListener('input', function () {
  //   console.log('changed');
  //   directionChanged();
  // });

  peer.on('data', function (data) {
    window.top.postMessage(data, '*');
    write('<them> ' + data);
  });

  peer.on('upgrade', function () {
    write('upgraded to p2p');
    connected = true;
  });

  peer.on('upgrade_attempt', function () {
    write('negotiating with peer');
  });

  peer.on('busy', function () {
    write('peer connected to someone else');
  });

  peer.on('error', function (err) {
    write('connection error: ' + err);
  });

  peer.on('downgrade', function () {
    write('p2p connection broken');
    connected = false;
  });

  write('waiting for another user to go to ' + location.href);
})();
