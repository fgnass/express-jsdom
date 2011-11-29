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
      socket.on('domSync', function(data, seq) {
        var elements = [];
        for (var i=0; i < data.length; i++) {
          var el = self.doc.getElementById(data[i].id);
          if (el) {
            elements.push(el);
            self.sync(el, data[i].nodes, seq);
          }
        }
        if (onSync) {
          onSync(elements, seq);
        }
      });
      socket.on('fetchHtml', function(id, cb) {
        var el = self.doc.getElementById(id);
        cb(el && el.innerHTML);
      });
    }
  },
  identify: function(el, sync) {
    if (!el.id) {
      el.id = this.prefix + this.nextId++;
    }
    if (sync) {
      el.sync = el.id;
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
    if (typeof document == 'undefined') return; //REVISIT!
    if (el.sync) {
      if (!el.id) {
        // The browser removed the id from the original element
        var dupe = this.doc.getElementById(el.sync);
        if (dupe) {
          dupe.removeAttribute('id');
        }
        // Restore the original id
        el.id = el.sync;
      }
    }
    else { //if (el.getAttribute('data-sync')) {
      // This is a cloned node, remove the data-sync attribute
      var id = el.id;
      if (id) {
        // Remove the id so that we can look up the original
        el.removeAttribute('id');
        var orig = this.doc.getElementById(id);
        if (orig && orig != el) {
          // Assign a new id
          this.identify(el);
        }
      }
    }
  },
  serialize: function(p, filter) {
    var n = [];
    var el;
    if (p.nodeType == 3) p = p.parentNode;
    el = p.firstChild;
    this.undupe(p);
    this.identifyAll(p);
    while (el) {
      if (el.nodeType == 3) {
        n.push(el.nodeValue || '');
      }
      else {
        var s = {tagName: el.tagName, attr: {}};
        this.undupe(el);
        var known = el.sync;
        if (!known) {
          if (0 && filter) { //TODO!
            var tmp = this.doc.createElement('div');
            tmp.innerHTML = el.innerHTML;
            el.innerHTML = '';
            while (tmp.firstChild) {
              this.cleanup(tmp.firstChild, el, filter);
            }
          }
          this.identifyAll(el);
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
    return {id: p.id, nodes: n};
  },
  send: function(p, filter) {
    this.sendBatch([p], filter);
  },
  sendBatch: function(all, filter) {
    if (!this.syncing) {
      var batch = [];
      for (var i=0; i < all.length; i++) {
        batch.push(this.serialize(all[i], filter));
      }
      this.seq++;
      //console.log('send', this.seq, batch);
      this.socket.emit('domSync', batch, this.seq);
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
          if (!ne) ne = p;
          r.setStartBefore(ne.firstChild || ne);
          s.addRange(r);
        }
      }
      p.removeChild(el);
    }
    this.syncing = false;
  },
  cleanup: function(e, target, filter) {
    target.appendChild(e);
    return;
    /*
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
    */
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

