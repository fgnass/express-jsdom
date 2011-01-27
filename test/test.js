var tobi = require('tobi'),
  app = require('../example/server'),
  browser = tobi.createBrowser(app);

browser.get('/form', function(res, $) {
  res.should.have.status(200);
  $('form')
    .fill({ name: 'Felix', email: 'fgnass@neteye.de' })
    .submit(function(res, $) {
      res.should.have.status(200);
      $('.error').should.include.text('Address already taken.');
      console.log('successful');
      process.exit();
    });
});