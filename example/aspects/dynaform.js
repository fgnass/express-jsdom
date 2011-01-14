exports.depends = [require('./validation'), require('./jqueryUI'), './aspects/incrementalUpdates'];

exports.assets = {
  name: 'dynaform',
  js: {
    server: '/Users/flx/js/dynaform/jquery.dynaform.js'
  },
  css: '/Users/flx/js/dynaform/theme/default.css',
};

exports.middleware = require('form2json').middleware();

exports.onInit = function($) {
  var timestamp = Date.now();
  $.dynaform.naming.arrayItem = function(name, index) {
    return name + '[$' + timestamp + '_' + index + ']';
  };
};