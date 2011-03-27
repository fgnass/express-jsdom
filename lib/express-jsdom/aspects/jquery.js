var jquery = require('./support/jqlite'),
  getSelector = require('../utils').getSelector,
  methodRegEx = /\.\w+\(/;

exports.js = {
  file: 'support/jquery-1.5.1.js',
  //cdn: '//ajax.googleapis.com/ajax/libs/jquery/1.5.1/jquery.min.js',
  test: 'jQuery'
};

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
  var $ = jquery(window);
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
    $.clientReady('\t$(' + selector + ').' + fn +'(' + $.map(args, stringify).join(',') + ');');
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
      $('<script>').append('//').append('<!--\n$(function() {\n' + 
        clientScripts.join('\n') + '});\n//-->').appendTo('body');
      clientScripts = [];
    }
  });

  var counter = {
  };

  $.fn.identify = function(prefix) {
    var n = prefix || 'el';
    this.each(function() {
      if (this.nodeType === 9) {
        return 'document';
      }
      var id = this.id;
      if (!counter[n]) {
        counter[n] = 1;
      }
      if (!id) {
        do {
          id = n + counter[n]++;
        } while(document.getElementById(id));
        this.id = id;
      }
    });
    return this;
  };

  $.fn.client = function() {
    var args = $.makeArray(arguments),
      fn = args.shift(),
      selector = this.selector;

    if (!selector.length || methodRegEx.test(selector)) {
      selector = this.get().map(getSelector).join(',');
    }
    $.client(selector, fn, args);
    return this;
  };

  $.fn.clientAndServer = function() {
      var args = $.makeArray(arguments),
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