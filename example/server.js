require.paths.unshift(__dirname + '/../lib');

var sys = require('sys'),
    express = require('express'),
    dom = require('express-jsdom'),
    dynaform = require('./aspects/dynaform'),
    validation = require('./aspects/validation');

dom.use(dom.populateForm)
   .use(dom.redirectAfterPost)
   .use(require('./aspects/default'));

var session = express.session({store: new express.session.MemoryStore(), secret: Date.now()});

var app = express.createServer();
app.configure(function() {
  app.use(express.bodyDecoder())
     .use(express.cookieDecoder())
     .use(app.router)
     .use(express.errorHandler({showStack: true, formatUrl: 'txmt'}));
});

console.log('After app.configure()');
console.dir(app.stack);

app.serve('/session', dom.saveState(session), function($) {
  var clicks = 0;
  $('#foo').relay('click', function() {
    $('#counter').text(++clicks);
  });
});

app.get('/simple', dom.serve(__dirname + '/views/form'));

app.get('/jquery', dom.serve(__dirname + '/views/form', dom.jquery, function($) {
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

  $('input[name=email]').remote(function(value) {
    return value !== 'fgnass@neteye.de';
  }, 'Address already taken.');
});

app.serve('/dynaform', dom.saveState(session), dynaform, function($, req) {
//app.serve('/dynaform', dynaform, function($, req) {
  /*
  $.dynaform.register({
    upload: function(options, upload) {
      return upload(options).upload();
    }
  });
  */
  $('#elements').dynaform(req.json || {}, function() { //TODO: init with backing data
    this.text('name')
      .text('mail')
      .textarea('comment', {required: true, label: 'Kommentar'})
      .datepicker('birthday')
      .upload('photo')
      .list('phoneNumbers', {dragAndDrop: true}, function() {
        this.text();
      })
      .list('addresses', {min: 1}, function() {
        this.nested(function() {
          this.text('city')
            .text('street');
        });
      });
  });
});

if (!module.parent) {
  app.listen(8081);
}
