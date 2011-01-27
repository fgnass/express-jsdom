(function($) {

  $.updatePropagations = function() {
    $('.synthid').each(function() {
      this.name = '';
    });
    $(':submit:not([name])').each(function(i) {
      this.name = 'btn' + i;
      $(this).addClass('synthid');
    });
  };

  function applyChanges(changes) {
    $.each(changes, function() {
      $.fn[this.fn].apply($(this.sel), this.args);
    });
    $.updatePropagations();
  }

  /**
   * Posts a form via AJAX and performs an incremental UI update. The response must be an array
   * of JSON objects with the following properties:
   * {
   *   sel: String, // A jQuery selector
   *   fn: String, // The name of a jQuery method, eg. 'append'
   *   args: Array // Array of arguments to pass to fn (optional)
   * }
   */
  $.ajaxPost = function(form) {
    var data = $(form).serialize();
    $.post(form.action || '?', data, applyChanges, 'json');
  };

  $(':submit').live('click', function(ev) {
    var el = ev.target;
    $('<input>', {type: 'hidden', name: el.name, value: el.value}).addClass('submitButton').appendTo(el.form);
  });

  $('form').live('submit', function(ev) {
    var form = ev.target;
    ev.preventDefault();
    $.ajaxPost(form);
    $('.submitButton[type=hidden]', form).remove();
  });

  $('form').live('sortupdate', function(ev) {
    $.updatePropagations();
  });

  $.fn.relayEvent = function(eventType) {
    var $this = this;
    this.bind(eventType, function(ev) {
      var target = this.id;
      $.ajax({
        type: 'POST', 
        url: '?', 
        data: {_windowId: $('html').data('window-id')}, 
        beforeSend: function(xhr) {
          xhr.setRequestHeader('X-Event-Type', eventType);
          xhr.setRequestHeader('X-Event-Target', target);
        }, 
        success: applyChanges, 
        dataType: 'json'
      });
    });
  };

})(jQuery);