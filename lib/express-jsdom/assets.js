var fs = require('fs'),
    Path = require('path'),
    URL = require('url'),
    uglify = require('uglify-js'),
    cssmin = require('./aspects/support/cssmin'),
    utils = require('./utils'),
    mimeType = require('connect/utils').mime.type,
    fail = utils.fail,
    assetCount = 0,
    registry = {},
    cache = {};

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
    this.contentType = options.contentType || mimeType(file);
    if (options.content) {
      this.body = new Buffer(options.content, 'utf8');
    }
    this.version = this.stats.size + '-' + this.stats.mtime.getTime();
  }
  catch(err) {
    console.log(err);
  }
}
Resource.prototype = {
  serve: function(res) {
    var self = this;
    function send(err, buf) {
      if (err) { throw err; }
      res.writeHead(200, {
        "Content-Type": self.contentType,
        "Content-Length": buf.length,
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

function attach(asset, path) {
  var id = Object.keys(asset.attachments).length;
  var file = URL.resolve(asset.css, path);
  var res = asset.attachments[id] = new Resource(file);
  return '/assets/' + res.version + '/' + asset.name + '/' + id + '/' + Path.basename(path);
}

var cssUrlRegExp = /(url\s*\(\s*["']?)(.*?)(['"]?\s*\))/g;

function processCss(str, filename, asset, next) {
  str = str.replace(cssUrlRegExp, function(str, p1, p2, p3) {
    return p1 + attach(asset, p2) + p3;
  });
  next(null, str);
}

function minifyJs(str, filename, asset, next) {
  var jsp = uglify.parser,
      pro = uglify.uglify,
      ast = jsp.parse(str);

  ast = pro.ast_mangle(ast);
  ast = pro.ast_squeeze(ast);
  next(null, pro.gen_code(ast));
}

function minifyCss(str, filename, asset, next) {
  next(null, cssmin(str));
}

var stacks = {
  js: [compile, minifyJs],
  css: [compile, processCss, minifyCss]
};

function getAsset(name) {
  return registry[name] || fail('No such asset: {}', name);
}

function Asset(options) {
  this.name = options.name;
  this.css = options.css;
  this.cdn = options.cdn;
  this.test = options.test;

  var js = options.js || {};
  this.js = typeof js == 'string' ? {client: js, server: options.server ? js : null} : js;

  this.artifacts = {};
  this.attachments = {};

  var asset = this;

  function process(type, file, fn) {
    var index = 0,
        stack = stacks[type];

    function next(err, str) {
      if (err) {
        fn(err);
      }
      else {
        var layer = stack[index++];
        if (layer) {
          layer(str, file, asset, next);
        }
        else {
          fn(null, str);
        }
      }
    }

    next(null, fs.readFileSync(file, 'utf8'));
  }

  function initComponent(file, type, mime) {
    if (file) {
      if (!asset.name) {
        asset.name = file.replace(/.*\/(.*)\..*/, '$1');
      }
      utils.watchFile(file, function() {
        process(type, file, function(err, str) {
          if (err) {
            console.log(err);
            throw err;
          }
          asset.artifacts[type] = new Resource(file, {content: str, contentType: mime});
        });
      })();
    }
  }

  initComponent(this.js.client, 'js', 'text/javascript');
  initComponent(this.css, 'css', 'text/css');
}
Asset.prototype = {
  getScript: function() {
    return this.script || (this.script = this.js.server ? utils.load(this.js.server) : null);
  },
  getAttachment: function(id) {
    return this.attachments[id] || fail('Asset "{}" has no such attachment: {}', this.name, id);
  },
  getArtifact: function(type) {
    return this.artifacts[type] || fail('Asset "{}" has no artifact of type "{}"', this.name, type);
  },
  run: function(context, alreadyRun) {
    if (this.js.server && !alreadyRun[this.name]) {
      alreadyRun[this.name] = true;
      this.getScript().run(context);
    }
  },
  addTo: function(array) {
    if (array.indexOf(this) == -1) {
      array.push(this);
    }
  }
};

exports.register = function(asset) {
  var a = new Asset(asset),
      name = a.name;

  if (registry[name]) {
    return asset.__registered || utils.fail('Another asset named "{}" is already registered', name);
  }
  registry[name] = a;
  asset.__registered = name;
  return name;
};

//TODO: Make configurable
var prefix;
var re = new RegExp('^' + (prefix || '/assets') + '/(?:.+?)/([^/]+)(?:\\.(.+?)|/(.+?)/.+)$');

exports.aspect = {
  middleware: function(req, res, next) {
    var m = re.exec(req.url);
    if (m) {
      var name = m[1],
          type = m[2],
          att = m[3],
          asset = getAsset(name),
          resource = att ? asset.getAttachment(att) : asset.getArtifact(type);

      resource.serve(res);
    }
    else {
      next();
    }
  },
  onInit: function(context, window, document) {
    var includes = [],
        alreadyRun = {};

    function insert(tag, props, target) {
      var el = document.createElement(tag);
      utils.merge(el, props);
      target.appendChild(el);
    }

    window.assets = {
      include: function(/* name... */) {
        for (var i=0, len = arguments.length; i < len; i++) {
          var name = arguments[i];
          var asset = getAsset(name);
          asset.addTo(includes);
          asset.run(context, alreadyRun);
        }
      },
      reset: function() {
        includes = [];
      },
      insert: function() {
        var scripts = includes.filter(function (a) { return !!a.js.client; }),
            css = includes.filter(function (a) { return !!a.css; });

        scripts.forEach(function(asset) {
          var localSrc = '/assets/' + asset.artifacts.js.version + '/' + asset.name + '.js';

          if (asset.cdn) {
            insert('script', {src: asset.cdn}, document.head);
            if (asset.test) {
              insert('script', {
                text: '!(' + utils.testExpr(asset.test) + ')' +
                      ' && document.write(unescape(\'%3Cscript src="' +
                      localSrc + '"%3E%3C/script%3E\'))'
              }, document.head);
            }
          }
          else {
            insert('script', {src: localSrc}, document.head);
          }
        });

        css.forEach(function(asset) {
          insert('link', {
            type: 'text/css', 
            rel: 'stylesheet', 
            href: '/assets/' + asset.artifacts.css.version + '/' + asset.name + '.css'
          }, document.head);
        });
      }
    };
  },
  beforeRender: function(req, assets) {
    if (!req.xhr) {
      assets.insert();
    }
  }
};