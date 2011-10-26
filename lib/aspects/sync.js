var utils = require('../utils');
var DomSync = require('./support/domsync');
var Events = require('jsdom').level(2, 'events');

exports.depends = ['relay', {js: __dirname + '/support/domsync.js'}];

exports.client = function() {
  var domsync = new DomSync(document, 'cl');

  $.fn.liveSync = function(on) {
    if (on === false) {
      this.die('.liveSync');
    }
    else {
      this.live('DOMSubtreeModified.liveSync', function(ev) {
        domsync.sendOnNextTick(this, true);
        ev.stopPropagation();
      });
    }
    return this;
  };

  $.fn.sendDom = function() {
    this.each(function() {
      domsync.send(this);
    });
    return this;
  };

  $(window).bind('serverConnect', function(ev, socket) {
    domsync.setSocket(socket);
  });
};

exports.apply = function($, window, document) {

  $.fn.mutate = function(fn) {
    // No client connected, pass through
    return this.each(fn);
  };

  var domsync = new DomSync(document, 'se');

  $(document).bind('render', function() {
    domsync.identifyAll(document.documentElement, 1);
  });

  $(window).bind('clientConnect', function(ev) {
    var socket = ev.detail;
    var dirty = [];
    var capture = 0;

    document.implementation.addFeature('MutationEvents', '2.0');
    domsync.setSocket(socket, function(el) {
      utils.trigger(el, 'domsync');
    });

    function nodeModified(ev) {
      if (capture) {
        var el = ev.target.parentNode;
        if (!~dirty.indexOf(el)) {
          dirty.push(el);
        }
      }
    }

    document.addEventListener('DOMNodeInserted', nodeModified);
    document.addEventListener('DOMNodeRemoved', nodeModified);
    document.addEventListener('DOMAttrModified', nodeModified);
    document.addEventListener('DOMCharacterDataModified', nodeModified);

    function flushDirtyNodes() {
      utils.trigger(document, 'flush');
      if (dirty.length) {
        var prevState = capture;
        capture = 0; // Ignore mutation events triggered by domsync.send()
        dirty.forEach(function(el) {
          domsync.send(el);
        });
        dirty = [];
        capture = prevState;
      }
    }

    var _dispatchEvent = Events.EventTarget.prototype.dispatchEvent;
    Events.EventTarget.prototype.dispatchEvent = function(event) {
      if (~event.type.indexOf('DOM')) {
        return _dispatchEvent.apply(this, arguments);
      }
      else {
        var prevState = capture;
        capture = 1;
        $.client.pause();
        var ret = _dispatchEvent.apply(this, arguments);
        if (!prevState) flushDirtyNodes();
        capture = prevState;
        $.client.unpause();
        return ret;
      }
    };

    $.fn.mutate = function(fn) {
      var prevState = capture;
      capture = 1;
      $.client.pause();
      this.each(fn);
      flushDirtyNodes();
      $.client.unpause();
      capture = prevState;
      return this;
    };

  });

};