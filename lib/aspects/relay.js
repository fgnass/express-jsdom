exports.depends = 'websocket';

exports.js = 'support/jquery.relay.js';

function $A(arg) {
  return Array.prototype.slice.call(arg);
}

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
      var i = $A(el.parentNode.childNodes).indexOf(el);
      console.log('INS', el.nodeName, i);
      //$(el.parentNode).client('insertAt', i, el.outerHTML || el.nodeValue);
      if (el.previousSibling) {
              $(el.previousSibling).client('after', el.outerHTML || el.nodeValue);
            }
            else {
              $(el.parentNode).client('prepend', el.outerHTML || el.nodeValue);
            }
    });
    document.addEventListener('DOMNodeRemoved', function(ev) {
      console.log('DEL', ev.target.id);
      var el = ev.target;
      //       var i = $A(el.parentNode.childNodes).indexOf(el);
      //       $(el.parentNode).client('removeAt', i);
      $(el).client('remove');
    });
    document.addEventListener('DOMAttrModified', function(ev) {
      $(ev.target).client('attr', ev.attrName, ev.newValue);
    });
  });

  $(window).bind('clientMessage', function(ev, msg) {
    ev = msg.event;
    if (ev) {
      var el = $(msg.target || document);
      ev.__proto__ = document.createEvent('Events');
      ev.initEvent(ev.type, true, true);
      el.get(0).dispatchEvent(ev);
    }
  });

};