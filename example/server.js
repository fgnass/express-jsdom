require.paths.unshift(__dirname + '/../lib');

var sys = require('sys'),
  express = require('express');

var app = express.createServer();
app.configure(function() {
  app.use(express.bodyDecoder())
     .use(express.staticProvider(__dirname + '/public'))
     .register('.html', require('express-jsdom'))
     .set('views', __dirname + '/views')
     .set('view options', {documentRoot: __dirname + '/public'})
     .use(app.router)
     .use(express.errorHandler({showStack: true, formatUrl: 'txmt'}));
});

app.get('/', function(req, res) {
  var options = {};

  // This is a field-validation request
  if (req.isXMLHttpRequest) {
    // Use a custom render function to return the validation result, rather than the whole document
    options.render = function(window, options) {
      var name = req.query.validate,
        value = req.query[name],
        input = window.$(':input[name=' + name + ']');

      // Set the value
      input.val(value);

      // Invoke the jquery.validate plugin
      var validator = input.closest('form').validate();
      var valid = validator.element(input);

      // Return 'true' (if valid) or the error message
      return (JSON.stringify(valid || validator.errorMap[name]));
    };
  }
  res.render('form.html', options);
});

app.post('/', function(req, res) {
  res.render('form.html', {
    onready: function(window) {
      var $ = window.$,
        validator = $('form').validate();

      // Populate the form fields 
      $.each(req.body, function(name, value) {
        $(':input[name=' + name + ']').val(value);
      });
      validator.form();
    } 
  });
});

app.listen(8081);
