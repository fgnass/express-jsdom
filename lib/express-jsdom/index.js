/**
 * Module dependencies
 */
var fs = require('fs'),
  http = require('http'),
  Path = require('path'),
  Server = require('express').Server,
  jsdom = require('jsdom'),
  html5 = require('html5'),
  utils = require('./utils'),
  assets = require('./assets'),
  cache = {};

/**
 * List of global aspects. Contains the built-in asset manager by default.
 */
var globalAspects = [assets.aspect];

/**
 * Adds an aspect definition to the specified array.
 *
 * @param {Array|Object|string} aspect Aspect definition
 * @param {Array} target The target list
 */
function addAspect(aspect, target) {
  if (aspect) {
    if (Array.isArray(aspect)) {
      aspect.forEach(function(a) {
        addAspect(a, target);
      });
    }
    else {
      if (typeof aspect == 'string') {
        aspect = require(aspect);
      }
      if (target.indexOf(aspect) == -1) {
        addAspect(aspect.depends, target);
        if (aspect.assets) {
          var name = assets.register(aspect.assets);
          var a = {
            onInit: function(assets) {
              assets.include(name);
              }
          };
          target.push(a);
        }
        target.push(aspect);
      }
    }
  }
}

/**
 * Adds the given aspect to the list of global aspects.
 *
 * @returns exports for chaining
 */
exports.use = function(a) {
  addAspect(a, globalAspects);
  return exports;
};

/**
 * Creates a new jsdom document.
 */
function createNewDocument(url, html) {
  return jsdom.jsdom(html, null, {
    url: url,
    features : {
      FetchExternalResources: false,
      ProcessExternalResources: false,
      MutationEvents: false
    },
    parser: html5,
    deferClose: true
  });
}

/**
 * Reads the HTML document denoted by the given path.
 *
 * @returns {HTMLDocument} The parsed document
 */
function loadDocument(path) {
  var doc, 
      key = path || 'about:blank',
      root = cache[key];

  if (!root) {
    var html = path ? fs.readFileSync(path, 'utf8') : '<html><head></head><body></body></html>';
    doc = createNewDocument(path, html);
    root = cache[key] = doc.documentElement;
  }
  doc = createNewDocument(path, false);
  doc.appendChild(doc.importNode(root, true));
  return doc;
}

/**
 * Checks if the middleware stack of the given app contains the DOM
 * middleware, and if not, injects it right before the connect router.
 *
 * @param {Server} The express server
 */
function useDomMiddleware(app) {
  if (!app.__usedDomMiddleware) {
    var i = utils.find(app.stack, function(layer) {
       return layer.handle.name == 'domMiddleware';
    });
    if (!~i) {
      i = utils.find(app.stack, function(layer) {
         return layer.handle == app.router;
      });
      app.stack.splice(i, 0, {route: '', handle: exports.middleware()});
    }
    app.__usedDomMiddleware = true;
  }
}

/**
 * Convenience method. The following to lines a equivalent:
 *
 *     app.serve('/path')
 *     
 *     app.all('/path', dom.serve('/path'))
 *     
 */
Server.prototype.serve = function(view, fn) {
  var args = Array.prototype.slice.call(arguments),
      root = this.set('views') || process.cwd() + '/views',
      path = args[0] = Path.join(root, view),
      handler = exports.serve.apply(this, args);

  this.all(view, handler);
  useDomMiddleware(this);
};

/**
 * Creates an express handler that serves a document.
 *
 * Usage:
 *
 *      app.get('/route', dom.serve('/doc.html', function(document) {
 *        document.title = 'Hello World';
 *      }));
 *
 */
exports.serve = function serve() {
  var path,
      fn,
      args = Array.prototype.slice.call(arguments);

  if (args.length > 0) {
    if (typeof args[0] != 'function') {
      path = args.shift();
      if (!~path.indexOf('.')) {
        path += '.html';
      }
    }
    fn = args.pop();
  }

  var aspects = globalAspects.concat();
  if (args.length > 0) {
    addAspect(args, aspects);
  }

  var stack = utils.pluck(aspects.filter(function(a) {
    return !~globalAspects.indexOf(a);
  }), 'middleware');

  stack.push(function middleware(req, res) {
    var document = loadDocument(path),
      window = document.parentWindow,
      options = {};

    delete window.context;

    function Context() {}
    Context.prototype = window;
    var ctx = new Context();

    ctx.context = ctx;
    ctx.options = options;
    ctx.req = req;
    ctx.res = res;
    window.context = ctx;

    function applyAspects(phase) {
      aspects.forEach(function(aspect) {
        var f = aspect[phase];
        if (f) {
          utils.applyWithNamedArgs(f, ctx);
        }
      });
    }

    applyAspects('onInit');
    if (fn) {
      utils.applyWithNamedArgs(fn, ctx);
    }

    window.addEventListener('load', function onload() {
      applyAspects('onLoad');
      applyAspects('beforeRender');
      if (options.send) {
        utils.applyWithNamedArgs(options.send, ctx);
      }
      else {
        var html;
        if (options.render) {
         html = utils.applyWithNamedArgs(options.render, ctx);
        }
        else {
         html = ctx.document.outerHTML;
        }
        ctx.res.send(html || '', options.headers, options.status);
      }
    });

    document.close();
  });

  return function route(req, res, outerNext) {
    var i = 0;
    (function next(err) {
      var layer = stack[i++];
      if (err || !layer) {
        outerNext(err);
      }
      else {
        layer(req, res, next);
      }
    })();
  };
};

/**
 * Creates a connect middleware function that in turn applies
 * all the middleware functions provided by the global aspects.
 */
exports.middleware = function() {
  var stack = utils.pluck(globalAspects, 'middleware');
  return function domMiddleware(req, res, outerNext) {
    var i = 0;
    (function next(err) {
      var layer = stack[i++];
      if (err || !layer) {
        outerNext(err);
      }
      else {
        layer(req, res, next);
      }
    })();
  };
};

/**
 * All bundled aspects are exposed via getters on the module's exports.
 */ 
exports.aspects = {};

fs.readdirSync(__dirname + '/aspects').forEach(function(filename) {
  if (/\.js$/.test(filename)) {
    var name = Path.basename(filename, '.js');
    Object.defineProperty(exports.aspects, name, { get: function() {
      return require('./aspects/' + name);
    }});
  }
});

exports.__proto__ = exports.aspects;

/**
 * Monkey-patch jsdom to disable HTML beautification for performance reasons.
 */
require('jsdom/browser/domtohtml').formatHTML = function(s) { return s; };
