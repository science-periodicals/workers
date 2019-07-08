import uniq from 'lodash/uniq';
import { ancestorsMatching, childMatching } from '../lib/utils';

/**
 * By default, `dedocx` exposes the formatting properties but does not generate
 * CSS. This plugin tries to produce a CSS interpretation of DOCX's styling. It is
 * limited, but it will get you a decent amount of the way there.
 */

let underlineMap = {
    single: 'solid',
    words: 'solid', // NOTE: but set the other prop
    double: 'double',
    thick: 'solid',
    dotted: 'dotted',
    dottedHeavy: 'dotted',
    dash: 'dashed',
    dashedHeavy: 'dashed',
    dashLong: 'dashed',
    dashLongHeavy: 'dashed',
    dotDash: 'dashed',
    dashDotHeavy: 'dashed',
    dotDotDash: 'dashed',
    dashDotDotHeavy: 'dashed',
    wave: 'wavy',
    wavyHeavy: 'wavy',
    wavyDouble: 'wavy'
  },
  vertAlignMap = {
    subscript: 'sub',
    superscript: 'super',
    baseline: 'baseline'
  },
  borderMap = {
    nil: 'none',
    none: 'none',
    double: 'double',
    dotted: 'dotted',
    dashed: 'dashed',
    dotDash: 'dashed',
    dotDotDash: 'dotted',
    triple: 'double',
    dashSmallGap: 'dashed',
    dashDotStroked: 'dashed',
    threeDEmboss: 'ridge',
    threeDEngrave: 'groove',
    outset: 'outset',
    inset: 'inset'
  },
  // a lot of what is here is guessed
  textDirectionMap = {
    lr: 'horizontal-tb',
    lrV: 'sideways-lr',
    rl: 'horizontal-tb',
    rlV: 'sideways-rl',
    tb: 'vertical-lr',
    tbV: 'vertical-lr',
    lrTb: 'horizontal-tb',
    tbRl: 'vertical-lr',
    btLr: undefined, // no idea what this is
    lrTbV: 'horizontal-tb',
    tbRlV: 'vertical-lr',
    tbLrV: 'horizontal-tb'
  },
  // The names used in tblLook/cnfStyle and those used for types in tblStylePr are pretty much
  // a strict map from one to the other but they're different.
  // Now you know why Word is so slow.
  tableStyleMap = {
    oddVBand: 'band1Vert',
    evenVBand: 'band2Vert',
    oddHBand: 'band1Horz',
    evenHBand: 'band2Horz',
    firstRow: 'firstRow',
    lastRow: 'lastRow',
    firstColumn: 'firstCol',
    lastColumn: 'lastCol',
    firstRowFirstColumn: 'neCell',
    firstRowLastColumn: 'nwCell',
    lastRowFirstColumn: 'seCell',
    lastRowLastColumn: 'swCell'
  };

// MIGHT SUPPORT LATER
//  - w:shadow                toggle            -> text-shadow or box-shadow
//  - also: w14:shadow, w14:textOutline, w14:glow, w14:ligatures (font-variant-ligatures)
//  - w:textAlignment         special val       -> baseline?
//  - patterns on shd
//  - w:suppressAutoHyphens   toggle            -> hyphens (also needs autoHyphenation in settings)
//  - w:contextualSpacing     toggle            -> if next w:p has same w:pStyle, ignore our
//                                                  margin-bottom and its margin-top
//  - w:tcFitText

export default function dedocxCSSPlugin() {
  return function cssPlugin(
    {
      doc,
      log,
      defaultParaProps,
      defaultRunProps,
      theme,
      styles: docxStyles
    } = {},
    callback
  ) {
    let curTableStyle, curTableCellMar;
    setStyle(
      doc.body,
      Object.assign(
        {},
        props2style(defaultParaProps || {}, theme, 'para', doc.body),
        props2style(defaultRunProps || {}, theme, 'run', doc.body)
      )
    );
    Array.from(doc.querySelectorAll('[data-dedocx-props]')).forEach(el => {
      try {
        let props = JSON.parse(el.getAttribute('data-dedocx-props')),
          styles = props2style(props, theme, null, el),
          globalStyle = { pPr: {}, rPr: {} },
          tblStyle = {},
          ln = el.localName,
          isTable = ln === 'table',
          isRow = ln === 'tr',
          isCell = ln === 'td' || ln === 'th';

        if (props.pStyle || props.rStyle) {
          globalStyle = docxStyles.find(
            s => s.styleId === props.pStyle || s.styleId === props.rStyle
          );
          // NOTE: normally here we should follow basedOn to inherit
        }

        // Table styles are special. There is the style for the whole table, and the style for each
        // tr and cell, that also depends on its cnfStyle.
        if (isTable) {
          Array.from(
            el.querySelectorAll(
              '* > tr:not([data-dedocx-props]), * > tr > td:not([data-dedocx-props]), * > tr > th:not([data-dedocx-props])'
            )
          ).forEach(noProps => noProps.setAttribute('data-dedocx-props', '{}'));
          curTableStyle = docxStyles.find(s => s.styleId === props.tblStyle);
          if (props.tblCellMar) {
            curTableCellMar = props.tblCellMar;
          } else if (
            curTableStyle &&
            curTableStyle.tblPr &&
            curTableStyle.tblPr.tblCellMar
          ) {
            curTableCellMar = curTableStyle.tblPr.tblCellMar;
          } else {
            curTableCellMar = null;
          }
        } else if (isRow || isCell) {
          let table = ancestorsMatching(el, 'table')[0],
            tblLook = {};
          if (table && table.hasAttribute('data-dedocx-props')) {
            let tableProps = JSON.parse(
              table.getAttribute('data-dedocx-props')
            );

            if (tableProps.tblLook) {
              tblLook = tableProps.tblLook;
            }
          }

          if (isCell) {
            let tr = ancestorsMatching(el, 'tr')[0];

            if (tr && tr.hasAttribute('data-dedocx-props')) {
              let trProps = JSON.parse(tr.getAttribute('data-dedocx-props'));
              if (trProps.cnfStyle) {
                Object.assign(tblLook, trProps.cnfStyle);
              }
            }

            // because life is fun, Word will often put the cnfStyle defining the cell style on the
            // first p inside the cell
            let p = childMatching(el, 'p');
            if (p && p.hasAttribute('data-dedocx-props')) {
              let pProps = JSON.parse(p.getAttribute('data-dedocx-props'));
              if (pProps.cnfStyle) {
                Object.assign(tblLook, pProps.cnfStyle);
              }
            }
          }

          if (props.cnfStyle) {
            Object.assign(tblLook, props.cnfStyle);
          }

          delete tblLook.val; // never useful

          // NOTE: At this point we have the merged style for the element. We assume that Word will
          // always set the values for cells that belong to a specific location (eg. firstRow)
          // without us having to check that we are in the first row. This could be wrong, worth
          // revisiting. Likewise, we are assuming that banding is hardcoded, so that the default
          // values from tblLook can be ignored.
          if (curTableStyle && curTableStyle.tblStylePr) {
            if (curTableStyle.tblStylePr.wholeTable) {
              Object.assign(tblStyle, curTableStyle.tblStylePr.wholeTable);
            }

            // I'm just guessing this order, by specificity
            [
              'oddVBand',
              'evenVBand',
              'oddHBand',
              'evenHBand',
              'firstRow',
              'lastRow',
              'firstColumn',
              'lastColumn',
              'firstRowFirstColumn',
              'firstRowLastColumn',
              'lastRowFirstColumn',
              'lastRowLastColumn'
            ].forEach(type => {
              if (
                tblLook[type] &&
                curTableStyle.tblStylePr[tableStyleMap[type]]
              ) {
                // XXX should we override per tblPr, trPr, etc?
                Object.assign(
                  tblStyle,
                  curTableStyle.tblStylePr[tableStyleMap[type]]
                );
              }
            });
          }
        }

        let generatedStyle = Object.assign(
          {},
          props2style(
            isCell && curTableStyle && curTableStyle.tcPr,
            theme,
            'table',
            el
          ),
          isTable ? { 'border-collapse': 'collapse' } : {},
          props2style(isTable && tblStyle.tblPr, theme, 'table', el),
          props2style(isRow && tblStyle.trPr, theme, 'table', el),
          props2style(isCell && tblStyle.tcPr, theme, 'table', el),
          props2style(globalStyle.pPr, theme, 'para', el),
          props2style(tblStyle.rPr, theme, 'table', el),
          props2style(globalStyle.rPr, theme, 'run', el),
          styles
        );

        // NOTE: these properties seem to be defined on rows and not dropped on cells inside that
        // don't have them; but also to be defined on cells anyway when needed. There may be a model
        // or I may be doing things in the wrong order. This is a stop-gap fix.
        if (isRow) {
          delete generatedStyle['font-weight'];
          delete generatedStyle.color;
        }

        // we manually default margins (actually, padding) if necessary
        if (isCell && curTableCellMar) {
          if (!props.tcMar) {
            Object.assign(generatedStyle, parseMargins(curTableCellMar));
          }
        }

        // there are default borders that can apply — but it's complicated
        if (
          isCell &&
          curTableStyle &&
          curTableStyle.tblPr &&
          curTableStyle.tblPr.tblBorders
        ) {
          let { insideH, insideV } = curTableStyle.tblPr.tblBorders;

          if (insideH) {
            if (!generatedStyle['border-top']) {
              let tr = el.parentNode,
                tblock = tr.parentNode,
                hasPredecessor = !!(
                  tr.previousElementSibling || tblock.previousElementSibling
                );
              if (hasPredecessor) {
                generatedStyle['border-top'] = parseBorder(insideH, theme);
              }
            }
            if (!generatedStyle['border-bottom']) {
              let tr = el.parentNode,
                tblock = tr.parentNode,
                hasSuccessor = !!(
                  tr.nextElementSibling || tblock.nextElementSibling
                );

              if (hasSuccessor) {
                generatedStyle['border-bottom'] = parseBorder(insideH, theme);
              }
            }
          }
          if (insideV) {
            if (!generatedStyle['border-left']) {
              if (el.previousElementSibling) {
                generatedStyle['border-left'] = parseBorder(insideV, theme);
              }
            }
            if (!generatedStyle['border-right']) {
              if (el.nextElementSibling) {
                generatedStyle['border-right'] = parseBorder(insideV, theme);
              }
            }
          }
        }

        setStyle(el, generatedStyle);
      } catch (e) {
        log.error(e);
      }
    });
    process.nextTick(callback);
  };
}

function props2style(props, theme, elementType, el) {
  if (!props) return {};
  let styles = {};
  if (!elementType) {
    elementType = props.elementType || 'run';
  }

  if (props.b) {
    styles['font-weight'] = 'bold';
  }
  if (props.i) {
    styles['font-style'] = 'italic';
  }
  if (props.sz) {
    styles['font-size'] = `${props.sz / 2}pt`;
  }

  if (props.rFonts) {
    let fontList = [];
    ['ascii', 'hAnsi', 'cs', 'eastAsia'].forEach(k => {
      if (props.rFonts[k]) fontList.push(props.rFonts[k]);
    });

    let fontThemeMap = {
      asciiTheme: 'latin',
      hAnsiTheme: 'latin',
      eastAsiaTheme: 'eastAsia',
      cstheme: 'cs'
    };

    Object.keys(fontThemeMap).forEach(k => {
      if (props.rFonts[k]) {
        let [, type] = props.rFonts[k].match(/^(major|minor)/);
        if (type && theme.fonts[type] && theme.fonts[type][fontThemeMap[k]]) {
          fontList.push(theme.fonts[type][fontThemeMap[k]]);
        }
      }
    });

    if (fontList.length) {
      styles['font-family'] = uniq(fontList)
        .map(f => `"${parseFont(f, styles)}"`)
        .join(', ');
    }
  }

  if (props.highlight) {
    styles.background = parseColor(props.highlight);
  }

  // NOTE: w:color supports themes, which we don't (yet)
  if (props.color) {
    if (props.color.val) {
      styles.color = parseColor(props.color.val);
    } else if (props.color.themeColor && theme[props.color.themeColor]) {
      styles.color = parseColor(theme[props.color.themeColor]);
    }
  }

  if (props.strike || props.dstrike || props.u) {
    let decorations = [];
    if (props.strike || props.dstrike) {
      decorations.push('line-through');
    }

    // NOTE: w:u does themes
    if (props.u) {
      let { val, color } = props.u;
      if (val !== 'none') {
        decorations.push('underline');
        if (val) {
          decorations.push(underlineMap[val] || 'soid');
        }
        if (val === 'words') {
          styles['text-decoration-skip'] = 'spaces';
        }
        if (color) {
          decorations.push(parseColor(color));
        }
      }
    }
    styles['text-decoration'] = decorations.join(' ');
  }

  // NOTE: these might conflict
  if (props.vertAlign) {
    styles['vertical-align'] = vertAlignMap[props.vertAlign];
    if (
      (props.vertAlign === 'superscript' || props.vertAlign === 'subscript') &&
      !styles['font-size']
    ) {
      styles['font-size'] = 'smaller';
      styles['line-height'] = 'normal';
    }
  }

  if (props.position) styles['vertical-align'] = `${props.position / 2}pt`;

  if (props.vAlign) {
    if (props.vAlign === 'bottom') styles['vertical-align'] = 'bottom';
    else if (props.vAlign === 'center') styles['vertical-align'] = 'middle';
    else styles['vertical-align'] = 'top';
  }

  if (props.jc) {
    let { jc } = props,
      ta,
      tj;
    if (jc === 'left' || jc === 'center' || jc === 'right') ta = jc;
    else if (
      jc === 'both' ||
      jc === 'distribute' ||
      jc === 'thaiDistribute' ||
      /kashida/i.test(jc)
    )
      ta = 'justify';
    if (jc === 'distribute' || jc === 'thaiDistribute') tj = 'distribute';
    styles['text-align'] = ta;
    styles['text-justify'] = tj;
  }

  if (props.caps) styles['text-transform'] = 'uppercase';

  if (props.smallCaps) styles['font-variant'] = 'small-caps';

  if (props.ind) {
    let {
        start,
        startChars,
        end,
        endChars,
        left,
        leftChars,
        right,
        rightChars,
        firstLine,
        firstLineChars,
        hanging,
        hangingChars
      } = props.ind,
      leftSide = props.bidi ? 'right' : 'left',
      rightSide = props.bidi ? 'left' : 'right',
      isLi = el && el.localName === 'li';
    // NOTE: We could use the `each-line` keyword(?)
    // NOTE: Word's margin/padding rules for `ind` in a list context don't really translate well to
    // <li> elements because the indent is meant to comprise the bullet. So we remove the default
    // ul/ol padding to make it right
    if (start || left) {
      styles[`padding-${leftSide}`] = isLi
        ? `calc(${(start || left) / 20}pt - 40px)`
        : `${(start || left) / 20}pt`;
    }
    if (startChars || leftChars) {
      styles[`padding-${leftSide}`] = isLi
        ? `calc(${(startChars || leftChars) / 100}ch - 40px)`
        : `${(startChars || leftChars) / 100}ch`;
    }
    if (end || right)
      styles[`padding-${rightSide}`] = `${(end || right) / 20}pt`;
    if (endChars || rightChars)
      styles[`padding-${rightSide}`] = `${(endChars || rightChars) / 100}ch`;
    // NOTE: this assumes that you can't simultaneously get hanging and firstLine
    if (firstLine) styles['text-indent'] = `${firstLine / 20}pt`;
    if (firstLineChars) styles['text-indent'] = `${firstLineChars / 100}ch`;
    if (hanging) styles['text-indent'] = `${hanging / 20}pt hanging`;
    if (hangingChars) styles['text-indent'] = `${hangingChars / 100}ch hanging`;
  }
  if (props.wordWrap) styles['word-break'] = 'break-all';
  if (props.bdr) {
    styles.border = parseBorder(props.bdr, theme);
    if (props.bdr.space) styles.padding = `${props.bdr.space}pt`;
  }
  if (props.pBdr)
    Object.assign(styles, parseBorders(props.pBdr, props.bidi, theme));
  if (props.tcBorders)
    Object.assign(styles, parseBorders(props.tcBorders, props.bidi, theme));
  if (props.keepLines) styles['page-break-inside'] = 'avoid';
  if (props.keepNext) styles['page-break-after'] = 'avoid';
  if (props.pageBreakBefore) styles['page-break-before'] = 'always';
  if (props.widowControl) {
    styles.widows = 2;
    styles.orphans = 2;
  }
  if (props.textDirection) {
    // NOTE: it is possible that text-orientation should also play a part
    styles['writing-mode'] = textDirectionMap[props.textDirection];
  }
  if (props.kern) {
    // NOTE: this assumes that the default size is 24 (12pt) and does not take inheritance or named
    // styles into account
    styles['font-kerning'] = props.kern < (props.sz || 24) ? 'none' : 'normal';
  }
  if (props.outline) styles['-webkit-text-stroke'] = 1;
  // NOTE: should take contextualSpacing into account
  if (props.spacing) {
    if (elementType === 'para') {
      let {
        after,
        afterLines,
        before,
        beforeLines,
        line,
        lineRule
      } = props.spacing;
      if (after) styles['margin-bottom'] = `${after / 20}pt`;
      if (afterLines) styles['margin-bottom'] = `${afterLines / 100}em`;
      if (before) styles['margin-top'] = `${before / 20}pt`;
      if (beforeLines) styles['margin-top'] = `${beforeLines / 100}em`;
      if (line) {
        if (lineRule === 'atLeast' || lineRule === 'exactly') {
          styles['line-height'] = `${line / 20}pt`;
        } else {
          styles['line-height'] = `${line / 240}em`;
        }
      }
    } else if (elementType === 'run') {
      styles['letter-spacing'] = `${(props.spacing.val || props.spacing) /
        20}pt`;
    }
  }
  if (props.tcW) {
    let { w, type } = props.tcW;
    if (type !== 'nil') styles.width = type === 'pct' ? w : `${w / 20}pt`;
  }
  if (props.trHeight) {
    let { val = 0, hRule = 'auto' } = props.trHeight;
    if (hRule === 'atLeast') styles['min-height'] = `${val / 20}pt`;
    else if (hRule === 'exact') styles.height = `${val / 20}pt`;
  }
  if (props.tcMar) Object.assign(styles, parseMargins(props.tcMar));
  if (props.noWrap) styles['white-space'] = 'nowrap';
  // NOTE: we don't (yet!) support the patterns as defined in the spec, this is just enough to get
  // some support. While the name looks like `shadow`, this is about backgrounds.
  if (props.shd) {
    let bg = '';
    if (props.shd.fill) bg = parseColor(props.shd.fill);
    else if (props.shd.themeFill && theme[props.shd.themeFill]) {
      bg = parseColor(theme[props.shd.themeFill]);
    }
    // instead of using patterns for "pct" we translate them to transparency
    if (bg && props.shd.val) {
      let { val } = props.shd;

      if (val === 'nil') {
        bg = 'transparent';
      } else if (/^pct\d+/.test(val)) {
        // right now, this is only done with RRGGBB
        const match = bg.match(/^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/);
        if (match) {
          let [, r, g, b] = bg.match(
            /^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/
          );

          if (r && g && b) {
            r = parseInt(r, 16);
            g = parseInt(g, 16);
            b = parseInt(b, 16);
            bg = `rgba(${r}, ${g}, ${b}, 0.${val.replace('pct', '')})`;
          }
        }
      }
    }
    if (bg) {
      styles.background = bg;
    }
  }

  return styles;
}

function setStyle(el, styles) {
  let style = el.getAttribute('style') || '';
  if (Object.keys(styles).length) {
    Object.keys(styles).forEach(k => {
      if (styles[k] == null) return;
      style += `${k}: ${styles[k]}; `;
    });
    if (style) el.setAttribute('style', style);
  }
}

// Some font names contain the variant instead of being the real, right thing
// NOTE: the below is by no means sufficient.
function parseFont(f, styles) {
  return (f || '')
    .split(/\s+/)
    .map(part => {
      let testPart = part.toLowerCase();
      if (testPart === 'condensed') {
        styles['font-stretch'] = 'condensed';
        return false;
      }
      if (testPart === 'light') {
        styles['font-weight'] = '100';
        return false;
      }
      return part;
    })
    .filter(Boolean)
    .join(' ');
}

function parseColor(color = '') {
  color = color.toLowerCase();
  if (color === 'auto') return 'black'; // NOTE: not sure this is correct
  if ((color.length === 3 || color.length === 6) && /^[a-f0-9]+$/.test(color))
    return `#${color}`;
  return color;
}

function parseBorder(bdr, theme) {
  let style = borderMap[bdr.val] || 'solid',
    // NOTE: it seems that we need to grow the size ourselves for certain styles
    // there may be others
    factor = style === 'double' ? 5 : 1,
    size = `${factor * bdr.sz / 8}pt`,
    color = parseColor(bdr.color || theme[bdr.themeColor]);
  return `${size} ${style} ${color}`;
}

function parseBorders(bdrs, bidi, theme) {
  let res = {};
  ['top', 'right', 'bottom', 'left', 'start', 'end'].forEach(side => {
    if (side === 'start') side = bidi ? 'right' : 'left';
    if (side === 'end') side = bidi ? 'left' : 'right';
    if (bdrs[side]) {
      res[`border-${side}`] = parseBorder(bdrs[side], theme);
      if (bdrs[side].space) res[`padding-${side}`] = `${bdrs[side].space}pt`;
    }
  });
  return res;
}

// Fun fact! What DOCX calls "margin" is really padding.
function parseMargins(mar) {
  let res = {};
  ['top', 'left', 'bottom', 'right'].forEach(side => {
    if (mar[side]) {
      // XXX not sure if dxa is the right default, does not seem documented
      let { w = '0', type = 'dxa' } = mar[side];
      if (type !== 'nil') {
        res[`padding-${side}`] = type === 'pct' ? w : `${w / 20}pt`;
      }
    }
  });
  return res;
}
