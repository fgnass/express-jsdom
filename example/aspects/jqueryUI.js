exports.depends = require('../../').jquery;

exports.assets =  { // Use source-dist instead to select individual components
  css: __dirname + '/support/jquery-ui/jquery-ui.css',
  js: {
    client: __dirname + '/support/jquery-ui/jquery-ui.js',
    server: __dirname + '/support/jquery-ui/jquery-ui-proxy.js'
  }
};
