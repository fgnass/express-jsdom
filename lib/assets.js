var fs = require('fs'),
  Path = require('path'),
  URL = require('url'),
  EventEmitter = require('events').EventEmitter,
  inherits = require('util').inherits,
  uglify = require('uglify-js'),
  cleanCSS = require('clean-css'),
  utils = require('./utils'),
  assert = require('assert'),
  mime = require('mime'),
  mapping,
  mappingRegExp,
  assetCount = 0,
  registry = {
    js: {},
    css: {},
    files: {}
  },
  nameByPath = {},
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
      less.render(str, {
          filename: file,
          paths: [Path.dirname(file)]
        }, fn);
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

function compile(str, asset, next) {
   var m = asset.file.match(/.+?\.(\w+)$/),
      ext = m ? m[1] : '',
      compiler = compilers[ext];

  if (compiler) {
    compiler(str, asset.file, function(err, data) {
      next(err, data);
    });
  }
  else {
    next(null, str);
  }
}

function Resource(content, contentType) {
  this.body = new Buffer(content, 'utf8');
  this.contentType = contentType;
  this.mtime = new Date();
  this.version = this.body.length + '-' + this.mtime.getTime();
}
Resource.prototype = {
  serve: function(res) {
    res.writeHead(200, {
      "Content-Length": this.body.length,
      "Content-Type": this.contentType + ';charset=UTF-8',
      "Last-Modified": this.mtime.toUTCString(),
      "Cache-Control": "public max-age=" + (365*24*60*60)
    });
    res.end(this.body);
  }
};


function FileResource(file) {
  this.file = file;
  this.stats = fs.statSync(file);
  this.contentType = mime.lookup(file);
  this.version = this.stats.size + '-' + this.stats.mtime.getTime();
}
FileResource.prototype = {
  serve: function(res) {
    res.writeHead(200, {
      "Content-Length": this.stats.size,
      "Content-Type": this.contentType,
      "Last-Modified": this.stats.mtime.toUTCString(),
      "Cache-Control": "public max-age=" + (365*24*60*60),
      "ETag": this.version
    });
    fs.createReadStream(this.file).pipe(res);
  }
};

/**
 * Creates a Resource for the given path and attaches it to an asset.
 */
function attach(asset, path) {
  var file = URL.resolve(asset.file, path);
  var res = asset.attachments[path] = new FileResource(file);
  return Path.join(mapping, 'css', res.version, asset.name, path);
}

/** Regular expression to find URLs in CSS files */
var cssUrlRegExp = /(url\s*\(\s*["']?)(.*?)(['"]?\s*\))/g;
//                  \________________/\___/\__________/
//                        prefix       URL    suffix

/**
 * Scans the given css for URLs and rewrites them as attachments, i.e.
 * /assets/{version}/{asset-name}/{attachment-id}/{basename.ext}
 */
function processCss(css, asset, next) {
  css = css.replace(cssUrlRegExp, function(css, p1, p2, p3) {
    return p1 + attach(asset, p2) + p3;
  });
  next(null, css);
}

/**
 * Minifies the given JavaScript code using UglifyJS.  
 */
function minifyJs(str, asset, next) {
  var jsp = uglify.parser,
      pro = uglify.uglify,
      ast = jsp.parse(str);

  ast = pro.ast_mangle(ast);
  ast = pro.ast_squeeze(ast);
  //next(null, pro.gen_code(ast));
  next(null, str);
}

/**
 * Minifies the given CSS code using clean-css.  
 */
function minifyCss(str, asset, next) {
  return next(null, cleanCSS.process(str));
}

var stacks = {
  js: [compile, minifyJs],
  css: [compile, processCss, minifyCss]
};

function getAsset(type, name) {
  var asset = registry[type][name];
  assert.ok(asset, 'No such asset: ' + name);
  return asset;
}

function getFiles(config) {
  var path = Path.resolve(config.baseDir, config.files);
  var name = nameByPath[path];
  return getAsset('files', name);
}

function process(asset, str, stack, callback) {
  var index = 0;
  function next(err, str) {
    if (err) {
      return callback(err);
    }
    var layer = stack[index++];
    if (layer) {
      try {
        layer(str, asset, next);
      }
      catch (e) {
        callback(e);
      }
    }
    else {
      callback(null, str);
    }
  }
  next(null, str);
}

function loadAndWatch(file, callback) {
  function load() {
    fs.readFile(file, 'utf8', callback);
  }
  fs.watchFile(file, {interval: 500}, function(cur, prev) {
    if (cur && +cur.mtime !== +prev.mtime) {
      load();
    }
  });
  load();
}

function insertElement(tag, props, target) {
  var el = target.ownerDocument.createElement(tag);
  utils.merge(el, props);
  target.appendChild(el);
  return el;
}


function CssAsset(css, baseDir) {
  this.file = Path.resolve(baseDir, css);
  this.name = filename(css);
  this.attachments = {};
  var self = this;
  loadAndWatch(this.file, function(err, str) {
    process(self, str, stacks.css, function(err, str) {
      self.resource = new Resource(str, 'text/css');
      self.emit('change');
    });
  });
}
inherits(CssAsset, EventEmitter);
Object.defineProperty(CssAsset.prototype, 'href', {
  get: function() {
    return Path.join(mapping, 'css', this.resource.version, this.name + '.css');
  }
});
CssAsset.prototype.getResource = function(att) {
  return att ? this.attachments[att] : this.resource;
};
CssAsset.prototype.include = function(dom) {
  dom.assets.push(this);
};
CssAsset.prototype.insert = function(document) {
  insertElement('link', {
    type: 'text/css',
    rel: 'stylesheet',
    href: this.href
  }, document.head).asset = this;
};

function testExpr(s) {
  return s.split('.').map(function(p,i,a) { return 'window.' + a.slice(0,i+1).join('.');}).join(' && ');
}

function ScriptAsset(js, baseDir, name) {
  var self = this;
  if (typeof js == 'string') {
    js = { file: js };
  }

  function createResource(err, str) {
    process(self, str, stacks.js, function(err, text) {
      if (err) throw err;
      self.resource = new Resource(text, 'text/javascript');
    });
  }

  if (typeof js == 'function') {
    this.file = name;
    createResource(null, '('+js.toString()+')();');
  }
  else if (js.file) {
    this.file = Path.resolve(baseDir, js.file);
    loadAndWatch(this.file, createResource);
  }

  this.server = js.server === true ? this.file : js.server;
  this.cdn = js.cdn;
  this.test = js.test;
  this.name = filename(this.file || this.cdn || this.server || name);
}
ScriptAsset.prototype = {
  getScript: function() {
    return this.script || (this.script = this.server && utils.load(this.server));
  },
  getResource: function() {
    return this.resource;
  },
  include: function(dom) {
    dom.assets.push(this);
    if (this.server) {
      this.getScript().run(dom.window);
    }
  },
  insert: function(document) {
    var localSrc = this.resource && Path.join(mapping, 'js', this.resource.version, this.name + '.js');
    if (this.cdn) {
      insertElement('script', {src: this.cdn}, document.head);
      if (this.test) {
        insertElement('script', {
          text: '!(' + testExpr(this.test) + ')' +
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
  }
};

function FilesAsset(path, baseDir) {
  this.dir = Path.resolve(baseDir, path);
  this.name = ''+Object.keys(registry.files).length;
  nameByPath[this.dir] = this.name;
  this.resources = {};
}
FilesAsset.prototype = {
  url: function(file) {
    var res = this.resources[file];
    if (!res) {
      res = this.resources[file] = new FileResource(Path.resolve(this.dir, file));
    }
    return Path.join(mapping, 'files', res.version, this.name, file);
  },
  cssUrl: function(file) {
    return 'url(' + this.url(file) + ')';
  },
  getResource: function(file) {
    return this.resources[file];
  },
  include: function(dom) {
  }
};

var Assets = {
  js: ScriptAsset,
  css: CssAsset,
  files: FilesAsset
};

exports.aspect = {
  middleware: function(req, res, next) {
    var m = mappingRegExp.exec(req.url);
    if (m) {
      var type = m[1],
          name = m[2],
          att = m[3],
          asset = getAsset(type, name),
          resource = asset.getResource(att);

      resource.serve(res);
    }
    else {
      next();
    }
  },
  apply: function(dom, document) {
    dom.assets = [];
    dom.context.files = getFiles;
    function insert() {
      dom.assets.forEach(function(asset) {
        asset.insert(document);
      });
      dom.assets = [];
    }
    document.addEventListener('load', insert);
    document.addEventListener('flush', insert);
  }
};

function createAspect(type, config) {
  var asset = new Assets[type](config[type], config.baseDir, config.name);
  registry[type][asset.name] = asset;
  return {
    name: (asset.name || '<unknown>') + ' (asset)',
    apply: function(dom) {
      asset.include(dom);
    }
  };
}

exports.include = function(config) {
  var aspects = [];

  /* Alias client => js */
  if (config.client) config.js = config.client;

  for (var type in Assets) {
    if (config[type]) {
      aspects.push(createAspect(type, config));
    }
  }
  return aspects;
};

/* Sets the path mapping, defaults to `/assets` */
Object.defineProperty(exports, 'mapping', { 
  set: function(value) {
    mapping = value;
    mappingRegExp = new RegExp('^' + mapping + '/(.+?)/(?:.+?)/(.+?)(?:\\.\\1)?(?:$|/(.+))');
    //                                           \__/  \____/  \___/     \__/        \__/
    //                                           type   vers.   name     ext.     attachment
  }
});

exports.mapping = '/assets';