/**
 * Module dependencies
 */
var fs = require('fs'),
  http = require('http'),
  Path = require('path'),
  assert = require('assert'),
  Server = require('express').HTTPServer,
  router = require('express').router,
  methods = router.methods.concat(['del', 'all']),
  jsdom = require('jsdom'),
  html5 = require('html5'),
  utils = require('./utils'),
  assets = require('./assets'),
  cache = {},
  stack;

var baseDir = (function() {
  var p = module.parent;
  while (p && p.id != '.') {
    p = p.parent;
  }
  return Path.dirname(p.filename);
}());

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
      //QuerySelector: false
    },
    parser: html5,
    deferClose: true
  });
}

/**
 * Adds an aspect definition to the specified array.
 *
 * @param {Array|Object|string} aspect Aspect definition
 * @param {Array} target The target list
 */
function addAspect(aspect, target, parentDir) {
  if (aspect) {
    if (Array.isArray(aspect)) {
      aspect.forEach(function(a) {
        addAspect(a, target);
      });
    }
    else {
      if (typeof aspect == 'string') {
        var base = /^[.\/]/.test(aspect) ? parentDir : __dirname + '/aspects';

        aspect = require(Path.resolve(baseDir, base, aspect));
      }
      else if (typeof aspect == 'function') {
        aspect = {apply: aspect};
      }
      if (target.indexOf(aspect) == -1) {
        if (!aspect.baseDir) {
          var mod = utils.getModule(aspect);
          aspect.baseDir = mod && Path.dirname(mod.filename) || baseDir;
        }
        addAspect(aspect.depends, target, aspect.baseDir);
        if (aspect.js) {
          addAspect(assets.include('js', aspect), target);
        }
        if (aspect.css) {
          addAspect(assets.include('css', aspect), target);
        }
        target.push(aspect);
      }
    }
  }
}

/**
 */
function injectMiddleware(app, dom) {
  function domMiddleware(req, res, outerNext) {
    var stack = dom.middlewareStack,
      i = 0;
    (function next(err) {
      var layer = stack[i++];
      if (err || !layer) {
        outerNext(err);
      }
      else {
        layer(req, res, next);
      }
    })();
  }
  var i = utils.findIndex(app.stack, function(layer) {
       return layer.handle == app.router;
  });
  if (i == -1) {
    app.use(app.router);
  }
  app.stack.splice(i, 0, {route: '', handle: domMiddleware});
}

function Dom(app) {
  this.app = app;
  this.globalAspects = [assets.aspect];
  injectMiddleware(app, this);
}
Dom.prototype = Object.create({
  //TODO
}, {
  middlewareStack: {
    get: function() {
      return this._middlewareStack || (this._middlewareStack = utils.pluck(this.globalAspects, 'middleware'));
    }
  }
});

function insertDocument(doc, req, path) {
  path = path || req.url;
  if (!~path.indexOf('.')) {
    path += '.html';
  }
  path = Path.join(baseDir + '/views', path);
  var root = cache[path];
  if (!root) {
    var html = fs.readFileSync(path, 'utf8'),
      newDoc = createNewDocument(path, html);
    //root = cache[key] = doc.documentElement;
    root = newDoc.documentElement;
  }
  doc.open();
  doc.appendChild(doc.importNode(root, true));
}

Dom.prototype.parse = function(document, req) {
  if (typeof document == 'string') {
    // Called directly, not as aspect
    var path = document;
    return function(document, req) {
      insertDocument(document, req, path);
    };
  }
  insertDocument(document, req);
};

function Response(res, context) {
  this.deferreds = [];
  this.res = res;
  this.context = context;
}
Response.prototype = {
  send: function() {
    var html = utils.applyWithNamedArgs(this.render, this.context);
    this.res.send(html || '', this.headers, this.status);
  },
  render: function(document) {
    var ev = document.createEvent('ServerEvents');
    ev.initEvent('render');
    document.dispatchEvent(ev);
    var html = document.outerHTML;
    ev = document.createEvent('ServerEvents');
    ev.initEvent('rendered');
    document.dispatchEvent(ev);
    return html;
  },
  defer: function(fn) {
    var self = this,
      a = this.deferreds,
      deferred = function() {
        var i = a.indexOf(deferred);
        if (!~i)  throw new Error('The proxy returned by res.defer() must be called only once');
        a.splice(i, 1);
        if (fn) fn.apply(this, arguments);
        if (a.length === 0) {
          self.send();
        }
      };
    a.push(deferred);
    return deferred;
  }
};

/**
 * Creates an express handler that serves a document.
 */
Dom.prototype.createHandler = function(aspects) {
  var globalAspects = this.globalAspects,
    allAspects = globalAspects.concat();

  addAspect(aspects, allAspects);

  var routeStack = utils.pluck(allAspects.filter(function(a) {
    return !~globalAspects.indexOf(a);
  }), 'middleware');

  routeStack.push(function middleware(req, res) {
    var document = createNewDocument(req.url, false),
      window = document.parentWindow;

    delete window.context;

    function Context() {}
    Context.prototype = window;
    var ctx = new Context();

    ctx.context = ctx;
    ctx.console = console;
    ctx.req = req;
    ctx.res = new Response(res, ctx);
    ctx.app = req.app;
    //window.context = ctx;

    allAspects.forEach(function(aspect) {
      if (aspect.apply) {
        utils.applyWithNamedArgs(aspect.apply, ctx);
      }
    });
    utils.listenOnce(window, 'load', ctx.res.defer());
    document.close();
  });

  return function route(req, res, outerNext) {
    var i = 0;
    (function next(err) {
      var layer = routeStack[i++];
      if (err || !layer) {
        outerNext(err);
      }
      else {
        layer(req, res, next);
      }
    })();
  };
};

methods.forEach(function(method) {
  Dom.prototype[method] = function(path) {
    var aspects = Array.prototype.slice.call(arguments, 1);
    this.app[method](path, this.createHandler(aspects));
    return this;
  };
});

/**
 * Adds the given aspect to the list of global aspects.
 *
 * @returns exports for chaining
 */
Dom.prototype.use = function(a) {
  addAspect(a, this.globalAspects);
  return this;
};

module.exports = function(app) {
  var dom = new Dom(app);
  return dom;
};