require.paths.unshift(__dirname + '/../lib');

/**
 * Module dependencies
 */
var express = require('express'),
    dom = require('express-jsdom'),
    validation = require('./aspects/validation');

/**
 * Global view aspects
 */
dom.use(dom.populateForm)
   .use(dom.redirectAfterPost)
   .use(require('./aspects/default'));

/**
 * Session middleware
 */
var session = express.session({store: new express.session.MemoryStore(), secret: Date.now()});

/**
 * Create the server and make it available to integration tests via module.exports.
 */
var app = module.exports = express.createServer();

/**
 * Configuration and middleware setup
 */
app.configure(function() {
  app.set('views', __dirname + '/views');
  app.use(express.bodyDecoder())
     .use(express.cookieDecoder())
     .use(app.router)
     .use(express.errorHandler({showStack: true, formatUrl: 'txmt'}));
});

/**
 * Stores the DOM state in the session and forwards client-events to the server
 * where the document is updated and the changes are played back on the client.
 */
app.serve('/session', dom.saveState(session), function($) {
  var clicks = 0;
  $('#foo').relay('click', function() {
    $('#counter').text(++clicks);
  });
});

/**
 * Empty document with only global aspects applied.
 */
app.get('/simple', dom.serve());

/**
 * H1 created with jQuery.
 */
app.get('/jquery', dom.serve(function($) {
	$('body').append('<h1>Hello</h1>');
}));

app.serve('/form', validation, function($) {
  $('form').handleSubmit(function() {
    $(this).before('Thanks!');
    this.reset();
  })
  .clientAndServer('validate', {
    wrapper: 'b',
    errorElement: 'span'
  });
});

if (!module.parent) {
  app.listen(8081);
}

