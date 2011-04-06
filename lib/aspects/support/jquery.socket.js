var socket = new io.Socket(); 
socket.connect();
socket.on('connect', function() {
  socket.send({callbackId: $('html').data('callback-id')});
  $(window).trigger('serverConnect', socket);
});
socket.on('message', function(msg) {
  $(window).trigger('serverMessage', [msg, socket]);
});
socket.on('disconnect', function() {
  $(window).trigger('serverDisconnect', socket);
});