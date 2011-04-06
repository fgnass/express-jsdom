(function(window, $) {

  var socket;

  function getSelector(el) {
    var paths = [], sibling;
    if (el.nodeType !== 1) {
      return null;
    }
    for (; el && el.nodeType === 1; el = el.parentNode) {
      if (el.id) {
        paths.unshift('#' + el.id);
        break;
      }
      var index = 0;
      for (sibling = el.previousSibling; sibling; sibling = sibling.previousSibling) {
        if (sibling.nodeType === 9) {
          continue;
        }
        if (sibling.nodeName === el.nodeName) {
          ++index;
        }
      }
      var tagName = el.nodeName.toLowerCase();
      paths.unshift(tagName + ':eq(' + index + ')');
    }
    return paths.join('>');
  }

  function flatten(ev) {
    var prop, val, flat = {};
    for (prop in ev) {
      if (!/^jQuery\d+/.test(prop)) {
        val = ev[prop];
        if (~['string', 'boolean', 'number'].indexOf(typeof val)) {
          flat[prop] = val;
        }
      }
    }
    return flat;
  }

  $(window).bind('serverConnect', function(ev, s) {
    socket = s;
  });

  $(window).bind('serverMessage', function(ev, msg) {
    console.log('Message', msg, socket);
    if (msg.event) {
      $(msg.target || document).trigger(msg.event, msg.data);
    }
    if (msg.fn) {
      jQuery.fn[msg.fn].apply($(msg.selector), eval(msg.args));
    }
  });

  $.sendEvent = function(ev) {
    var msg = {
      event: flatten(ev),
      target: getSelector(ev.target)
    };
    socket.send(msg);
  };

  $.fn.relay = function(eventType) {
    this.bind(eventType, $.sendEvent);
    return this;
  };

  $.fn.liveRelay = function(eventType) {
    this.live(eventType, $.sendEvent);
    return this;
  };
})(window, jQuery);