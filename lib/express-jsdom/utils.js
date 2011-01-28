/**
 * Module dependencies
 */
var fs = require('fs'),
    Path = require('path'),
    Script = process.binding('evals').Script;

/**
 * Replaces all occurrences of `{}` with the argument having the same index.
 *
 *     format('Hello {}, what's {}?', 'friend', 'up')
 *     // => 'Hello friend, what's up?'
 */
exports.format = function(msg) {
  var args = arguments, i = 0;
  return msg.replace(/\{\}/g, function() {
    return args[++i];
  });
};

/**
 * Throws a new Error with the given message. Placeholders in the message
 * are replaced with extra arguments.
 * 
 * @throws {Error}
 * @see format
 */
exports.fail = function(msg) {
  throw new Error(exports.format.apply(this, arguments));
};

/**
 * Creates a JQuery selector expression that uniquely identifies the given node.
 *
 * @returns {string} A jQuery selector
 */
exports.getSelector = function getSelector(el) {
  var paths = [], sibling;
  if (el.nodeType === 3) {
    paths.unshift('text()');
    el = el.parentNode;
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
};

/**
 * Invokes the given function using arguments from the specified
 * context.
 * The arguments are looked up *by name*. Therefore the function's
 * toString() representation is parsed. The extracted argument names
 * are cached.
 */
exports.applyWithNamedArgs = function(fn, ctx, thisObject) {
  var names = fn.argumentNames;
  if (!names) {
    var m = fn.toString().match(/^function.*?\(\s*(.*?)?\s*\)/);
    fn.argumentNames = names = m && m[1] ? m[1].split(/\s*,\s*/) : [];
  }
  return fn.apply(thisObject || ctx, names.map(function(name) {
    return ctx[name];
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
      return i;
    }
  }
  return -1;
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
    //this.script.runInNewContext(ctx);
    Script.runInNewContext(this.code, ctx, this.filename);
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
  }
};

exports.load = function(files) {
  return new ScriptSequence(files);
};

exports.watchFile = function watchFile(file, callback) {
  fs.watchFile(file, function (cur, prev) {
    if (cur && +cur.mtime !== +prev.mtime) {
      callback(file);
    }
  });
  return callback;
};

exports.merge = require('connect/utils').merge;

exports.testExpr = function(s) {
  return s.split('.').map(function(p,i,a) { return 'window.' + a.slice(0,i+1).join('.');}).join(' && ');
};