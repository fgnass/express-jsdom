function DomSync(document, prefix) {
  this.doc = document;
  this.prefix = prefix;
  this.nextId = 0;
  this.seq = 0;
}
DomSync.prototype = {
  setSocket: function(socket, onSync) {
    if (socket) {
      var self = this;
      this.socket = socket;
      socket.on('domSync', function(id, data, seq) {
        var el = self.doc.getElementById(id);
        if (el) {
          self.sync(el, data, seq);
          if (onSync) {
            onSync(el);
          }
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
    if (sync) {
      el.sync = sync;
      el.setAttribute('data-sync', sync);
    }
    return el.id;
  },
  identifyAll: function(el, sync) {
    this.identify(el, sync);
    var t = el.getElementsByTagName('*');
    for (var i=0; i < t.length; i++) {
      this.identify(t[i], sync);
    }
  },
  undupe: function(el) {
    if (el.getAttribute('data-sync') && !el.sync) {
      var id = el.id;
      if (id) {
        el.removeAttribute('id');
        var orig = this.doc.getElementById(id);
        if (orig && orig != el) {
          //console.log('Dupe!', orig.outerHTML, el.outerHTML);
          el.setAttribute('data-copy', id);
          this.identify(el);
        }
      }
      el.removeAttribute('data-sync');
    }
  },
  serialize: function(p, filter) {
    var n = [];
    var el;
    if (p.nodeType == 3) p = p.parentNode;
    el = p.firstChild;
    this.identifyAll(p);
    while (el) {
      if (el.nodeType == 3) {
        n.push(el.nodeValue || '');
      }
      else {
        var s = {tagName: el.tagName, attr: {}};
        this.undupe(el);
        var known = el.getAttribute('data-sync');
        if (!known) {
          if (0 && filter) { //TODO!
            var tmp = this.doc.createElement('div');
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
    return n;
  },
  send: function(p, filter) {
    if (!this.syncing && p.sync) {
      this.undupe(p);
      var struct = this.serialize(p, filter);
      //console.log('Send [' + (++this.seq) + ']', p.id, struct);
      this.socket.emit('domSync', p.id, struct, this.seq);
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
  sync: function sync(p, struct, seq) {
    var self = this;
    var el = p.firstChild;
    var n, ne;
    this.syncing = true;
    for (var i=0; i < struct.length; i++) {
      var c = struct[i];
      if (c.tagName) {
        // element
        n = this.doc.getElementById(c.attr.id);
        if (!n) {
          n = ne = this.doc.createElement(c.tagName);
          if (c.html !== undefined) {
            n.innerHTML = c.html;
            this.identifyAll(n, 1);
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
          n = ne = this.doc.createTextNode(c);
          p.insertBefore(n, el);
        }
        else {
          if (el.nodeValue != c) {
            el.nodeValue = c;
            n = el;
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
      el = obsolete[i];
      if (typeof getSelection != 'undefined') {
        var s = getSelection();
        if (el.compareDocumentPosition(s.anchorNode) & 0x10) {
          s.removeAllRanges();
          var r = document.createRange();
          r.setStartBefore(ne.firstChild || ne);
          s.addRange(r);
        }
      }
      p.removeChild(el);
    }
    this.syncing = false;
  },
  cleanup: function(e, target, filter) {
    if (!filter || !filter.tags) {
      filter = DomSync.defaultFilter;
    }
    function allowAttr(a, tag) {
      return filter.attributes && filter.attributes[tag] && filter.attributes[tag].test(a.name);
    }
    if (e.nodeType == 3) {
      target.appendChild(e);
      return;
    }
    if (e.nodeType == 1) {
      if (e.getAttribute('data-sync')) {
        target.appendChild(e);
        return;
      }
      var tag = e.nodeName.toLowerCase();
      if (filter.stop && filter.stop.test(tag)) {
        return;
      }
      var t = filter.translate[tag];
      tag = t || tag;
      if (filter.tags.test(tag)) {
        target = target.appendChild(document.createElement(tag));
        for (var i = e.attributes.length-1; i >= 0; i--) {
          var a = e.attributes[i];
          if (allowAttr(a, tag) || allowAttr(a, '*')) {
            target.setAttribute(a.name, a.value);
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
    '*': /^data-(sync|doc|model)/,
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

