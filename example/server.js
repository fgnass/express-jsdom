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
 * H1 created with zepto.js.
 */
dom.get('/zepto', '$', function($) {
  $('body').append('<h1>Hello</h1>');
});

/**
 * Plain express response.
 */
app.get('/express', function(req, res) {
  res.send('<html><body><h1>Hello</h1></body></html>');
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

dom.get('/live', dom.parse('form.html'), 'liveStyle');

/**
 * Form validation with happy.js
 */
dom.all('/form', dom.parse, require('./validation'), function($) {
  $('form').clientAndServer('isHappy', {
    fields: {
      // reference the field you're talking about, probably by `id`
      // but you could certainly do $('[name=name]') as well.
      '#name': {
        required: true,
        message: 'Might we inquire your name'
      },
      '#email': {
        required: true,
        message: 'How are we to reach you sans email??'
        //test: happy.email // this can be *any* function that returns true or false
      }
    }
  })
  .submitDefault(function() {
    $(this).before('<p>Thanks!</p>');
    this.reset();
  });
});

/**
 * Weld example.
 */
dom.get('/weld', dom.parse('contacts.html'), 'weld', function($) {
  var data = [
    { name: 'hij1nx',  title : 'code slayer' },
    { name: 'tmpvar', title : 'code pimp' },
    { name: 'fgnass', title : 'me' }
  ];
  $('.contact').weld(data);
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

