function stopListening(emitter, event, fn) {
  emitter.removeListener(event, fn);
}
function Listeners() {
  var listeners = [];
  this.add = function(emitter, event, fn) {
    emitter.on(event, fn);
    listeners.push([emitter, event, fn]);
  };
  this.destroy = function() {
    listeners.forEach(function(args) {
      stopListening.apply(this, args);
    });
    listeners.length = 0;
  };
}

module.exports = {
  depends: 'relay',
  apply: function($, window, document) {
    var listeners = new Listeners();
    $(document).one('rendered', function() {
      $('link').each(function() {
        var link = this;
        listeners.add(link.asset, 'change', function update() {
          link.href = this.href;
        });
      });
    });
    $(window).unload(listeners.destroy);
  }
};