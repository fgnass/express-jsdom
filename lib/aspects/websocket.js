var utils = require('../utils');
var callbacks = {};

exports.depends = [
  '$',                                    // Server-side jQuery or zepto
  'jquery',                               // Client-side jQuery
  {js: {cdn: '/socket.io/socket.io.js'}}  // Served by the socket.io module
];

/**
 * Listens for socket connections on the given app.
 * If a lister has already been set up, the function will do nothing.
 */
function listen(app) {
  if (!app.socketListener) {

    var io = require('socket.io').listen(app);
    io.configure(function() {
      io.set('log level', 1);
    });

    var sockets = app.socketListener = io.sockets;
    sockets.on('connection', function(socket) {
      /**
       * Listen for the callback event to link the socket to a previously served HTML document.
       */
      socket.on('callback', function(data) {
        var cb = callbacks[data.handle];
        if (!cb) {
          console.log("No such callback. Timeout?");
          socket.disconnect();
        }
        else {
          delete callbacks[data.handle];
          cb.connect(socket);
          socket.on('disconnect', function() {
            /** Notify the callback */
            cb.disconnect(socket);
          });
        }
      });
    });
  }
}

function SocketCallback(window) {
  this.window = window;
}
SocketCallback.prototype = {
  connect: function(socket) {
    var window = this.window;
    utils.trigger(window, 'clientConnect', {detail: socket});
    //var $ = window.$;
    //$(window).trigger('clientConnect', socket);
  },
  disconnect: function() {
    utils.trigger(this.window, 'clientDisconnect');
    utils.trigger(this.window, 'unload', {type: 'HTMLEvents'});
  }
};

/**
 * Creates a SocketCallback for the given window and returns a handle.
 */
function createCallback(req, window) {
  var id = (~~((1+Math.random())*1e8) * req.socket.remotePort).toString(16);
  var cb = new SocketCallback(window);
  callbacks[id] = cb;
  setTimeout(function() {
    delete callbacks[id];
  }, 30000);

  listen(req.app);
  return id;
}

exports.apply = function(req, window, document) {
  var handle = createCallback(req, window);
  document.documentElement.setAttribute('data-callback-handle', handle);
};

/** Client-side code */

exports.js = function() {

  var socket = io.connect();

  socket.on('connect', function() {
    socket.emit('callback', {handle: $('html').attr('data-callback-handle')});
    $(window).trigger('serverConnect', socket);
  });

  socket.on('disconnect', function() {
    $(window).trigger('serverDisconnect', socket);
  });

  socket.on('jQuery', function(msg) {
    if (msg.fn) {
      var el = $(msg.selector);
      jQuery.fn[msg.fn].apply(el, eval(msg.args));
    }
  });

};
