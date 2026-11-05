/* Logo Trace Studio core. Pure geometry and pixel operations, no external vectorization library. */
(function (root) {
  "use strict";

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function area(p) {
    var s = 0;
    for (var i = 0; i < p.length; i++) {
      var a = p[i], b = p[(i + 1) % p.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s / 2;
  }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  function pointSegmentDist2(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, den = dx * dx + dy * dy;
    if (den < 1e-12) return dist2(p, a);
    var t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / den, 0, 1);
    var x = a.x - p.x + t * dx, y = a.y - p.y + t * dy;
    return x * x + y * y;
  }
  // Iterative Ramer-Douglas-Peucker, retaining genuine high-curvature corners.
  function simplifyOpen(points, tolerance) {
    if (points.length < 3 || tolerance <= 0) return points.slice();
    var keep = new Uint8Array(points.length), stack = [[0, points.length - 1]];
    keep[0] = keep[points.length - 1] = 1;
    var e2 = tolerance * tolerance;
    while (stack.length) {
      var pair = stack.pop(), start = pair[0], end = pair[1], best = e2, index = -1;
      for (var i = start + 1; i < end; i++) {
        var d = pointSegmentDist2(points[i], points[start], points[end]);
        if (d > best) { best = d; index = i; }
      }
      if (index >= 0) {
        keep[index] = 1;
        stack.push([start, index], [index, end]);
      }
    }
    return points.filter(function (_, i) { return keep[i] === 1; });
  }
  function simplify(points, tolerance, closed) {
    if (!closed || points.length < 4) return simplifyOpen(points, tolerance);
    var n = points.length;
    var a = 0;
    for (var i = 1; i < n; i++) if (points[i].x < points[a].x) a = i;
    var b = a, best = -1;
    for (var j = 0; j < n; j++) if (dist2(points[a], points[j]) > best) { best = dist2(points[a], points[j]); b = j; }
    if (a === b) return points.slice();
    function arc(start, end) {
      var arr = [points[start]], k = start;
      while (k !== end) { k = (k + 1) % n; arr.push(points[k]); }
      return arr;
    }
    var first = simplifyOpen(arc(a, b), tolerance);
    var second = simplifyOpen(arc(b, a), tolerance);
    first.pop(); second.pop();
    var merged = first.concat(second);
    return merged.length >= 3 ? merged : points.slice();
  }
  function inside(p, ring) {
    var c = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var a = ring[i], b = ring[j];
      if (((a.y > p.y) !== (b.y > p.y)) && (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) c = !c;
    }
    return c;
  }
  function traceIso(values, w, h, cutoff) {
    // Grid has a one-pixel transparent border, so even edge-touching shapes close.
    var gw = w + 2, gh = h + 2, grid = new Uint8Array(gw * gh);
    for (var y = 0; y < h; y++) grid.set(values.subarray(y * w, (y + 1) * w), (y + 1) * gw + 1);
    var segments = [], adjacency = new Map();
    function key(p) { return Math.round(p.x * 10000) + "," + Math.round(p.y * 10000); }
    function add(a, b) {
      if (dist2(a, b) < 1e-12) return;
      var i = segments.length; segments.push([a, b]);
      for (var q of [a, b]) {
        var k = key(q), arr = adjacency.get(k);
        if (arr) arr.push(i); else adjacency.set(k, [i]);
      }
    }
    for (var yy = 0; yy < gh - 1; yy++) {
      for (var xx = 0; xx < gw - 1; xx++) {
        var tl = grid[yy * gw + xx], tr = grid[yy * gw + xx + 1];
        var br = grid[(yy + 1) * gw + xx + 1], bl = grid[(yy + 1) * gw + xx];
        var bits = (tl >= cutoff ? 8 : 0) | (tr >= cutoff ? 4 : 0) |
          (br >= cutoff ? 2 : 0) | (bl >= cutoff ? 1 : 0);
        if (bits === 0 || bits === 15) continue;
        var points = {};
        function interp(u, v) {
          var d = v - u; return d === 0 ? .5 : clamp((cutoff - u) / d, 0, 1);
        }
        function edge(letter) {
          if (points[letter]) return points[letter];
          var px, py;
          if (letter === "T") { px = xx + interp(tl, tr); py = yy; }
          if (letter === "R") { px = xx + 1; py = yy + interp(tr, br); }
          if (letter === "B") { px = xx + interp(bl, br); py = yy + 1; }
          if (letter === "L") { px = xx; py = yy + interp(tl, bl); }
          return (points[letter] = { x: px - .5, y: py - .5 });
        }
        function pair(a, b) { add(edge(a), edge(b)); }
        switch (bits) {
          case 1: pair("L", "B"); break;
          case 2: pair("B", "R"); break;
          case 3: pair("L", "R"); break;
          case 4: pair("T", "R"); break;
          case 5:
            if ((tl + tr + br + bl) / 4 >= cutoff) { pair("T", "L"); pair("B", "R"); }
            else { pair("T", "R"); pair("L", "B"); }
            break;
          case 6: pair("T", "B"); break;
          case 7: pair("T", "L"); break;
          case 8: pair("L", "T"); break;
          case 9: pair("T", "B"); break;
          case 10:
            if ((tl + tr + br + bl) / 4 >= cutoff) { pair("T", "R"); pair("L", "B"); }
            else { pair("T", "L"); pair("B", "R"); }
            break;
          case 11: pair("T", "R"); break;
          case 12: pair("L", "R"); break;
          case 13: pair("B", "R"); break;
          case 14: pair("L", "B"); break;
        }
      }
    }
    var used = new Uint8Array(segments.length), rings = [];
    for (var s = 0; s < segments.length; s++) {
      if (used[s]) continue;
      var chain = [segments[s][0], segments[s][1]], current = segments[s][1];
      var origin = key(chain[0]); used[s] = 1;
      for (var steps = 0; steps <= segments.length; steps++) {
        var ck = key(current);
        if (ck === origin) break;
        var next = (adjacency.get(ck) || []).find(function (j) { return !used[j]; });
        if (next === undefined) break;
        used[next] = 1;
        var seg = segments[next];
        current = key(seg[0]) === ck ? seg[1] : seg[0];
        chain.push(current);
      }
      if (key(current) === origin && chain.length >= 4) {
        chain.pop(); // SVG Z, not a duplicate vertex, closes the loop
        if (Math.abs(area(chain)) >= 1.5) rings.push(chain);
      }
    }
    return rings;
  }
  function sourceMask(image, w, h, opts) {
    var rgba = image.data, n = w * h, values = new Uint8Array(n);
    var minAlpha = 255;
    for (var i = 0; i < n; i++) if (rgba[4 * i + 3] < minAlpha) minAlpha = rgba[4 * i + 3];
    if (minAlpha < 250) {
      for (var ai = 0; ai < n; ai++) values[ai] = rgba[4 * ai + 3];
      return { values: values, type: "alpha", note: "Kontura iz alfa-kanala (prozirni PNG/WEBP)." };
    }
    // Reference background is the dominant of four corner swatches, not image-wide white.
    var corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]], samples = [];
    for (var c = 0; c < corners.length; c++) {
      var sum = [0,0,0], count = 0, cx = corners[c][0], cy = corners[c][1];
      for (var dy = 0; dy < Math.min(5, h); dy++)
        for (var dx = 0; dx < Math.min(5, w); dx++) {
          var sx = clamp(cx + (cx ? -dx : dx), 0, w-1);
          var sy = clamp(cy + (cy ? -dy : dy), 0, h-1);
          var pi = (sy * w + sx) * 4;
          for (var ch = 0; ch < 3; ch++) sum[ch] += rgba[pi + ch];
          count++;
        }
      samples.push(sum.map(function (v) { return v / count; }));
    }
    var best = 0, score = -1;
    for (var a = 0; a < samples.length; a++) {
      var matches = 0;
      for (var b = 0; b < samples.length; b++) {
        var d = 0;
        for (var k = 0; k < 3; k++) d += (samples[a][k] - samples[b][k]) ** 2;
        if (d < 45 ** 2) matches++;
      }
      if (matches > score) { score = matches; best = a; }
    }
    var bg = samples[best], maxDist = opts.bgTolerance * opts.bgTolerance * 3;
    var outside = new Uint8Array(n), queue = new Int32Array(n), head = 0, tail = 0;
    function similar(idx) {
      var off = idx * 4, d0 = rgba[off] - bg[0], d1 = rgba[off + 1] - bg[1], d2 = rgba[off + 2] - bg[2];
      return d0*d0 + d1*d1 + d2*d2 <= maxDist;
    }
    function addPixel(idx) {
      if (!outside[idx] && similar(idx)) { outside[idx] = 1; queue[tail++] = idx; }
    }
    for (var x = 0; x < w; x++) { addPixel(x); addPixel((h - 1) * w + x); }
    for (var y = 1; y < h - 1; y++) { addPixel(y * w); addPixel(y * w + w - 1); }
    while (head < tail) {
      var p = queue[head++], px = p % w, py = Math.floor(p / w);
      if (px > 0) addPixel(p - 1);
      if (px + 1 < w) addPixel(p + 1);
      if (py > 0) addPixel(p - w);
      if (py + 1 < h) addPixel(p + w);
    }
    if (opts.includeHoles) {
      // Optional removal of internal areas matching the known background color.
      // It intentionally remains OFF by default to protect white areas in multicolor logos.
      for (var j = 0; j < n; j++) if (!outside[j] && similar(j)) outside[j] = 1;
    }
    for (var z = 0; z < n; z++) values[z] = outside[z] ? 0 : 255;
    return { values: values, type: "opaque", note: tail ?
      "Povezana vanjska pozadina uklonjena; izvorna slika ostala je netaknuta." :
      "Nijedan rub nije prepoznat kao pozadina. Provjeri prag ili koristi prozirni PNG." };
  }
  function contours(image, w, h, opts) {
    var src = sourceMask(image, w, h, opts);
    var rings = traceIso(src.values, w, h, src.type === "alpha" ? Math.round(opts.alphaThreshold * 2.55) : 128);
    var minimum = Math.max(2, w * h * 0.000002);
    rings = rings.filter(function (p) { return Math.abs(area(p)) >= minimum; });
    rings.sort(function (a, b) { return Math.abs(area(b)) - Math.abs(area(a)); });
    var output = [];
    for (var i = 0; i < rings.length; i++) {
      var p = rings[i][0], depth = 0;
      for (var j = 0; j < i; j++) if (inside(p, rings[j])) depth++;
      if (!opts.includeHoles && depth % 2) continue;
      var cleaned = simplify(rings[i], opts.tolerance, true);
      if (cleaned.length >= 3) output.push({ points: cleaned, closed: true, type: "auto", depth: depth });
    }
    return { paths: output, note: src.note, source: src.type, contoursFound: rings.length };
  }
  function rounded(v) { return String(Number(v.toFixed(3))); }
  function pathD(points, closed, smooth) {
    if (!points || points.length < (closed ? 3 : 2)) return "";
    var n = points.length, d = "M" + rounded(points[0].x) + " " + rounded(points[0].y);
    var factor = clamp(smooth / 100, 0, 1);
    for (var i = 0; i < (closed ? n : n - 1); i++) {
      var a = points[i], b = points[(i + 1) % n];
      if (!factor) { d += " L" + rounded(b.x) + " " + rounded(b.y); continue; }
      var prev = points[(i - 1 + n) % n], next = points[(i + 2) % n];
      var cornerA = !closed && i === 0;
      var cornerB = !closed && i + 1 === n - 1;
      function sharp(p0, p1, p2) {
        var ux=p0.x-p1.x, uy=p0.y-p1.y, vx=p2.x-p1.x, vy=p2.y-p1.y;
        var norm=Math.hypot(ux,uy)*Math.hypot(vx,vy);
        // Incoming and outgoing almost collinear => 180 degrees, not a corner.
        return norm>0 && Math.acos(clamp((ux*vx+uy*vy)/norm,-1,1)) < (Math.PI - .70);
      }
      var c1 = cornerA || sharp(prev,a,b) ? a : { x: a.x + (b.x - prev.x) * factor / 6, y: a.y + (b.y - prev.y) * factor / 6 };
      var c2 = cornerB || sharp(a,b,next) ? b : { x: b.x - (next.x - a.x) * factor / 6, y: b.y - (next.y - a.y) * factor / 6 };
      d += " C" + rounded(c1.x) + " " + rounded(c1.y) + " " + rounded(c2.x) + " " + rounded(c2.y) + " " + rounded(b.x) + " " + rounded(b.y);
    }
    return d + (closed ? " Z" : "");
  }
  function exportSVG(paths, w, h, opts) {
    var color = /^#[0-9a-f]{6}$/i.test(opts.color) ? opts.color : "#000000";
    var width = clamp(Number(opts.strokeWidth) || 2, .1, 30);
    var isFilled = opts.style === "filled";
    var smooth = clamp(Number(opts.smooth) || 0, 0, 100);
    var parts = [];
    var auto = paths.length && paths.every(function (p) { return p.type === "auto"; });
    if (auto) {
      var d = paths.map(function (p) { return pathD(p.points, true, smooth); }).filter(Boolean).join(" ");
      if (d) parts.push('<path d="' + d + '" fill-rule="evenodd" fill="' +
        (isFilled ? color : "none") + '" stroke="' + (isFilled ? "none" : color) +
        '" stroke-width="' + rounded(width) + '" stroke-linejoin="round" stroke-linecap="round"/>');
    } else {
      for (var path of paths) {
        var command = pathD(path.points, !!path.closed, smooth);
        if (!command) continue;
        parts.push('<path d="' + command + '" fill="' + (isFilled && path.closed ? color : "none") +
          '" stroke="' + (isFilled && path.closed ? "none" : color) + '" stroke-width="' +
          rounded(width) + '" stroke-linecap="round" stroke-linejoin="round"/>');
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '" fill="none" shape-rendering="geometricPrecision">\n' +
      parts.join("\n") + '\n</svg>\n';
  }
  root.TraceCore = { contours: contours, simplify: simplify, pathD: pathD, exportSVG: exportSVG,
    _test: { traceIso: traceIso, area: area, sourceMask: sourceMask } };
})(typeof window !== "undefined" ? window : globalThis);