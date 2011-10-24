var Listeners = require('../utils').Listeners;

module.exports = {
  depends: 'relay',
  apply: function($, window) {
    var listeners = new Listeners();
    $(window).bind('clientConnect', function() {
      $('link').each(function() {
        var link = this;
        listeners.add(link.asset, 'change', function() {
          var asset = this;
          $(link).mutate(function() {
            this.href = asset.href;
          });
        });
      });
    });
    $(window).bind('clientDisconnect', listeners.destroy);
  }
};