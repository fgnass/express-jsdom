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
  var document = jsdom.jsdom(html, null, {
    url: url,
    features : {
      FetchExternalResources: false,
      ProcessExternalResources: false,
      MutationEvents: false,
      QuerySelector: true
    },
    parser: html5,
    deferClose: true
  });
  document.addEventListener('error', function(ev) {
    console.log(ev.message);
    console.log(ev.data.error.stack);
  });
  return document;
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
        addAspect(a, target, parentDir);
      });
    }
    else {
      if (typeof aspect == 'string') {
        var base = /^[.\/]/.test(aspect) ? parentDir : __dirname + '/aspects';

        aspect = require(Path.resolve(baseDir, base, aspect));
      }
      else if (typeof aspect == 'function') {
        aspect = {name: aspect.name || '[Function]', apply: aspect};
      }
      if (!~target.indexOf(aspect)) {
        if (!aspect.baseDir) {
          var mod = utils.getModule(aspect);
          aspect.name = aspect.name || mod && Path.basename(mod.filename, Path.extname(mod.filename));
          aspect.baseDir = mod && Path.dirname(mod.filename) || baseDir;
        }
        addAspect(aspect.depends, target, aspect.baseDir);
        addAspect(assets.include(aspect), target);
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
    console.log('Did not find router, adding it!');
    app.use(app.router);
  }
  console.log('Adding dom middleware at ' + i);
  app.stack.splice(i, 0, {route: '', handle: domMiddleware});
}

function Dom(app) {
  this.app = app;
  this.globalAspects = [assets.aspect];
  injectMiddleware(app, this);
}
Object.defineProperty(Dom.prototype, 'middlewareStack', {
  get: function() {
    return this._middlewareStack || (this._middlewareStack = utils.pluck(this.globalAspects, 'middleware'));
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
    var html = utils.applyWithNamedArgs(this.render, this.context, this.context.window);
    this.res.send(html || '', this.headers, this.status);
    delete this.context.req;
    delete this.context.res;
  },
  render: function(document) {
    utils.trigger(document, 'render');
    var html = document.innerHTML;
    utils.trigger(document, 'rendered');
    return html;
  },
  defer: function(fn) {
    var self = this;
    function deferred() {
      var a = self.deferreds;
      var i = a.indexOf(deferred);
      if (!~i)  throw new Error('The delegate returned by res.defer() must be called only once');
      a.splice(i, 1);
      if (fn) fn.apply(this, arguments);
      if (a.length === 0) {
        self.send();
      }
    }
    this.deferreds.push(deferred);
    return deferred;
  }
};

function DomContext(req, res) {
  this.context = {
    req: req,
    app: req.app,
    res: new Response(res, this),
    console: console,
    dom: this
  };
  this.appliedAspects = [];
  this.document = createNewDocument(req.url);
  this.window = this.context.window = this.document.parentWindow;
  // Defer sending the response until the load event is fired.
  utils.listenOnce(this.window, 'load', this.context.res.defer());
}
DomContext.prototype = {
  resolveAspects: function(deps) {
    var aspects = [];
    addAspect(deps, aspects);
    return aspects;
  },
  applyAspects: function(aspects) {
    var self = this;
    aspects.forEach(function(aspect) {
      if (aspect.apply && !~self.appliedAspects.indexOf(aspect)) {
        utils.applyWithNamedArgs(aspect.apply, self.context, self.window);
        self.appliedAspects.push(aspect);
      }
    });
  }
};


/**
 * Creates an express handler that serves a document.
 */
Dom.prototype.createHandler = function(aspects) {
  var globalAspects = this.globalAspects, /* global aspects required via dom.use() */
    allAspects = globalAspects.concat();

  /* Add the given aspects, including their dependencies */
  addAspect(aspects, allAspects);

  /* collect middleware provided by non-global aspects */
  var routeStack = utils.pluck(allAspects.filter(function(a) {
    return !~globalAspects.indexOf(a);
  }), 'middleware');

  /* finally add the document middleware */
  routeStack.push(function middleware(req, res) {
    var ctx = new DomContext(req, res);
    ctx.applyAspects(allAspects);
    ctx.document.close();
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
 */
Dom.prototype.use = function(a) {
  addAspect(a, this.globalAspects);
  return this;
};

module.exports = function(app) {
  return new Dom(app);
};
module.exports.utils = utils;