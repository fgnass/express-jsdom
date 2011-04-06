var fs = require('fs'),
  Path = require('path'),
  URL = require('url'),
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  uglify = require('uglify-js'),
  cssmin = require('./aspects/support/cssmin'),
  utils = require('./utils'),
  assert = require('assert'),
  mime = require('mime'),
  mapping,
  mappingRegExp,
  assetCount = 0,
  registry = {
    js: {},
    css: {}
  },
  cache = {};

/**
 * Returns the filename without the extension, 
 * e.g. `filename('/foo/bar.js') === 'bar'`
 */
function filename(path) {
  return path.replace(/.*\/(.*)\..*/, '$1');
}

/**
 * Compilers by file extension.
 */
var compilers = {
  scss: function(str, file, fn) {
    var scss = cache.scss || (cache.scss = require('scss'));
    scss.parse(str, fn);
  },
  less: function(str, file, fn) {
    var less = cache.less || (cache.less = require('less'));
    try {
      less.render(str, {filename: file}, fn);
    }
    catch(err) {
      fn(err);
    }
  },
  styl: function(str, file, fn) {
    var stylus = cache.stylus || (cache.stylus = require('stylus'));
    try {
      stylus.render(str, {filename: file}, fn);
    }
    catch(err) {
      fn(err);
    }
  }
};

function compile(str, file, asset, next) {
   var m = file.match(/.+?\.(\w+)$/),
      ext = m ? m[1] : '',
      compiler = compilers[ext];

  if (compiler) {
    compiler(str, file, function(err, data) {
      next(err, data);
    });
  }
  else {
    next(null, str);
  }
}

function Resource(file, options) {
  var self = this;
  if (!options) {
    options = {};
  }
  this.file = file;
  try {
    this.stats = fs.statSync(file);
    this.contentType = options.contentType || mime.lookup(file);
    if (options.content) {
      this.body = new Buffer(options.content, 'utf8');
    }
    this.version = this.stats.size + '-' + this.stats.mtime.getTime();
  }
  catch(err) {
    console.log(err.stack);
  }
}
Resource.prototype = {
  serve: function(res) {
    var self = this;
    function send(err, buf) {
      if (err) { throw err; }
      res.writeHead(200, {
        "Content-Length": buf.length,
        "Content-Type": self.contentType + ';charset=UTF-8',
        "Last-Modified": self.stats.mtime.toUTCString(),
        "Cache-Control": "public max-age=" + (365*24*60*60),
        "ETag": self.version
      });
      res.end(buf);
    }
    if (this.body) {
      send(null, this.body);
    }
    else {
      fs.readFile(this.file, send);
    }
  }
};

/**
 * Creates a Resource for the given path and attaches it to an asset.
 */
function attach(asset, path) {
  var id = '' + Object.keys(asset.attachments).length;
  var file = URL.resolve(asset.file, path);
  var res = asset.attachments[id] = new Resource(file);
  return Path.join(mapping, res.version, asset.name, id, Path.basename(path));
}

/** Regular expression to find URLs in CSS files */
var cssUrlRegExp = /(url\s*\(\s*["']?)(.*?)(['"]?\s*\))/g;
//                  \________________/\___/\__________/
//                        prefix       URL    suffix

/**
 * Scans the given css for URLs and rewrites them as attachments, i.e.
 * /assets/{version}/{asset-name}/{attachment-id}/{basename.ext}
 */
function processCss(css, filename, asset, next) {
  css = css.replace(cssUrlRegExp, function(css, p1, p2, p3) {
    return p1 + attach(asset, p2) + p3;
  });
  next(null, css);
}

/**
 * Minifies the given JavaScript code using UglifyJS.  
 */
function minifyJs(str, filename, asset, next) {
  var jsp = uglify.parser,
      pro = uglify.uglify,
      ast = jsp.parse(str);

  ast = pro.ast_mangle(ast);
  ast = pro.ast_squeeze(ast);
  //next(null, pro.gen_code(ast));
  next(null, str);
}

/**
 * Minifies the given CSS code using cssmin.  
 */
function minifyCss(str, filename, asset, next) {
  return next(null, cssmin(str));
}

var stacks = {
  js: [compile, minifyJs],
  css: [compile, processCss, minifyCss]
};

function getAsset(name, type) {
  var asset = registry[type][name];
  assert.ok(asset, 'No such asset: ' + name);
  return asset;
}



function process(asset, file, stack, callback) {
  function update() {
    var index = 0;
    function next(err, str) {
      if (err) throw err;
      var layer = stack[index++];
      if (layer) {
        layer(str, file, asset, next);
      }
      else {
        callback(null, str);
      }
    }
    fs.readFile(file, 'utf8', next);
  }

  fs.watchFile(file, {interval: 500}, function(cur, prev) {
    if (cur && +cur.mtime !== +prev.mtime) {
      update();
    }
  });
  update();
}

function insertElement(tag, props, target) {
  var el = target.ownerDocument.createElement(tag);
  utils.merge(el, props);
  target.appendChild(el);
  return el;
}


function CssAsset(baseDir, file) {
  this.file = Path.resolve(baseDir, file);
  this.name = filename(file);
  this.attachments = {};
  var self = this;
  process(this, this.file, stacks.css, function(err, str) {
    self.resource = new Resource(self.file, {content: str, contentType: 'text/css'});
    self.emit('change');
  });
}
inherits(CssAsset, EventEmitter);
Object.defineProperty(CssAsset.prototype, 'href', {
  get: function() {
    return Path.join(mapping, this.resource.version, this.name + '.css');
  }
});
CssAsset.prototype.include = function(context) {
  var self = this,
    document = context.document;

  document.addEventListener('render', function() {
    insertElement('link', {
      type: 'text/css',
      rel: 'stylesheet',
      href: self.href,
    }, document.head).asset = self;
  });
};

function ScriptAsset(baseDir, options) {
  var self = this;
  if (typeof options == 'string') {
    options = { file: options };
  }

  if (options.file) {
    this.file = Path.resolve(baseDir, options.file);
    process(this, this.file, stacks.js, function(err, str) {
      self.resource = new Resource(self.file, {content: str, contentType: 'text/javascript'});
    });
  }

  this.server = options.server === true ? this.file : options.server;
  this.cdn = options.cdn;
  this.test = options.test;
  this.name = filename(this.file || this.cdn);
}
ScriptAsset.prototype = {
  getScript: function() {
    return this.script || (this.script = this.server && utils.load(this.server));
  },
  include: function(context) {
    var self = this,
      document = context.document,
      localSrc;

    if (this.resource) {
      localSrc = Path.join(mapping, this.resource.version, this.name + '.js');
    }
    document.addEventListener('render', function() {
      if (self.cdn) {
        insertElement('script', {src: self.cdn}, document.head);
        if (self.test) {
          insertElement('script', {
            text: '!(' + utils.testExpr(self.test) + ')' +
                  ' && document.write(unescape(\'%3Cscript src="' +
                  localSrc + '"%3E%3C/script%3E\'))'
            },
            document.head
          );
        }
      }
      else {
        insertElement('script', {src: localSrc}, document.head);
      }
    });
    if (this.server) {
      this.getScript().run(context);
    }
  }
};

var assets = {
  js: ScriptAsset,
  css: CssAsset
};

exports.aspect = {
  middleware: function(req, res, next) {
    var m = mappingRegExp.exec(req.url);
    if (m) {
      var name = m[1],
          type = m[2] || 'css',
          att = m[3],
          asset = getAsset(name, type),
          resource = att ? asset.attachments[att] : asset.resource;

      resource.serve(res);
    }
    else {
      next();
    }
  }
};

exports.include = function(type, aspect) {
  var options = aspect[type],
    asset = new assets[type](aspect.baseDir, options);

  registry[type][asset.name] = asset;
  return function(context) {
    asset.include(context);
  };
};

Object.defineProperty(exports, 'mapping', { 
  set: function(value) {
    mapping = value;
    mappingRegExp = new RegExp('^' + mapping + '/(?:.+?)/([^/]+)(?:\\.(.+?)|/(.+?)/.+)$');
    //                                           \____/  \____/       \__/   \__/
    //                                            vers.   name         type   attachment
  }
});

exports.mapping = '/assets';