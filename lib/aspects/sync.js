var utils = require('../utils');
var DomSync = require('./support/domsync');
var Events = require('jsdom').level(2, 'events');

exports.depends = ['relay', {js: __dirname + '/support/domsync.js'}];

exports.client = function() {
  var domsync = new DomSync(document, 'cl');

  DomSync.defaultFilter.whitelist = function(el) {
    return el.getAttribute('data-doc') && el.getAttribute('data-model');
  };

  var sync = true;
  var dirty = [];
  var flush;

  var flushOnNextTick = function() {
    setTimeout(flushDirtyNodes, 0);
  };

  if (window.MessageChannel) {
    var mc = new MessageChannel();
    mc.port1.onmessage = flushDirtyNodes;
    flushOnNextTick = function() {
      mc.port2.postMessage(0);
    };
  }

  function sendOnNextTick(el) {
    if (!~dirty.indexOf(el)) {
      dirty.push(el);
      if (!flush) {
        flush = 1;
        flushOnNextTick();
      }
    }
  }

  function flushDirtyNodes() {
    domsync.sendBatch(dirty, true);
    dirty = [];
    flush = 0;
  }

  /*
   * Set the `sync` property of all synced elements. This way we
   * can determine whether a node was cloned while being edited, which happens
   * when the user presses return inside a content-editable element.
   */
  $(function() {
    $('[id]').each(function() {
      this.sync = this.id;
    });
  });

  /*
   * Captures all DOMSubtreeModified events and sends them to the server.
   */
  $.fn.liveSync = function(on) {
    if (on === false) {
      this.die('.liveSync');
    }
    else {
      this.live('DOMSubtreeModified.liveSync', function(ev) {
        var el = ev.target;
        if (sync && el.sync && !domsync.syncing) {
          sendOnNextTick(el);
        }
        ev.stopPropagation();
      });
    }
    return this;
  };

  /*
   * Executes a jQuery method while bypassing any liveSync listeners.
   */
  $.fn.silently = function(method) {
    var prev = sync;
    sync = false;
    try {
      return $.fn[method].apply(this, Array.prototype.slice.call(arguments, 1));
    }
    finally {
      sync = prev;
    }
  };

  /*
   * Manually sends the DOM of the matched elements to the server.
   */
  $.fn.sendDom = function() {
    domsync.sendBatch(this.get());
    return this;
  };

  $(window).bind('serverConnect', function(ev, socket) {
    domsync.setSocket(socket);
  });
};

exports.apply = function($, window, document) {

  $.fn.mutate = function(fn) {
    if (typeof fn == 'function') {
      return this.each(fn);
    }
    return $.fn[fn].apply(this, Array.prototype.slice.call(arguments, 1));
  };

  var domsync = new DomSync(document, 'se');

  $(document).bind('render', function() {
    domsync.identifyAll(document.documentElement, 1);
  });

  $(window).bind('clientConnect', function(ev) {
    var socket = ev.which;
    var dirty = [];
    var capture = 0;

    document.implementation.addFeature('MutationEvents', '2.0');
    domsync.setSocket(socket, function(which) {
      utils.trigger(document, 'domsync', {which: which});
    });

    function nodeModified(ev) {
      if (capture && !domsync.syncing) {
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
        domsync.sendBatch(dirty);
        dirty = [];
        capture = prevState;
      }
    }

    function captureMutations(fn, thisObj, args) {
      var prevState = capture;
      var ret;
      capture = 1;
      $.client.pause();
      try {
        ret = fn.apply(thisObj, args);
      }
      finally {
        if (!prevState) flushDirtyNodes();
        $.client.unpause();
        capture = prevState;
      }
      return ret;
    }

    var _dispatchEvent = Events.EventTarget.prototype.dispatchEvent;
    Events.EventTarget.prototype.dispatchEvent = function(event) {
      if (~event.type.indexOf('DOM')) {
        return _dispatchEvent.apply(this, arguments);
      }
      else {
        return captureMutations(_dispatchEvent, this, arguments);
      }
    };

    var _mutate = $.fn.mutate;
    $.fn.mutate = function() {
      return captureMutations(_mutate, this, arguments);
    };

  });

};