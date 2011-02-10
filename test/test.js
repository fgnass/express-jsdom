var tobi = require('tobi'),
  app = require('../example/server'),
  browser = tobi.createBrowser(app);

browser.get('/form', function(res, $) {
  res.should.have.status(200);
  $('form')
    .fill({ name: 'Felix'})
    .submit(function(res, $) {
      res.should.have.status(200);
      $('.error').should.include.text('This field is required.');
      console.log('successful');
      process.exit();
    });
});