exports.depends = 'websocket';

exports.js = 'support/jquery.relay.js';

exports.apply = function($, window, document) {
  $.fn.relay = function(eventType, callback) {
    this.client('relay', eventType);
    if (callback) {
      this.bind(eventType, callback);
    }
    return this;
  };

  $.fn.liveRelay = function(eventType, callback) {
    this.client('liveRelay', eventType);
    if (callback) {
      this.live(eventType, callback);
    }
    return this;
  };

  $.fn.liveUpdate = function() {
    this.client('live', 'change', function(ev) {
      $.sendEvent($.extend({}, ev, {type: 'update', value: this.value}));
    });
    this.live('update', function(ev) {
      $(this).suppressMutationEvents(function() {
        this.get(0).value = ev.value;
      }).trigger('change');
    });
    return this;
  };

  $.fn.suppressMutationEvents = function(fn) {
    var impl = document.implementation,
      f = 'MutationEvents';
    if (impl.hasFeature(f)) {
      impl.removeFeature(f);
      fn.apply(this);
      impl.addFeature(f, '2.0');
    }
    else {
      fn.appy(this);
    }
    return this;
  };

  $(window).bind('clientConnect', function() {
    document.implementation.addFeature('MutationEvents', '2.0');
    document.addEventListener('DOMNodeInserted', function(ev) {
      var el = ev.target;
      if (el.previousSibling) {
        $(el.previousSibling).client('after', el.outerHTML || el.text);
      }
      else {
        $(el.parentNode).client('prepend', el.outerHTML || el.text);
      }
    });
    document.addEventListener('DOMNodeRemoved', function(ev) {
      $(ev.target).client('remove');
    });
    document.addEventListener('DOMAttrModified', function(ev) {
      $(ev.target).client('attr', ev.attrName, ev.newValue);
    });
  });

  $(window).bind('clientMessage', function(ev, msg) {
    if (msg.event) {
      var el = $(msg.target || document);
      var event = $.extend(msg.event, {target: el.get(0)});
      el.trigger(event);
    }
  });

};