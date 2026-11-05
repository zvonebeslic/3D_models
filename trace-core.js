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
    function key(p) { return p.x.toFixed(9) + "," + p.y.toFixed(9); }
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
        if (Math.abs(area(chain)) >= 0.000001) rings.push(chain);
      }
    }
    return rings;
  }
  function sourceMask(image, w, h, opts) {
    var rgba = image.data, n = w * h, values = new Uint8Array(n);
    var minAlpha = 255;
    for (var i = 0; i < n; i++) if (rgba[4 * i + 3] < minAlpha) minAlpha = rgba[4 * i + 3];
    if (minAlpha < 250) {
      // An existing alpha mask is the highest-quality source: do not threshold,
      // smooth, resample, binarize or otherwise discard antialiased edge pixels.
      for (var ai = 0; ai < n; ai++) values[ai] = rgba[4 * ai + 3];
      return {values:values, type:"alpha",
        note:"Izvorni alfa-kanal: svi dostupni rubni pikseli sačuvani."};
    }
    // JPEG / opaque PNG fallback. Select the dominant color on the four corners.
    // This works for logos with a near-uniform background, not photographs.
    var corners = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]], samples = [];
    for (var z = 0; z < corners.length; z++) {
      var sum = [0,0,0], count = 0, cx=corners[z][0], cy=corners[z][1];
      for (var dy=0;dy<Math.min(5,h);dy++) for (var dx=0;dx<Math.min(5,w);dx++) {
        var sx=clamp(cx+(cx?-dx:dx),0,w-1), sy=clamp(cy+(cy?-dy:dy),0,h-1), k=(sy*w+sx)*4;
        for(var ch=0;ch<3;ch++)sum[ch]+=rgba[k+ch];
        count++;
      }
      samples.push(sum.map(function(v){return v/count;}));
    }
    var best=0, matches=-1;
    for (var a=0;a<samples.length;a++) {
      var countNear=0;
      for (var b=0;b<samples.length;b++) {
        var d=0;
        for(var t=0;t<3;t++)d+=(samples[a][t]-samples[b][t])**2;
        if(d<45*45)countNear++;
      }
      if(countNear>matches){matches=countNear;best=a;}
    }
    var bg=Array.isArray(opts.backgroundColor)&&opts.backgroundColor.length===3?
      opts.backgroundColor.map(function(v){return clamp(Number(v)||0,0,255);}):samples[best];
    var tol=Math.max(1,Number(opts.bgTolerance)||42);
    // Continuous foreground confidence instead of old binary flood fill.
    // Marching squares interpolates through the threshold at subpixel positions.
    for(var p=0;p<n;p++) {
      var o=p*4, r=rgba[o]-bg[0], g=rgba[o+1]-bg[1], b=rgba[o+2]-bg[2];
      var delta=Math.sqrt((r*r+g*g+b*b)/3);
      values[p]=Math.round(clamp(delta / tol * 128,0,255));
    }
    return {values:values, type:"opaque",
      note:"Rub procijenjen iz kontinuirane razlike boje prema pozadini. Za najbolji rezultat koristi prozirni PNG."};
  }
  // Optional pixel-accurate interior color boundaries, independent of the
  // main silhouette. This preserves internal linework that an alpha mask
  // alone cannot see (e.g., colored letters inside a solid logo).
  function traceColorBoundaries(image,w,h,foreground,threshold) {
    var rgba=image.data, segments=[],neighbors=new Map(), limit=300000;
    function key(p){return p.x+","+p.y;}
    function add(a,b) {
      if(segments.length>=limit)throw Error("Unutarnji detalji imaju više od "+limit+
        " rubnih segmenata. Povećaj prag boja ili isključi unutarnje granice.");
      var id=segments.length; segments.push([a,b]);
      for(var point of [a,b]) {
        var k=key(point),list=neighbors.get(k);
        if(list)list.push(id);else neighbors.set(k,[id]);
      }
    }
    function contrast(a,b) {
      var ia=a*4,ib=b*4,dr=rgba[ia]-rgba[ib],dg=rgba[ia+1]-rgba[ib+1],db=rgba[ia+2]-rgba[ib+2];
      return (dr*dr+dg*dg+db*db)>=3*threshold*threshold;
    }
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var n=y*w+x;
      if(foreground[n]<128)continue;
      if(x+1<w&&foreground[n+1]>=128&&contrast(n,n+1)) {
        add({x:x+1,y:y},{x:x+1,y:y+1});
      }
      if(y+1<h&&foreground[n+w]>=128&&contrast(n,n+w)) {
        add({x:x,y:y+1},{x:x+1,y:y+1});
      }
    }
    var used=new Uint8Array(segments.length),result=[];
    function degree(p){return (neighbors.get(key(p))||[]).length;}
    for(var i=0;i<segments.length;i++){
      if(used[i])continue;
      var a=segments[i][0],b=segments[i][1];
      var start=degree(a)!==2?a:(degree(b)!==2?b:a);
      var current=start,chain=[start],nextId=i,closed=false;
      for(var count=0;count<=segments.length;count++) {
        if(used[nextId])break;
        used[nextId]=1;
        var s=segments[nextId],curkey=key(current);
        current=key(s[0])===curkey?s[1]:s[0];
        if(key(current)===key(start)){closed=true;break;}
        chain.push(current);
        if(degree(current)!==2)break; // retain junctions; no random branch turns
        nextId=(neighbors.get(key(current))||[]).find(function(id){return !used[id];});
        if(nextId===undefined)break;
      }
      if(chain.length>=(closed?3:2))result.push({points:chain,closed:closed,type:"detail",depth:0});
    }
    return result;
  }
  // Small anti-staircase filter, applied to scalar edge confidence, not RGB.
  // Strength is controlled in 0..100; even a 1px fully opaque island survives.
  function softenMask(values,w,h,strength){
    var k=clamp(Number(strength)||0,0,100)/100*.12;
    if(k<=0||w<3||h<3)return values;
    var tmp=new Uint8Array(values.length),res=new Uint8Array(values.length),center=1-2*k;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var p=y*w+x;
      tmp[p]=Math.round(values[p]*center+
        values[y*w+Math.max(0,x-1)]*k+values[y*w+Math.min(w-1,x+1)]*k);
    }
    for(var yy=0;yy<h;yy++)for(var xx=0;xx<w;xx++){
      var n=yy*w+xx;
      res[n]=Math.round(tmp[n]*center+
        tmp[Math.max(0,yy-1)*w+xx]*k+
        tmp[Math.min(h-1,yy+1)*w+xx]*k);
    }
    return res;
  }
  function contours(image,w,h,opts) {
    var src=sourceMask(image,w,h,opts);
    var cutoff=src.type==="alpha"?Math.round(clamp(opts.alphaThreshold,1,99)*2.55):128;
    var mask=softenMask(src.values,w,h,opts.edgeSoftness);
    var rings=traceIso(mask,w,h,cutoff);
    var minArea=Math.max(0,Number(opts.minArea)||0);
    // In ULTRA mode, even a one-pixel island is meaningful. Never use an
    // image-size-dependent minimum area that deletes small lettering or symbols.
    rings=rings.filter(function(p){return Math.abs(area(p)) >= minArea;});
    rings.sort(function(a,b){return Math.abs(area(b))-Math.abs(area(a));});
    var output=[];
    var tol=Math.max(0,Number(opts.tolerance)||0);
    function saveRing(i,depth){
      var vertices=tol>0?simplify(rings[i],tol,true):rings[i];
      if(vertices.length>=3)output.push({points:vertices,closed:true,type:"auto",depth:depth});
    }
    if(opts.includeHoles){
      // Compound even-odd SVG needs all loops, not a costly O(rings²)
      // containment test. Essential for dense, high-resolution images.
      for(var i=0;i<rings.length;i++)saveRing(i,0);
    } else {
      var boxes=rings.map(function(ring){
        var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        for(var v of ring){minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);}
        return {minX,minY,maxX,maxY};
      });
      for(var i=0;i<rings.length;i++){
        var point=rings[i][0],depth=0,box=boxes[i];
        for(var j=0;j<i;j++){
          var parent=boxes[j];
          if(parent.minX>=box.minX||parent.maxX<=box.maxX||
             parent.minY>=box.minY||parent.maxY<=box.maxY)continue;
          if(inside(point,rings[j]))depth++;
        }
        if(depth%2===0)saveRing(i,depth);
      }
    }
    var detailCount=0;
    if(opts.includeColorEdges) {
      var edges=traceColorBoundaries(image,w,h,src.values,Math.max(1,Number(opts.edgeTolerance)||40));
      detailCount=edges.length;
      for(var detail of edges)output.push(detail);
    }
    return {paths:output,note:src.note,source:src.type,contoursFound:rings.length,detailCount:detailCount};
  }
  function rounded(v) { return String(Number(v.toFixed(6))); }
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
  function exportSVG(paths,w,h,opts){
    var color=/^#[0-9a-f]{6}$/i.test(opts.color)?opts.color:"#000000";
    var width=clamp(Number(opts.strokeWidth)||.5,.1,30),filled=opts.style==="filled";
    function dpath(p,isDetail){return opts.fit && root.TraceFit?
      root.TraceFit.pathD(p.points,!!p.closed,opts.fitTolerance):
      pathD(p.points,!!p.closed,isDetail?0:smooth);}
    var smooth=clamp(Number(opts.smooth)||0,0,100),parts=[];
    var auto=paths.filter(function(p){return p.type==="auto";});
    var detail=paths.filter(function(p){return p.type==="detail";});
    var manual=paths.filter(function(p){return p.type!=="auto"&&p.type!=="detail";});
    if(auto.length){
      var d=auto.map(function(p){return dpath(p,false);}).filter(Boolean).join(" ");
      if(d)parts.push('<path d="'+d+'" fill-rule="evenodd" fill="'+(filled?color:"none")+
        '" stroke="'+(filled?"none":color)+'" stroke-width="'+rounded(width)+
        '" stroke-linejoin="round" stroke-linecap="round"/>');
    }
    for(var path of detail.concat(manual)) {
      var d=dpath(path,path.type==="detail");
      if(!d)continue;
      var fill=filled&&path.closed&&path.type!=="detail"?color:"none";
      parts.push('<path d="'+d+'" fill="'+fill+'" stroke="'+(fill!=="none"?"none":color)+
        '" stroke-width="'+rounded(width)+'" stroke-linecap="round" stroke-linejoin="round"/>');
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+
      '" viewBox="0 0 '+w+' '+h+'" shape-rendering="geometricPrecision">\n'+parts.join("\n")+'\n</svg>\n';
  }
  root.TraceCore = { contours: contours, simplify: simplify, pathD: pathD, exportSVG: exportSVG,
    _test: { traceIso: traceIso, area: area, sourceMask: sourceMask, traceColorBoundaries: traceColorBoundaries, softenMask:softenMask } };
})(typeof window !== "undefined" ? window : globalThis);