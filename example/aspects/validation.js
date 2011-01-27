exports.depends = require('../../').jquery;

exports.assets = {
   name: 'validate',
   js: {
     client: __dirname + '/support/jquery.validate.js',
     server: __dirname + '/support/jquery.validate.js'
   },
   cdn: '//ajax.microsoft.com/ajax/jquery.validate/1.7/jquery.validate.min.js',
   test: 'jQuery.fn.validate'
};

