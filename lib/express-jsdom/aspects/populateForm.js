exports.depends = 'jquery';

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
        event = $.Event('click');

        event.preventDefault();
        $.event.trigger(event, null, el);
        el.click();
      }
      else {
        $('form').submit();
      }
    }
  });
};
