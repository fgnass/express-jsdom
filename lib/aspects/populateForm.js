var utils = require('../utils');

exports.depends = '$';

exports.apply = function($, window, req) {
  $(function() {
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
        el = submit[0];
        el.click();
      }
      else {
        $('form').submit();
      }
    }
  });
};
