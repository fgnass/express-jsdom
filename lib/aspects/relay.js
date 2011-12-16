var utils = require('../utils');
exports.depends = 'websocket';

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
      var prop = (this.type == 'radio' || this.type == 'checkbox') ? 'checked' : 'value';
      $.sendEvent($.extend({}, ev, {type: 'update', which: prop, newValue: this[prop]}));
    });
    this.live('update', function(ev) {
      this[ev.which] = ev.newValue;
      $(this).trigger('change');
    });
    return this;
  };

  $(window).bind('clientConnect', function(ev) {
    var socket = ev.which;
    var events = [];
    var flush = 1;

    function flushClientScripts() {
      if (flush === 1) {
        events.forEach(function(ev) {
          socket.emit.apply(socket, ev);
        });
        events = [];
      }
    }

    $.client = function(selector, fn, args) {
      events.push(['jQuery', {selector: selector, fn: fn, args: utils.stringify(args)}]);
      flushClientScripts();
    };

    $.client.pause = function() {
      flush--;
    };
    $.client.unpause = function() {
      if (flush < 1) flush++;
      flushClientScripts();
    };

    socket.on('clientEvent', function(ev) {
      var target = ev.targetId ? document.getElementById(ev.targetId) : document;
      ev.__proto__ = document.createEvent('Events');
      ev.initEvent(ev.type, true, true);
      if (target) {
        target.dispatchEvent(ev);
      }
      else {
        //throw new Error('No such element: #' + ev.targetId);
        console.log("Can't dispatch", ev.type, "event to non-existing element", ev.targetId);
      }
    });

  });

};

/** Client-side code */

exports.client = function() {

  var socket;
  $(window).bind('serverConnect', function(ev, s) {
    socket = s;
  });

  var props = "type altKey attrChange attrName button charCode clientX " +
    "clientY ctrlKey data detail keyCode layerX layerY metaKey newValue " +
    "offsetX offsetY pageX pageY prevValue screenX screenY shiftKey " +
    "wheelDelta which".split(" ");

  function flatten(ev) {
    var prop, val, flat = {};
    for (prop in ev) {
      if (~props.indexOf(prop)) {
        flat[prop] = ev[prop];
      }
    }
    return flat;
  }

  $.sendEvent = function(ev) {
    if (typeof ev == 'string') {
      ev = {type: ev, target: document};
    }
    if (!ev.sent) {
      var msg = flatten(ev);
      msg.targetId = ev.target.id;
      socket.emit('clientEvent', msg);
      ev.sent = true;
    }
  };

  $.fn.sendEvent = function(ev, which) {
    if (typeof ev == 'string') {
      ev = {type: ev};
    }
    ev.target = this.get(0);
    if (which) ev.which = which;
    $.sendEvent(ev);
  };

  $.fn.relay = function(eventType) {
    this.bind(eventType, $.sendEvent);
    return this;
  };

  $.fn.liveRelay = function(eventType) {
    this.live(eventType, $.sendEvent);
    return this;
  };

};