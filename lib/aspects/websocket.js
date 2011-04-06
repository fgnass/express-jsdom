var io = require('socket.io'),
  utils = require('../utils'),
  callbacks = {};

exports.depends = ['jquery', {js: {cdn: '/socket.io/socket.io.js'}}];
exports.js = 'support/jquery.socket.js';

function listen(app) {
  if (!app.socketListener) {
    var socket = app.socketListener = io.listen(app);
    socket.on('clientMessage', function(msg, client) {
      if (msg.callbackId) {
        var cb = client.callback = callbacks[msg.callbackId];
        if (cb) {
          delete callbacks[msg.callbackId];
          cb.connect(client);
        }
      }
      else if (client.callback) {
        client.callback.message(msg, client);
      }
    });
    socket.on('clientDisconnect', function(client) {
      if (client.callback) {
        client.callback.disconnect(client);
        delete client.callback;
      }
    });
  }
}

function getCallbackId(req, cb) {
  var id = (Math.random() * 0x100000000 * req.socket.remotePort).toString(16);
  callbacks[id] = cb;
  setTimeout(function() {
    delete callbacks[id];
  }, 5000);

  listen(req.app);
  return id;
}

function SocketCallback(window) {
  this.window = window;
}
SocketCallback.prototype = {
  connect: function(client) {
    var window = this.window;
    var $ = window.$;
    $.client = function(selector, fn, args) {
      var msg = {selector: selector, fn: fn, args: utils.stringify(args)};
      client.send(msg);
    };
    $.getSelector = utils.getSelector;
    $(window).trigger('clientConnect', client);
  },
  message: function(msg, client) {
    var window = this.window;
    var $ = window.$;
    $(window).trigger('clientMessage', [msg, client]);
  },
  disconnect: function() {
    var window = this.window;
    var $ = window.$;
    $.client = null;
    $(window).trigger('clientDisconnect');
    var ev = window.document.createEvent('HTMLEvents');
    ev.initEvent('unload');
    window.dispatchEvent(ev);
  }
};
exports.apply = function($, req, window) {
  var id = getCallbackId(req, new SocketCallback(window));
  $('html').attr('data-callback-id', id);
};
