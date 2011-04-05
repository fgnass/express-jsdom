module.exports = {
  depends: 'relay',
  apply: function($, window, document) {
    $(document).bind('rendered', function() {
      $('link').each(function() {
        var link = this;
        function update() {
          link.href = this.href;
        }
        link.asset.on('change', update);
        $(window).unload(function() {
          link.asset.removeListener('change', update);
        });
      });
    });
  }
};