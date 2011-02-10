exports.depends = 'jquery';

exports.onLoad = function($, window, req) {

  // Find name-less submit buttons and assign a synthetic name based on their
  // position within the DOM
  $(':submit:not([name])').each(function(i) {
    this.name = 'btn' + i;
    $(this).addClass('synthid');
  });

  if (req.body) {
    var el, submit, event;
    $.each(req.body, function(name, value) {
      el = $(':input[name=' + name + ']');
      if (el.is(':submit')) {
        submit = el;
      }
      else {
        el.val(value);
      }
    });
    if (submit) {
      submit.trigger('beforeClick');

      el = submit[0];
      event = $.Event('click');

      event.preventDefault();
      $.event.trigger(event, null, el);
      el.click();
    }
    else {
      $('form').trigger('beforeClick').submit();
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