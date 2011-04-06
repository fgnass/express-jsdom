/**
 * Module dependencies
 */
var fs = require('fs'),
  express = require('express');

/**
 * Create the server and make it available to integration tests via module.exports.
 */
var app = module.exports = express.createServer();

/**
 * Configuration and middleware setup
 */
app.configure(function() {
  app.use(express.bodyParser())
     .use(express.cookieParser())
     .use(app.router)
     .use(express.errorHandler({showStack: true, formatUrl: 'txmt'}));
});

dom = require('express-jsdom')(app)
  .use({css: './assets/default.styl'});

/**
 * Empty document with only global aspects applied.
 */
dom.get('/simple', function(document) {
  document.title = 'Hello world';
});

/**
 * H1 created with jQuery.
 */
dom.get('/jquery', 'jquery', function($) {
	$('body').append('<h1>Hello</h1>');
});

/**
 * Websocket example.
 */
dom.get('/socket', 'relay', function($) {

	$('<h1>Hello</h1>').appendTo('body').relay('click', function() {
	  $(this).after("<h2>world</h2>");
	});

	$('h2').liveRelay('click', function() {
	  $(this).remove();
	});
});

/**
 * Form validation example.
 */
dom.all('/form', dom.parse, require('./validation'), function($) {
  $('form').submitDefault(function() {
    $(this).before('Thanks!');
    this.reset();
  })
  .clientAndServer('validate', {
    wrapper: 'b',
    errorElement: 'span'
  });
});


dom.get('/async', function(document, res) {
  fs.realpath(__filename, res.defer(function(err, resolvedPath) {
    document.title = resolvedPath;
  }));
  fs.readdir(__dirname, res.defer(function(err, files) {
    document.body.innerHTML = files.join('<br>');
  }));
});

if (!module.parent) {
  app.listen(8081);
}

