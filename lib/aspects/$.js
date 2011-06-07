//var jquery = require('./support/jquery');
//var jquery = require('./support/jquery-node');
var Zepto = require('./support/zepto');
var methodRegEx = /\.\w+\(/;

function stringify(obj) {
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
}

exports.apply = function(window, document) {
  var $ = window.jQuery = Zepto(window);

  // ========================================================================
  // Serialization of client-scripts, i.e. code executed in the browser once
  // the client-side DOM is ready.
  // ========================================================================

  var clientScripts = [];

  $.clientReady = function(script) {
    if ($.isFunction(script)) {
      script = script.toString().replace(/^.*?\{([\s\S]*)\}/m, '$1');
    }
    clientScripts.push(script);
  };

  $.client = function(selector, fn, args) {
    if (selector !== '' && selector !== 'document') {
      selector = "'" + selector + "'";
    }
    $.clientReady('\t$(' + selector + ').' + fn +'(' + args.map(stringify).join(',') + ');');
  };

  var counter = {
  };

  function identify(el, prefix) {
    if (el.nodeType === 9) {
      return 'document';
    }
    var id = el.id;
    if (!id) {
      var n = prefix || 'el';
      if (!counter[n]) {
        counter[n] = 1;
      }
      do {
        id = n + counter[n]++;
      } while(document.getElementById(id));
      el.id = id;
    }
    return id;
  }

  $.fn.identify = function(prefix) {
    this.each(function() {
      identify(this, prefix);
    });
    return this;
  };

  $.getSelector = function(el) {
    return '#' + identify(el);
  };

  // Overwrite the jQuery function that extracts script tags from a given
  // fragment and passes them to evalScript. Otherwise our clientScripts
  // would get executed on the server, too. 
  $.clean = (function(orig) {
    return function(elems, context, fragment, scripts) {
      return orig(elems, context, fragment);
    };
  }($.clean));

  // When everything is loaded, we append a script-block containing
  // the previously gathered clientScripts.
  $(document).bind('render', function() {
    if (clientScripts.length > 0) {
      $('<script>').html('//<!--\n$(function() {\n' + 
        clientScripts.join('\n') +
        '});\n//-->').appendTo('body');
      clientScripts = [];
    }
  });

  $.fn.client = function() {
    var args = Array.prototype.slice.call(arguments),
      fn = args.shift(),
      selector = this.selector;

    if (!selector.length || methodRegEx.test(selector)) {
      selector = this.get().map($.getSelector).join(',');
    }
    $.client(selector, fn, args);
    return this;
  };

  $.fn.clientAndServer = function() {
      var args = Array.prototype.slice.call(arguments),
      fn = args.shift();

    this.client.apply(this, arguments);
    return $.fn[fn].apply(this, args);
  };

  $.fn.submitDefault = function(callback) {
    this.each(function() {
      var el = this;
      this.submit = function() {
        callback.apply(el);
      };
    });
    return this;
  };

};