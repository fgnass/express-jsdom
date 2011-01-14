exports.depends = require('./jquery');

exports.onLoad = function($, window, req) {

  // Find name-less submit buttons and assign a synthetic name based on their
  // position within the DOM
  $(':submit:not([name])').each(function(i) {
    this.name = 'btn' + i;
    $(this).addClass('synthid');
  });

  if (req.body) {
    var submit;
    console.dir(req.body);
    $.each(req.body, function(name, value) {
      var el = $(':input[name=' + name + ']');
      if (el.is(':submit')) {
        console.log('*click*', name);
        submit = el;
      }
      else {
        console.log(name, ' => ', value);
        el.val(value);
      }
    });
    if (submit) {
      submit.trigger('beforeClick').click(); //.get(0).click();
    }
  }
};

// As the DOM might have been modified, update the synthetic names:
exports.beforeRender = function($) {
  $('.synthid').each(function() {
    this.name = '';
  });
  $(':submit:not([name])').each(function(i) {
    this.name = 'btn' + i;
    $(this).addClass('synthid');
  });
};