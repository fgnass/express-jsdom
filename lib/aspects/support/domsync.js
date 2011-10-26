function DomSync(document, prefix) {
  this.doc = document;
  this.prefix = prefix;
  this.nextId = 0;
}
DomSync.prototype = {
  setSocket: function(socket, onSync) {
    if (socket) {
      var self = this;
      this.socket = socket;
      socket.on('domSync', function(id, data) {
        var el = self.doc.getElementById(id);
        if (el) {
          self.sync(el, data);
          if (onSync) {
            onSync(el);
          }
        }
        else {
          console.log('Not found: ' + id);
        }
      });
      socket.on('fetchHtml', function(id, cb) {
        var el = self.doc.getElementById(id);
        cb(el && el.innerHTML);
      });
    }
  },
  identify: function(el, sync) {
    if (!el.id) el.id = this.prefix + this.nextId++;
    if (sync) el.setAttribute('data-sync', sync);
    return el.id;
  },
  identifyAll: function(el, sync) {
    this.identify(el, sync);
    var t = el.getElementsByTagName('*');
    for (var i=0; i < t.length; i++) {
      this.identify(t[i], sync);
    }
  },
  send: function(p, filter) {
    if (!this.syncing) {
      this.identifyAll(p);
      var n = [];
      var el;
      if (p.nodeType == 3) p = p.parentNode;
      el = p.firstChild;
      while (el) {
        if (el.nodeType == 3) {
          n.push(el.nodeValue || '');
        }
        else {
          var s = {tagName: el.tagName, attr: {}};
          var known = el.getAttribute('data-sync');
          if (!known) {
            if (filter) {
              var tmp = document.createElement('div');
              tmp.innerHTML = el.innerHTML;
              el.innerHTML = '';
              while (tmp.firstChild) {
                this.cleanup(tmp.firstChild, el, filter);
              }
            }
            this.identifyAll(el, 1);
            s.html = el.innerHTML;
          }
          for (var i=el.attributes.length; --i>=0;) {
            var a = el.attributes[i];
            s.attr[a.name]=a.value;
          }
          s.id = s.attr.id;
          n.push(s);
        }
        el = el.nextSibling;
      }
      this.socket.emit('domSync', p.id, n);
    }
  },
  sendOnNextTick: function(el, filter) {
    var self = this;
    if (!this.syncing && !el.syncTimeout) {
      el.syncTimeout = setTimeout(function() {
        self.send(el, filter);
        el.syncTimeout = 0;
      }, 1);
    }
  },
  syncAttributes: function(el, attr) {
    var i, n;
    for (i=el.attributes.length;--i>=0;) {
      n = el.attributes[i].name;
      if (attr[n] === undefined) {
        el.removeAttribute(n);
      }
    }
    for (n in attr) {
      if (el.getAttribute(n) != attr[n]) {
        el.setAttribute(n, attr[n]);
      }
    }
  },
  sync: function sync(p, struct) {
    var self = this;
    var el = p.firstChild;
    this.syncing = true;
    for (var i=0; i < struct.length; i++) {
      var c = struct[i];
      if (c.tagName) {
        // element
        var n = this.doc.getElementById(c.attr.id);
        if (!n) {
          n = this.doc.createElement(c.tagName);
          if (c.html !== undefined) {
            n.innerHTML = c.html;
            //this.identifyAll(n, 1);
          }
          else {
            function update(n) {
              return function(html) {
                if (html === null && n.parentNode) {
                  n.parentNode.removeChild(n);
                }
                else {
                  n.innerHTML = html;
                  self.identifyAll(n, 1);
                }
              };
            }
            this.socket.emit('fetchHtml', c.attr.id, update(n));
          }
          p.insertBefore(n, el);
        }
        else {
          if (!el || c.attr.id != el.id) {
            p.insertBefore(n, el);
          }
          else {
            // ok, next
            el = el.nextSibling;
          }
        }
        this.syncAttributes(n, c.attr);
      }
      else {
        // text node
        if (!el || el.nodeType != 3) {
          var txt = this.doc.createTextNode(c);
          p.insertBefore(txt, el);
        }
        else {
          if (el.nodeValue != c) {
            el.nodeValue = c;
          }
          // next
          el = el.nextSibling;
        }
      }
    }
    var obsolete = [];
    while (el) {
      obsolete.push(el);
      el = el.nextSibling;
    }
    for (i=0; i < obsolete.length; i++) {
      p.removeChild(obsolete[i]);
    }
    this.syncing = false;
  },
  cleanup: function(e, target, filter) {
    if (!filter || !filter.tags) {
      filter = DomSync.defaultFilter;
    }
    if (e.nodeType == 3) {
      target.appendChild(e);
      return;
    }
    if (e.nodeType == 1) {
      var tag = e.nodeName.toLowerCase();
      if (filter.stop.test(tag)) {
        return;
      }
      var t = filter.translate[tag];
      tag = t || tag;
      if (filter.tags.test(tag)) {
        target = target.appendChild(document.createElement(tag));
        var attrs = filter.attributes[tag];
        if (attrs) {
          for (var i = e.attributes.length-1; i >= 0; i--) {
            var a = e.attributes[i];
            if (attrs.test(a.name)) {
              target.setAttribute(a.name, a.value);
            }
          }
        }
      }
      while (e.firstChild) {
        this.cleanup(e.firstChild, target);
      }
    }
    e.parentNode.removeChild(e);
  }
};

DomSync.defaultFilter = {
  tags: /^(h[1-6]|p|br|i|b|ul|ol|li|a|table|tr|td)$/,
  attributes: {
    'a': /^href$/
  },
  translate: {
    em: 'i',
    strong: 'b'
  },
  stop: /script|noscript|head/
};

if (typeof module != 'undefined' && module.exports) {
  module.exports = DomSync;
}

