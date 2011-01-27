/**
 * View aspect that enables incremental UI updates. It captures all mutation events
 * dispatched after a click event has bee triggered and sends them to the client as
 * a list of jQuery operations. 
 */
var getSelector = require('../utils').getSelector;

exports.depends = require('./populateForm');

exports.assets = {
  js: {
    client: __dirname + '/support/jquery.relay-client.js',
    server: __dirname + '/support/jquery.relay-server.js'
  }
};

function Updates() {
}
Updates.prototype = {
  record: function() {
    this.changes = [];
    this.insertedNodes = [];
    this.enabled = true;
  },
  addNode: function(el) {
    if (this.enabled && !this.willBeInserted(el)) {
      this.insertedNodes.push(el);
      if (el.previousSibling) {
        this.addChange(el.previousSibling, 'after', el);
      }
      else {
        this.addChange(el.parentNode, 'prepend', el);
      }
    }
  },
  removeNode: function(el) {
    if (this.enabled) {
      if (el.nodeType == 3) {
        this.addChange(el.parentNode, 'text', '');
      }
      else {
        this.addChange(el, 'remove');
      }
    }
  },
  changeAttr: function(el, name, value) {
    if (this.enabled && el._attachedToDocument && !this.willBeInserted(el)) {
      var sel = getSelector(el);
      var c = this.findChange(sel, 'attr');
      if (!c.args) {
        c.args = [{}]; 
      }
      c.args[0][name] = value;
    }
  },
  findChange: function(sel, fn) {
    for (var i = 0, l = this.changes.length; i < l; i++) {
      var c = this.changes[i];
      if (c.sel == sel && c.fn == fn) {
        return c;
      }
    }
    return this.addChange(sel, fn);
  },
  addChange: function(sel, fn, args) {
    if (sel.nodeName) {
      sel = getSelector(sel);
    }
    if (args !== undefined && !Array.isArray(args)) {
      args = [args];
    }
    var c = {sel: sel, fn: fn, args: args};
    this.changes.push(c);
    return c;
  },
  willBeInserted: function(el) {
    return this.insertedNodes.some(function(node) {
      var e = el;
      while (e && e !== node) {
        e = e.parentNode;
      }
      return e === node;
    });
  },
  serialize: function() {
    this.enabled = false;
    return JSON.stringify(this.changes, function(key, value) {
      if (value && value.nodeType) {
        return value.nodeType == 3 ? value.value : value.outerHTML;
      }
      return value;
    });
  }
};

exports.onInit = function($, window, document) {
  var updates = window.updates = new Updates();
  document.addEventListener('DOMNodeInserted', function(ev) {
    updates.addNode(ev.target);
  });
  document.addEventListener('DOMNodeRemoved', function(ev) {
    updates.removeNode(ev.target);
  });
  document.addEventListener('DOMAttrModified', function(ev) {
    updates.changeAttr(ev.target, ev.attrName, ev.newValue);
  });

  $(document).bind('beforeClick', function(ev, ctx) {
    updates.record();
    document.implementation.addFeature('MutationEvents', '2.0');
    window.assets.reset();
  });
};

exports.onLoad = function($, document, req, options) {
  if (req.xhr) {
    var ev = req.header('X-Event-Type');
    if (ev) {
      $(document).trigger('beforeClick');
      $('#' + req.header('X-Event-Target')).trigger(ev);
    }
    options.render = function(window) {
      return window.updates.serialize();
    };
  }
};