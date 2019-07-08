import {
  ELEMENT_NODE,
  TEXT_NODE,
  DOCUMENT_FRAGMENT_NODE
} from 'dom-node-types';

export default class TreeScanner {
  constructor($el, log) {
    this.log = log;
    this.$el = this.$node = $el;
    this.cur = 0;
    this.buffer = '';
    this.dead = false;
    this.seenLinks = [];
    this.seenIDs = [];
    this.dbgLevel = 0;
    this.memory = null;
  }

  newFromSettings($el, log) {
    let tp = new TreeScanner($el || this.$el, log || this.log);
    tp.dbgLevel = this.dbgLevel;
    return tp;
  }

  debug(level) {
    this.dbgLevel = level;
    return this;
  }

  // buffer until the rx matches
  // rx is either a regular expression or an object
  // if an object, it must have an `rx` field that's a regex, and it can have an
  // `end` field that says we succeed on reaching the end of the string
  until(rx, found) {
    let end = false;
    if (!(rx instanceof RegExp)) {
      end = rx.end;
      rx = rx.rx;
    }
    if (this.dbgLevel) console.warn(`# ${rx}`);
    if (this.dead) return;
    try {
      // we execute at least once since we might process rebuffered content first
      let prevBuffer,
        MAX_LOOP = this.dbgLevel ? 10 : 1000,
        count = 0;
      do {
        if (this.dbgLevel) console.warn(`  [${this.buffer}]`);
        let match = this.buffer.match(rx);
        if (match) {
          if (this.dbgLevel) console.warn(`  ** match! **`);
          let buf = this.buffer;
          this.buffer = '';
          if (found) found(buf.replace(rx, ''), this, match);
          return this;
        }
        if (prevBuffer === this.buffer) {
          count++;
          if (count >= MAX_LOOP)
            throw new Error(
              `Endless loop in until() with buffer: '${prevBuffer}'`
            );
        } else count = 0;
        prevBuffer = this.buffer;
      } while (this.nextChar());
      // we consider the end of the string to be a match, if we haven't matched before
      // we used to only trigger the end if (end && this.buffer) - this change might break?
      if (end) {
        if (this.dbgLevel) console.warn(`  ** match at end! **`);
        let buf = this.buffer;
        this.buffer = '';
        if (found) found(buf, this, { atEnd: true });
      }
    } catch (err) {
      this.dead = true;
      this.log.error({ err, element: this.$el });
    }
    return this;
  }

  // buffer while the rx matches, when it stops matching revert the last char
  while(rx, found) {
    if (this.dbgLevel) console.warn(`$ ${rx}`);
    if (this.dead) return;
    let tryMatching = () => {
      if (this.dbgLevel) console.warn(`  [${this.buffer}]`);
      let match = this.buffer.match(rx);
      if (!match) {
        if (this.dbgLevel) console.warn(`  ** stopped matching! **`);
        let buf = this.buffer.slice(0, -1);
        this.buffer = this.buffer.slice(-1);
        if (found) found(buf, this, match);
        return this;
      }
    };
    try {
      // handle rebuffering
      if (this.buffer) {
        let res = tryMatching();
        if (res) return res;
      }
      while (this.nextChar()) {
        let res = tryMatching();
        if (res) return res;
      }
    } catch (err) {
      this.dead = true;
      this.log.error({ err, element: this.$el });
    }
    return this;
  }

  space() {
    return this.while(/^\s+$/);
  }

  rebuffer(str) {
    this.buffer = str;
    return this;
  }

  flushLinks() {
    let ret = this.seenLinks;
    this.seenLinks = [];
    return ret;
  }

  flushIDs() {
    let ret = this.seenIDs;
    this.seenIDs = [];
    return ret;
  }

  setNode($n) {
    if (this.dbgLevel)
      console.warn(
        `    [new node (${$n.nodeType})=${
          $n.nodeType === ELEMENT_NODE ? $n.localName : $n.data
        }]`
      );
    this.$node = $n;
    this.cur = 0;
    return true;
  }

  setNodeAndNextChar($n) {
    this.setNode($n);
    return this.nextChar();
  }

  nextChar() {
    let $n = this.$node;

    if (!$n) return false;

    if ($n.nodeType === ELEMENT_NODE) {
      if (this.dbgLevel) {
        console.warn(
          `    >${$n.localName} #${$n.getAttribute('id')} <${$n.getAttribute(
            'href'
          )}> child:${!!$n.firstChild}`
        );
      }
      if ($n.localName === 'a' && $n.hasAttribute('href'))
        this.seenLinks.push($n.getAttribute('href'));
      if ($n.hasAttribute('id')) this.seenIDs.push($n.getAttribute('id'));
      if ($n.firstChild) return this.setNodeAndNextChar($n.firstChild);
    } else if ($n.nodeType === TEXT_NODE) {
      if (this.dbgLevel)
        console.warn(`    |(${this.cur}) ${$n.data[this.cur]}`);
      if (this.cur < $n.data.length) {
        this.buffer += $n.data[this.cur];
        this.cur++;
        return true;
      }
    } else if ($n.nodeType === DOCUMENT_FRAGMENT_NODE) {
      if ($n.firstChild) return this.setNodeAndNextChar($n.firstChild);
    }

    if (this.dbgLevel) console.warn(`    -> next:${!!$n.nextSibling}`);

    if ($n.nextSibling) return this.setNodeAndNextChar($n.nextSibling);

    if (this.dbgLevel) console.warn(`    -> done:${$n === this.$el}`);

    if ($n === this.$el) return false;

    let $parent = $n.parentNode;

    if (this.dbgLevel) console.warn(`    -> looking for parent...`);

    while ($parent) {
      if ($parent === this.$el) return false;
      if ($parent.nextSibling)
        return this.setNodeAndNextChar($parent.nextSibling);
      $parent = $parent.parentNode;
    }

    if (this.dbgLevel) console.warn(`    -> done:should not be here`);

    return false;
  }

  // Given an rx, returns an array of { fragment: DF, match: rxMatch } pairs "splitting" the tree
  // on those boundaries, when found in direct children text nodes of the parent.
  splitToDocumentFragments(
    rx,
    max = 0,
    { ignoreIfWithinParenthesis = false } = {}
  ) {
    let dfs = [],
      doc = this.$el.ownerDocument,
      curDF = doc.createElement('div'),
      $n = this.$el.cloneNode(true),
      children = [],
      kid;

    for (let i = 0; i < $n.childNodes.length; i++) {
      children.push($n.childNodes.item(i));
    }

    let nOpenParenthesis = 0;
    while ((kid = children.shift())) {
      const tc = kid.textContent;
      const tcMatch = tc.match(rx);
      let right;
      if (tcMatch) {
        const left = tc.substring(0, tcMatch.index);
        for (let i = 0; i < left.length; i++) {
          if (left.charAt(i) === '(') {
            nOpenParenthesis++;
          } else if (left.charAt(i) === ')') {
            nOpenParenthesis--;
          }
        }

        right = tc.substring(tcMatch.index);
      } else {
        for (let i = 0; i < tc.length; i++) {
          if (tc.charAt(i) === '(') {
            nOpenParenthesis++;
          } else if (tc.charAt(i) === ')') {
            nOpenParenthesis--;
          }
        }
      }

      if (kid.nodeType === TEXT_NODE) {
        let match = kid.data.match(rx);
        if (
          match &&
          (!ignoreIfWithinParenthesis ||
            (ignoreIfWithinParenthesis && nOpenParenthesis === 0))
        ) {
          let before = doc.createTextNode(RegExp.leftContext);
          let after = doc.createTextNode(RegExp.rightContext);

          if (before.data.length) curDF.appendChild(before);
          dfs.push({ fragment: curDF, match });
          curDF = doc.createElement('div');

          if (after.data.length) {
            children.unshift(after);
          }

          if (max && dfs.length === max - 1) {
            children.forEach(k => curDF.appendChild(k));
            break;
          }
        } else {
          curDF.appendChild(kid);
        }
      } else {
        curDF.appendChild(kid);
      }

      if (right) {
        for (let i = 0; i < right.length; i++) {
          if (right.charAt(i) === '(') {
            nOpenParenthesis++;
          } else if (right.charAt(i) === ')') {
            nOpenParenthesis--;
          }
        }
      }
    }

    if (curDF.hasChildNodes()) {
      dfs.push({ fragment: curDF, match: { atEnd: true } });
    }

    return dfs;
  }
}
