var io = require('socket.io'),
  stringify = require('../utils').stringify,
  callbacks = {};

exports.depends = 'jquery';
exports.js = {
  cdn: '/socket.io/socket.io.js'
};

function getCallbackId(req, cb) {
  var app = req.app,
    id = (Math.random() * 0x100000000 * req.socket.remotePort).toString(16);

  callbacks[id] = cb;
  setTimeout(function() {
    delete callbacks[id];
  }, 5000);

  if (!app.socket) {
    app.socket = io.listen(app);
    app.socket.on('connection', function(client) {
       client.on('message', function(msg) {
         var cb;
         if (msg.callbackId) {
           cb = client.callback = callbacks[msg.callbackId];
           if (cb) {
             cb.connect(client);
           }
           else {
             //client.send('timeout');
           }
         }
         else if (client.callback) {
           client.callback.message(msg, client);
         }
       });
       client.on('disconnect', function() {
          //client.callback.disconnect();
        });
    });
  }
  return id;
}

exports.apply = function($, req, window) {
  var id = getCallbackId(req, {
    connect: function(client) {
      $.client = function(selector, fn, args) {
        var msg = {selector: selector, fn: fn, args: stringify(args)};
        client.send(msg);
      };
      $(window).trigger('clientConnect', client);
    },
    message: function(msg, client) {
      $(window).trigger('clientMessage', [msg, client]);
    },
    disconnect: function() {
      $(window).trigger('clientDisconnect');
    }
  });
  $('html').attr('data-callback-id', id);
};
