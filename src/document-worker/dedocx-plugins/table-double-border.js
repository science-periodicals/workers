// All cells with w:tcBorders/w:top[@w:val="double"] get to be in the tfoot
module.exports = function tableDoubleBorder({ doc, log }, cb) {
  try {
    Array.from(doc.querySelectorAll('table')).forEach(table => {
      let tds = Array.from(table.querySelectorAll('td[data-dedocx-props]')),
        tfootRows = [],
        refTd;
      while (tds.length) {
        let td = tds.shift(),
          props = JSON.parse(td.getAttribute('data-dedocx-props'));
        if (
          props &&
          props.tcBorders &&
          props.tcBorders.top &&
          props.tcBorders.top.val === 'double'
        ) {
          refTd = td;
          break;
        }
      }
      if (!refTd) return;
      let tr = refTd.parentNode,
        tblock = tr.parentNode;
      // note that the below checks we are where we expect *and* also bails if we're already in a
      // tfoot block
      if (!tblock || !/^t(head|body)$/.test(tblock.localName)) return;
      while (tr) {
        tfootRows.push(tr);
        tr = tr.nextElementSibling;
      }
      tblock = tblock.nextElementSibling;
      while (
        tblock &&
        (tblock.localName === 'tbody' || tblock.localName === 'thead')
      ) {
        tfootRows = tfootRows.concat(Array.from(tblock.children));
        tblock = tblock.nextElementSibling;
      }
      if (!tfootRows.length) return;
      let tfoot = table.querySelector('tfoot');
      if (!tfoot) {
        tfoot = doc.createElement('tfoot');
        table.appendChild(tfoot);
      }
      while (tfootRows.length) {
        tfoot.insertBefore(tfootRows.pop(), tfoot.firstChild);
      }
    });
  } catch (e) {
    log.error(e);
  }
  process.nextTick(cb);
};
