/**
 * Support for the Redirect-After-Post without cookies.
 */
var URL = require('url'),
    windows = {};

exports.param = '--';

function basePath(req) {
  return URL.parse(req.url).pathname;
}

exports.middleware = function(req, res, next) {
  var token = req.query[exports.param];
  if (token && req.method == 'GET') {
    var window = windows[token];
    if (window) {

      //var script = window.document.createElement('script');
      //script.text = 'if (history.replaceState) history.replaceState(null, document.title, "' + basePath(req) + '");';
      //window.document.body.appendChild(script);

      res.send(window.document.outerHTML);
      delete windows[token];
      return;
    }
    else {
      res.redirect(basePath(req));
    }
  }
  next();
};

exports.onInit = function(req, options, $, document) {
  var hash;
  if (req.method == 'POST' && !req.xhr) {
    $(document).bind('beforeClick', function(ev) {
      var el = ev.target;
      hash = (el.id = el.id || Date.now().toString(24));
    });
    options.send = function(window, res) {
      var token = (Math.random() * 0x100000000 * req.socket.remotePort).toString(16);
      windows[token] = window;
      setTimeout(function() {
        delete window[token];
      }, 30000);
      var url = basePath(req) + '?' + exports.param + '=' + token;
      if (hash) {
        url += '#' + hash;
      }
      res.redirect(url);
    };
  }
};