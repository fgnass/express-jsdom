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
    $.serverMessage = true;
    if (msg.event) {
      $(msg.target || document).trigger(msg.event, msg.data);
    }
    if (msg.fn) {
      var sel = msg.selector;
      var m = />text\(\d*\)$/.exec(sel);
      if (m) {
        sel = sel.substring(0, m.index);
      }
      var el = $(sel);
      if (m) {
        el = el.get(0).childNodes[~~m[1]];
      }
      jQuery.fn[msg.fn].apply(el, eval(msg.args));
    }
    $.serverMessage = false;
  });

  $.sendEvent = function(ev) {
    if (!ev.sent) {
      var msg = {
        event: flatten(ev),
        target: getSelector(ev.target)
      };
      socket.send(msg);
      ev.sent = true;
    }
  };

  $.fn.relay = function(eventType) {
    this.bind(eventType, $.sendEvent);
    return this;
  };

  $.fn.liveRelay = function(eventType) {
    this.live(eventType, $.sendEvent);
    return this;
  };

  $.fn.insertAt = function(i, html) {
    var el = this.get(0);
    var ref = el.childNodes[i];
    var f = document.createElement('div');
    f.innerHTML = html;
    var child = f.firstChild;
    el.insertBefore(child, ref);
    this.trigger('DOMModified');
  };

  $.fn.removeAt = function(i, html) {
    var el = this.get(0);
    el.removeChild(el.childNodes[i]);
    this.trigger('DOMModified');
  };

})(window, jQuery);