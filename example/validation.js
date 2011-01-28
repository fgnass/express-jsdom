exports.depends = 'jquery';

exports.assets = {
   name: 'validate',
   js: __dirname + '/assets/jquery.validate.js',
   server: true,
   cdn: '//ajax.microsoft.com/ajax/jquery.validate/1.7/jquery.validate.min.js',
   test: 'jQuery.fn.validate'
};

exports.onInit = function($) {
  $.clientAndServer('validate');
};

