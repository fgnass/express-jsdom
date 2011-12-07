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
    else {
      // This might be a cloned node ...
      var id = el.id;
      if (id) {
        // Remove the id so that we can look up the original
        el.removeAttribute('id');
        var orig = this.doc.getElementById(id);
        if (orig && orig != el) {
          // Assign a new id
          this.identify(el);
        }
        else {
          el.id = id;
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
    this.identify(p, 1);
    while (el) {
      if (el.nodeType == 3) {
        n.push(el.nodeValue || '');
      }
      else {
        var s = {tagName: el.tagName, attr: {}};
        this.undupe(el);
        var known = el.sync;
        if (!known) {
          //if (filter) this.cleanup(el, filter);
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
    var sel, range, anchor, pos;
    if (typeof getSelection != 'undefined') {
      sel = getSelection();
      anchor = ref = sel.anchorNode;
      range = sel.rangeCount && sel.getRangeAt(0);
      pos = sel.anchorOffset > 0 ? 'setStartAfter' : 'setStartBefore';
    }
    for (var i=0; i < struct.length; i++) {
      var c = struct[i];
      if (c.tagName) {
        // element
        n = this.doc.getElementById(c.attr.id);
        if (!n) {
          n = ne = this.doc.createElement(c.tagName);
          if (c.html !== undefined) {
            try {
              n.innerHTML = c.html;
            }
            catch (err) {
              console.log('Can not parse HTML', c.html);
            }
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
            if (range && !sel.rangeCount) {
              range = this.doc.createRange();
              range.setStartBefore(n);
              sel.addRange(range);
            }
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
          n = this.doc.createTextNode(c);
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
      p.removeChild(el);
      if (sel && anchor && !sel.anchorNode) {
        if (ne) {
          range[pos](ne);
          range.collapse(true);
        }
        sel.addRange(range);
        sel = null;
      }
    }
    this.syncing = false;
  },
  cleanup: function(el, filter, target) {
    if (!filter || !filter.tags) filter = DomSync.defaultFilter;

    function allowAttr(a, tag) {
      return filter.attributes && filter.attributes[tag] && filter.attributes[tag].test(a.name);
    }

    var keep;
    if (el.nodeType == 3 || filter.whitelist && filter.whitelist(el)) {
      keep = true;
    }
    else if (!filter.blacklist || !filter.blacklist(el)) {
      var tag = el.nodeName.toLowerCase();
      if (filter.tags.test(tag)) {
        keep = true;
        var del = [];
        for (var i=el.attributes.length-1; i >= 0; i--) {
          var a = el.attributes[i];
          if (!allowAttr(a, tag) || !allowAttr(a, '*')) del.push(a.name);
        }
        for (i=del.length-1; i >= 0; i--) {
          el.removeAttribute(del[i]);
        }
      }
      var next = el.firstChild;
      while (next) {
        var child = next;
        next = child.nextSibling;
        this.cleanup(child, filter, !keep && (target || el));
      }
    }

    if (keep) {
      if (target) target.parentNode.insertBefore(el, target);
    }
    else {
      el.parentNode.removeChild(el);
    }
  }
};

DomSync.defaultFilter = {
  tags: /^(h[1-6]|p|br|i|b|ul|ol|li|a|table|tr|td)$/,
  attributes: {
    '*': /^data-(doc|model)/,
    'a': /^href$/
  },
  blacklist: function(el) {
    return (/^(script|head)$/i).test(el.nodeName);
  }
};

if (typeof module != 'undefined' && module.exports) {
  module.exports = DomSync;
}

