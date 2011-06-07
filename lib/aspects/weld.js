var weld = require('weld');

exports.depends = '$';

exports.apply = function($) {
  $.fn.weld = function(data, config) {
    return this.each (function () {
      weld.weld(this, data, config);
    });
  };
};