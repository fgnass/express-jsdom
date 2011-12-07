/**
 * Module dependencies
 */
var fs = require('fs'),
    Path = require('path'),
    vm = require('vm');

exports.stringify = function stringify(obj) {
  var fn = [];
  return JSON.stringify(obj, function(key, value) {
    if (typeof value == 'function') {
      fn.push(value);
      return 'function<' + fn.length + '>';
    }
    return value;
  }).replace(/"function<(\d+)>"/g, function(m, i) {
    return fn[i-1].toString();
  });
};

exports.getDocument = function(obj) {
  if (obj.document) obj = obj.document;
  return obj.nodeType == 9 ? obj : obj.ownerDocument;
};

exports.listenOnce = function(node, event, listener) {
  function fn() {
    listener.apply(this, arguments);
    node.removeEventListener(event, fn);
  }
  node.addEventListener(event, fn);
};

exports.trigger = function(target, name, opts) {
  opts = exports.merge({type: 'Event', bubbles: true, cancelable: true}, opts);
  var ev = exports.getDocument(target).createEvent(opts.type);
  ev.initEvent(name, opts.bubbles, opts.cancelable);
  ev.detail = opts.detail;
  target.dispatchEvent(ev);
};


/**
 * Invokes the given function using arguments from the specified
 * context.
 * The arguments are looked up *by name*. Therefore the function's
 * toString() representation is parsed. The extracted argument names
 * are cached.
 */
exports.applyWithNamedArgs = function(fn, ctx, window) {
  var names = fn.argumentNames;
  if (!names) {
    var m = fn.toString().match(/^function.*?\(\s*(.*?)?\s*\)/);
    fn.argumentNames = names = m && m[1] ? m[1].split(/\s*,\s*/) : [];
  }
  return fn.apply(window || ctx, names.map(function(name) {
    return ctx[name] || window[name];
  }));
};

/**
 * Returns a new array that contains all truthy property values with
 * the given name.
 */
exports.pluck = function(array, property) {
  return array.filter(function(item) { 
    return !!item[property];
  })
  .map(function(item) { 
    return item[property];
  });
};

/**
 * Returns the first element from the array for which the
 * callback returns a truthy value.
 */
exports.find = function(array, callback) {
  for (var i = 0, len = array.length; i < len; i++) {
    var value = array[i];
    if (callback(value, i)) {
      return value;
    }
  }
  return null;
};

/**
 * Returns the index oft the first element from the array
 * for which the callback returns a truthy value.
 */
exports.findIndex = function(array, callback) {
  for (var i = 0, len = array.length; i < len; i++) {
    var value = array[i];
    if (callback(value, i)) {
      return i;
    }
  }
  return -1;
};


exports.getModule = function(obj) {
  var cache = require.cache;
  var modules = Object.keys(cache).map(function(key) { return cache[key]; });
  return exports.find(modules, function(mod) {
    return mod.exports === obj;
  });
};

/**
 * Thin wrapper around process.binding('evals').Script that handles
 * the loading of the file reading.
 *
 * @constructor 
 */
function JavaScript(filename) {
  this.filename = filename;
  this.code = fs.readFileSync(filename, 'utf8');
  //We don't do this because of https://github.com/ry/node/issues/203
  //this.script = new Script(this.code, this.filename);
}
JavaScript.prototype = {
  run: function(ctx) {
    vm.runInNewContext(this.code, ctx, this.filename);
  },
  runInWindow: function(window) {
    window.run(this.code, this.filename);
  }
};

/**
 * Same interface as our JavaScript wrapper, but takes a list of
 * files which are all run sequentially.
 *
 * @constructor 
 */
function ScriptSequence(files) {
  if (!Array.isArray(files)) {
    files = [files];
  }
  this.scripts = [];
  for (var i = 0, len = files.length; i < len; i++) { 
    this.scripts.push(new JavaScript(files[i]));
  }
}
ScriptSequence.prototype = {
  scripts: null,
  run: function(ctx) {
    for (var i = 0, len = this.scripts.length; i < len; i++) {
      this.scripts[i].run(ctx);
    }
  },
  runInWindow: function(win) {
    for (var i = 0, len = this.scripts.length; i < len; i++) {
      this.scripts[i].runInWindow(win);
    }
  }
};

exports.load = function(files) {
  return new ScriptSequence(files);
};

exports.merge = function(a, b){
  if (a && b) {
    for (var key in b) {
      a[key] = b[key];
    }
  }
  return a;
};

exports.Listeners = function() {
  var listeners = [];
  this.add = function(emitter, event, fn) {
    emitter.on(event, fn);
    listeners.push([emitter, event, fn]);
  };
  this.destroy = function() {
    function stopListening(emitter, event, fn) {
      emitter.removeListener(event, fn);
    }
    listeners.forEach(function(args) {
      stopListening.apply(this, args);
    });
    listeners.length = 0;
  };
};
