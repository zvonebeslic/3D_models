/* Logo Trace Studio controller. No APIs, external models or third-party tracing packages. */
(function () {
"use strict";
var $ = function (id) { return document.getElementById(id); };
var els = {};
["fileInput","dropZone","fileDetails","fileName","replaceImage","manualTab","autoTab",
 "manualControls","autoControls","snapEdges","undoBtn","redoBtn","closeBtn","deleteBtn","clearBtn",
 "manualTolerance","manualToleranceValue","manualSmooth","manualSmoothValue",
 "backgroundTolerance","backgroundToleranceValue","alphaThreshold","alphaThresholdValue",
 "autoTolerance","autoToleranceValue","autoSmooth","autoSmoothValue","includeHoles",
 "traceBtn","showOriginal","pickColor","panBtn","pathColor","zoomSlider","zoomLabel","viewport",
 "artboard","emptyStage","sourceImage","drawingSurface","vectors","handles",
 "status","dimensions","vectorStats","exportStyle","strokeWidth","previewBtn","downloadBtn","shareBtn","copySvgBtn","exportHelp"].forEach(function (id) { els[id] = $(id); });
var ns = "http://www.w3.org/2000/svg";
var state = {
  url: null, width: 0, height: 0, pixels: null, mode: "manual",
  manual: [], auto: [], selection: -1, drawing: null, drag: null,
  history: [], future: [], picking: false, pan: false, busy: false
};
var core = window.TraceCore;
if (!core) { els.status.textContent = "Greška: modul kontura nije učitan."; return; }

function tell(message, kind) {
  els.status.textContent = message;
  els.status.className = "status" + (kind ? " " + kind : "");
}
function clonePaths(list) {
  return list.map(function (p) {
    return { closed: !!p.closed, type: p.type, depth: p.depth || 0,
      points: p.points.map(function (v) { return { x: v.x, y: v.y }; }) };
  });
}
function beforeEdit() {
  state.history.push(clonePaths(state.manual));
  if (state.history.length > 40) state.history.shift();
  state.future = [];
}
function setButtons() {
  var loaded = !!state.pixels, manual = state.mode === "manual";
  els.undoBtn.disabled = !manual || !state.history.length;
  els.redoBtn.disabled = !manual || !state.future.length;
  els.clearBtn.disabled = !manual || !state.manual.length;
  els.deleteBtn.disabled = !manual || state.selection < 0;
  els.closeBtn.disabled = !manual || state.selection < 0 || !!(state.manual[state.selection] || {}).closed ||
    (state.manual[state.selection] || { points: [] }).points.length < 3;
  els.traceBtn.disabled = !loaded || state.busy;
  els.pickColor.disabled = !loaded;
  els.panBtn.disabled = !loaded;
  var paths = currentPaths();
  els.downloadBtn.disabled = !paths.length;
  els.shareBtn.disabled = !paths.length;
  els.copySvgBtn.disabled = !paths.length;
  els.previewBtn.disabled = !paths.length;
  els.exportHelp.textContent = !loaded ? "Učitaj logo pa nacrtaj linije ili automatski pronađi konturu." :
    !paths.length ? (manual ?
      "Gumb za preuzimanje aktivirat će se nakon prvog nacrtanog poteza. Povuci prstom po slici." :
      "Gumb za preuzimanje aktivirat će se nakon pronalaska kontura. Klikni „Pronađi vanjske konture”.") :
    "SVG je spreman: odaberi preuzimanje, Androidov izbornik za dijeljenje ili kopiranje koda.";
  var pts = paths.reduce(function (sum,p) { return sum + p.points.length; }, 0);
  els.vectorStats.textContent = paths.length + " putanja · " + pts + " čvorova";
}
function currentPaths() { return state.mode === "manual" ? state.manual : state.auto; }
function setMode(mode) {
  state.mode = mode;
  state.picking = false;
  state.pan = false;
  els.panBtn.textContent = "✥ Pomakni prikaz";
  els.panBtn.setAttribute("aria-pressed", "false");
  els.drawingSurface.classList.remove("picking", "panning");
  els.manualControls.hidden = mode !== "manual";
  els.autoControls.hidden = mode !== "auto";
  els.manualTab.classList.toggle("active", mode === "manual");
  els.autoTab.classList.toggle("active", mode === "auto");
  els.manualTab.setAttribute("aria-selected", String(mode === "manual"));
  els.autoTab.setAttribute("aria-selected", String(mode === "auto"));
  state.drawing = null; state.drag = null;
  render();
  tell(mode === "manual" ? "Crtaj po slici. Dodirni postojeću putanju za odabir i uređivanje." :
    "Namjesti postavke i pritisni 'Pronađi vanjske konture'.");
}
els.manualTab.addEventListener("click", function () { setMode("manual"); });
els.autoTab.addEventListener("click", function () { setMode("auto"); });

function fitCanvas() {
  if (!state.width) return;
  var viewWidth = Math.max(100, els.viewport.clientWidth - 42);
  var viewHeight = Math.max(100, els.viewport.clientHeight - 42);
  var base = Math.min(viewWidth, viewHeight * state.width / state.height);
  var wide = base * Number(els.zoomSlider.value) / 100;
  els.artboard.style.width = wide + "px";
  els.artboard.style.height = (wide * state.height / state.width) + "px";
  els.zoomLabel.textContent = els.zoomSlider.value + "%";
  render();
}
els.zoomSlider.addEventListener("input", fitCanvas);
window.addEventListener("resize", fitCanvas);

function loadFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    tell("Učitaj PNG, JPG ili WEBP sliku.", "error"); return;
  }
  if (file.size > 30 * 1024 * 1024) {
    tell("Slika je prevelika (maksimalno 30 MB).", "error"); return;
  }
  var nextUrl = URL.createObjectURL(file), img = new Image();
  tell("Učitavam i analiziram sliku…");
  img.onerror = function () {
    URL.revokeObjectURL(nextUrl);
    tell("Sliku nije moguće otvoriti.", "error");
  };
  img.onload = function () {
    try {
      var iw = img.naturalWidth, ih = img.naturalHeight;
      if (!iw || !ih) throw Error("Neispravne dimenzije slike.");
      // Conserve device memory. Dimension reduction is explicit in the status.
      var factor = Math.min(1, 2500 / Math.max(iw, ih), Math.sqrt(5000000 / (iw * ih)));
      var w = Math.max(1, Math.round(iw * factor)), h = Math.max(1, Math.round(ih * factor));
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw Error("Canvas nije dostupan.");
      ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      var pixels = ctx.getImageData(0, 0, w, h);
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = nextUrl;
      state.pixels = pixels; state.width = w; state.height = h;
      state.hasAlpha = false;
      for (var ai = 3; ai < pixels.data.length; ai += 4) if (pixels.data[ai] < 250) { state.hasAlpha = true; break; }
      state.manual = []; state.auto = []; state.selection = -1;
      state.history = []; state.future = []; state.drawing = null;
      els.sourceImage.src = nextUrl;
      els.sourceImage.hidden = !els.showOriginal.checked;
      els.drawingSurface.setAttribute("viewBox", "0 0 " + w + " " + h);
      els.drawingSurface.setAttribute("preserveAspectRatio", "none");
      els.artboard.hidden = false; els.emptyStage.hidden = true;
      els.fileDetails.hidden = false; els.fileName.textContent = file.name;
      els.dropZone.hidden = true;
      els.dimensions.textContent = iw + " × " + ih + (factor < 1 ? " · analiza " + w + " × " + h : "");
      els.zoomSlider.value = "100";
      els.zoomLabel.textContent = "100%";
      fitCanvas();
      setButtons();
      tell("✓ Logo učitan. " + (factor < 1 ? "Velika slika smanjena je za obradu; original nije promijenjen. " : "") +
        "Odaberi način praćenja.", "ok");
    } catch (error) {
      URL.revokeObjectURL(nextUrl);
      tell("Učitavanje nije uspjelo: " + error.message, "error");
    }
  };
  img.src = nextUrl;
}
els.fileInput.addEventListener("change", function (e) { loadFile(e.target.files[0]); });
els.replaceImage.addEventListener("click", function () { els.fileInput.click(); });
["dragenter","dragover"].forEach(function (event) {
  els.dropZone.addEventListener(event, function (e) { e.preventDefault(); els.dropZone.classList.add("dragover"); });
});
["dragleave","drop"].forEach(function (event) {
  els.dropZone.addEventListener(event, function (e) { e.preventDefault(); els.dropZone.classList.remove("dragover"); });
});
els.dropZone.addEventListener("drop", function (e) { loadFile(e.dataTransfer.files[0]); });

function pointFromEvent(e) {
  var rect = els.drawingSurface.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(state.width, (e.clientX - rect.left) / rect.width * state.width)),
    y: Math.max(0, Math.min(state.height, (e.clientY - rect.top) / rect.height * state.height))
  };
}
// Optional local edge magnet: follows nearby opacity or RGB transitions.
function snapPoint(p) {
  if (!els.snapEdges.checked || !state.pixels) return p;
  var w = state.width, h = state.height, rgba = state.pixels.data;
  if (w < 4 || h < 4) return p;
  var ratio = els.artboard.clientWidth / w || 1;
  var radius = Math.min(12, Math.max(3, Math.round(3.2 / ratio)));
  var cx = Math.round(p.x), cy = Math.round(p.y), best = 34, candidate = null;
  for (var y = Math.max(1, cy - radius); y <= Math.min(h - 2, cy + radius); y++) {
    for (var x = Math.max(1, cx - radius); x <= Math.min(w - 2, cx + radius); x++) {
      var dist = Math.hypot(x - p.x, y - p.y);
      if (dist > radius) continue;
      var left = (y * w + x - 1) * 4, right = left + 8;
      var up = ((y - 1) * w + x) * 4, down = up + w * 8;
      var dx = 0, dy = 0;
      // Alpha edge is primary for transparent logos; otherwise use RGB gradient.
      if (state.hasAlpha) {
        dx = Math.abs(rgba[right + 3] - rgba[left + 3]);
        dy = Math.abs(rgba[down + 3] - rgba[up + 3]);
      } else {
        for (var ch = 0; ch < 3; ch++) {
          dx += (rgba[right + ch] - rgba[left + ch]) ** 2;
          dy += (rgba[down + ch] - rgba[up + ch]) ** 2;
        }
        dx = Math.sqrt(dx / 3); dy = Math.sqrt(dy / 3);
      }
      var strength = Math.hypot(dx, dy);
      var score = strength - dist * (18 / radius);
      if (score > best) { best = score; candidate = { x: x + .5, y: y + .5 }; }
    }
  }
  return candidate || p;
}
function sameish(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function makeNode(tag, attributes) {
  var node = document.createElementNS(ns, tag);
  Object.entries(attributes).forEach(function (entry) { node.setAttribute(entry[0], String(entry[1])); });
  return node;
}
function render() {
  els.vectors.replaceChildren();
  els.handles.replaceChildren();
  if (!state.width) { setButtons(); return; }
  var paths = currentPaths();
  var col = els.pathColor.value;
  var smooth = Number((state.mode === "manual" ? els.manualSmooth : els.autoSmooth).value);
  var scale = els.artboard.clientWidth / state.width || 1;
  var displayStroke = Math.min(8, Math.max(1, 2.1 / scale));
  var isFilled = els.exportStyle.value === "filled";
  if (state.mode === "auto" && paths.length && isFilled) {
    // A single even-odd shape keeps holes genuinely hollow.
    var compound = paths.map(function (p) { return core.pathD(p.points, true, smooth); }).join(" ");
    els.vectors.appendChild(makeNode("path", { d: compound, fill: col, "fill-rule": "evenodd",
      stroke: col, "stroke-width": Math.max(0.4, displayStroke * 0.35), "stroke-linejoin": "round" }));
  } else {
    paths.forEach(function (p, i) {
      var d = core.pathD(p.points, p.closed, smooth);
      var node = makeNode("path", { d: d, fill: isFilled && p.closed ? col : "none",
        stroke: state.selection === i && state.mode === "manual" ? "#158cff" : col,
        "stroke-width": displayStroke, "stroke-linecap": "round", "stroke-linejoin": "round",
        "data-path-index": i, "class": "vector-path" + (state.selection === i && state.mode === "manual" ? " active" : "") });
      els.vectors.appendChild(node);
      if (state.mode === "manual") {
        // Invisible 18px-wide touch target makes a thin SVG line selectable on phones.
        els.vectors.appendChild(makeNode("path", { d: d, fill: "none",
          stroke: "transparent", "stroke-width": Math.max(displayStroke, 18 / scale),
          "stroke-linejoin": "round", "stroke-linecap": "round",
          "pointer-events": "stroke", "data-path-index": i, "class": "hit-path" }));
      }
    });
  }
  if (state.drawing && state.drawing.length >= 2) {
    els.vectors.appendChild(makeNode("path", { d: core.pathD(state.drawing, false, smooth),
      fill: "none", stroke: "#12b5ef", "stroke-width": displayStroke,
      "stroke-dasharray": (6 / scale) + " " + (3 / scale),
      "stroke-linecap": "round", "pointer-events": "none" }));
  }
  if (state.mode === "manual" && state.selection >= 0 && state.manual[state.selection]) {
    var radius = Math.min(25, Math.max(1, 8 / scale));
    state.manual[state.selection].points.forEach(function (p,i) {
      els.handles.appendChild(makeNode("circle", { cx: p.x, cy: p.y, r: radius,
        "data-handle-index": i, "class": "handle" + (i === 0 ? " first" : "") }));
    });
  }
  setButtons();
}
function startStroke(p) { state.selection = -1; state.drawing = [snapPoint(p)]; render(); }
function extendStroke(p) {
  if (!state.drawing) return;
  p = snapPoint(p);
  var last = state.drawing[state.drawing.length - 1];
  if (sameish(p, last) >= .55) state.drawing.push(p);
}
function endStroke() {
  if (!state.drawing) return;
  var pts = state.drawing; state.drawing = null;
  if (pts.length < 2) { render(); return; }
  var near = pts.length >= 6 && sameish(pts[0], pts[pts.length - 1]) <
    Math.min(20, Math.max(6, Math.hypot(state.width, state.height) * .008));
  if (near) pts.pop();
  pts = core.simplify(pts, Number(els.manualTolerance.value) / 10, near);
  if (pts.length < (near ? 3 : 2)) { render(); return; }
  beforeEdit();
  state.manual.push({ points: pts, closed: near, type: "manual" });
  state.selection = state.manual.length - 1;
  tell(near ? "✓ Zatvorena SVG putanja dodana. Možeš urediti svaku točku." :
    "✓ Potez spremljen kao uređiva SVG putanja. Zatvori ga gumbom ako želiš siluetu.", "ok");
  render();
}
els.drawingSurface.addEventListener("pointerdown", function (e) {
  if (!state.pixels || e.button !== 0 || state.busy || state.drag || !e.isPrimary) return;
  e.preventDefault();
  var p = pointFromEvent(e);
  if (state.pan) {
    state.drag = { id: e.pointerId, kind: "pan", startX: e.clientX, startY: e.clientY,
      scrollLeft: els.viewport.scrollLeft, scrollTop: els.viewport.scrollTop };
    els.drawingSurface.setPointerCapture(e.pointerId);
    return;
  }
  if (state.picking) {
    var ix = Math.min(state.width - 1, Math.floor(p.x)), iy = Math.min(state.height - 1, Math.floor(p.y));
    var off = (iy * state.width + ix) * 4, d = state.pixels.data;
    var hex = "#" + [d[off], d[off+1], d[off+2]].map(function (v) { return v.toString(16).padStart(2, "0"); }).join("");
    els.pathColor.value = hex;
    state.picking = false; els.drawingSurface.classList.remove("picking");
    tell("Boja odabrana iz logotipa: " + hex, "ok"); render();
    return;
  }
  if (state.mode !== "manual") return;
  var handle = e.target.getAttribute("data-handle-index");
  var idx = e.target.getAttribute("data-path-index");
  if (handle !== null && state.selection >= 0) {
    beforeEdit();
    state.drag = { id: e.pointerId, kind: "handle", index: Number(handle) };
  } else if (idx !== null) {
    state.selection = Number(idx);
    state.drag = { id: e.pointerId, kind: "select" };
  } else {
    startStroke(p);
    state.drag = { id: e.pointerId, kind: "draw" };
  }
  els.drawingSurface.setPointerCapture(e.pointerId);
  render();
});
els.drawingSurface.addEventListener("pointermove", function (e) {
  if (!state.drag || state.drag.id !== e.pointerId) return;
  e.preventDefault();
  if (state.drag.kind === "pan") {
    els.viewport.scrollLeft = state.drag.scrollLeft - (e.clientX - state.drag.startX);
    els.viewport.scrollTop = state.drag.scrollTop - (e.clientY - state.drag.startY);
  } else if (state.drag.kind === "draw") {
    var events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    if (!events.length) events = [e];
    events.forEach(function (event) { extendStroke(pointFromEvent(event)); });
    render();
  } else if (state.drag.kind === "handle" && state.selection >= 0) {
    state.manual[state.selection].points[state.drag.index] = snapPoint(pointFromEvent(e));
    render();
  }
});
function finishPointer(e) {
  if (!state.drag || state.drag.id !== e.pointerId) return;
  var kind = state.drag.kind; state.drag = null;
  if (kind === "draw") { if (e.type === "pointerup") extendStroke(pointFromEvent(e)); endStroke(); }
  else if (kind === "handle") { tell("✓ Vektorski čvor pomaknut.", "ok"); render(); }
  else render();
  if (els.drawingSurface.hasPointerCapture(e.pointerId)) els.drawingSurface.releasePointerCapture(e.pointerId);
}
els.drawingSurface.addEventListener("pointerup", finishPointer);
els.drawingSurface.addEventListener("pointercancel", function(e) {
  if (!state.drag || state.drag.id !== e.pointerId) return;
  if (state.drag.kind === "draw") state.drawing = null;
  state.drag = null; render();
});
function undo() {
  if (!state.history.length) return;
  state.future.push(clonePaths(state.manual));
  state.manual = state.history.pop(); state.selection = -1;
  render(); tell("Potez poništen.");
}
function redo() {
  if (!state.future.length) return;
  state.history.push(clonePaths(state.manual));
  state.manual = state.future.pop(); state.selection = -1;
  render(); tell("Potez vraćen.");
}
els.undoBtn.addEventListener("click", undo);
els.redoBtn.addEventListener("click", redo);
els.closeBtn.addEventListener("click", function () {
  if (state.selection < 0) return;
  beforeEdit(); state.manual[state.selection].closed = true; render();
  tell("✓ Putanja zatvorena. Sada je možeš izvesti kao ispunjeni oblik.", "ok");
});
els.deleteBtn.addEventListener("click", function () {
  if (state.selection < 0) return;
  beforeEdit(); state.manual.splice(state.selection, 1); state.selection = -1;
  render(); tell("Odabrana putanja obrisana.");
});
els.clearBtn.addEventListener("click", function () {
  if (!state.manual.length) return;
  beforeEdit(); state.manual = []; state.selection = -1; render();
  tell("Ručne putanje očišćene. Možeš ih vratiti tipkom Poništi.");
});
window.addEventListener("keydown", function (e) {
  var tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (state.mode !== "manual") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault(); if (e.shiftKey) redo(); else undo();
  }
  if ((e.key === "Delete" || e.key === "Backspace") && state.selection >= 0) els.deleteBtn.click();
  if (e.key === "Escape") { state.selection = -1; state.picking = false; render(); }
});
els.panBtn.addEventListener("click", function () {
  state.pan = !state.pan;
  state.picking = false;
  els.drawingSurface.classList.remove("picking");
  els.drawingSurface.classList.toggle("panning", state.pan);
  els.panBtn.textContent = state.pan ? "✎ Povratak na crtanje" : "✥ Pomakni prikaz";
  els.panBtn.setAttribute("aria-pressed", String(state.pan));
  tell(state.pan ? "Povlačenjem po prikazu sada pomičeš sliku, bez crtanja." :
    "Pomicanje isključeno. Nastavi s praćenjem logotipa.");
});
els.pickColor.addEventListener("click", function () {
  state.picking = !state.picking;
  if (state.picking) {
    state.pan = false;
    els.drawingSurface.classList.remove("panning");
    els.panBtn.textContent = "✥ Pomakni prikaz";
    els.panBtn.setAttribute("aria-pressed", "false");
  }
  els.drawingSurface.classList.toggle("picking", state.picking);
  tell(state.picking ? "Dodirni boju na logotipu koju želiš zadržati." : "Odabir boje isključen.");
});
els.showOriginal.addEventListener("change", function () { els.sourceImage.hidden = !els.showOriginal.checked; });
els.previewBtn.addEventListener("click", function () {
  els.showOriginal.checked = !els.showOriginal.checked;
  els.sourceImage.hidden = !els.showOriginal.checked;
  tell(els.showOriginal.checked ? "Prikazan je izvorni logo ispod vektora." : "Pregled samo SVG putanja (bez originalne slike).");
});
els.pathColor.addEventListener("input", render);
els.exportStyle.addEventListener("change", render);
function watchSlider(id, out, fn) {
  els[id].addEventListener("input", function () { els[out].textContent = fn(els[id].value); if (/Smooth$/.test(id)) render(); });
}
watchSlider("manualTolerance","manualToleranceValue",function(v) { return (Number(v)/10).toFixed(1).replace(".",",")+" px"; });
watchSlider("autoTolerance","autoToleranceValue",function(v) { return (Number(v)/10).toFixed(1).replace(".",",")+" px"; });
watchSlider("manualSmooth","manualSmoothValue",function(v) { return v+"%"; });
watchSlider("autoSmooth","autoSmoothValue",function(v) { return v+"%"; });
watchSlider("backgroundTolerance","backgroundToleranceValue",function(v) { return v; });
watchSlider("alphaThreshold","alphaThresholdValue",function(v) { return v+"%"; });

els.traceBtn.addEventListener("click", async function () {
  if (!state.pixels || state.busy) return;
  state.busy = true; setButtons();
  tell("Tražim rubove, zatvaram konture i uklanjam šum…");
  try {
    // Give the browser a chance to paint the progress message.
    await new Promise(function(resolve) { setTimeout(resolve, 30); });
    var found = core.contours(state.pixels, state.width, state.height, {
      bgTolerance: Number(els.backgroundTolerance.value),
      alphaThreshold: Number(els.alphaThreshold.value),
      tolerance: Number(els.autoTolerance.value) / 10,
      includeHoles: els.includeHoles.checked
    });
    state.auto = found.paths;
    if (!state.auto.length) {
      tell("Nisam pronašao zatvorene konture. Pokušaj drugi prag ili PNG s prozirnom pozadinom.", "error");
    } else {
      tell("✓ Pronađeno " + found.paths.length + " vektorskih kontura. " + found.note, "ok");
    }
    render();
  } catch (e) {
    console.error(e);
    tell("Automatsko praćenje nije uspjelo: " + e.message, "error");
  } finally {
    state.busy = false; setButtons();
  }
});
function buildExport() {
  var paths = currentPaths();
  if (!paths.length) throw new Error("Još nema nacrtanih putanja. Prvo nacrtaj rub ili pokreni automatsko praćenje.");
  var svg = core.exportSVG(paths, state.width, state.height, {
    color: els.pathColor.value,
    strokeWidth: els.strokeWidth.value,
    style: els.exportStyle.value,
    smooth: Number((state.mode === "manual" ? els.manualSmooth : els.autoSmooth).value)
  });
  if (!svg || !svg.includes("<path")) throw new Error("Nije moguće izvesti praznu vektorsku putanju.");
  return {svg:svg, name: "logo-" + (state.mode === "manual" ? "rucno" : "kontura") + ".svg"};
}
function saveWithAnchor(svg, name) {
  var blob = new Blob([svg], {type:"image/svg+xml;charset=utf-8"});
  var href = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some mobile browsers start the save asynchronously. Keep the URL alive.
  setTimeout(function () { URL.revokeObjectURL(href); }, 60000);
}
els.downloadBtn.addEventListener("click", function () {
  try {
    var item = buildExport();
    saveWithAnchor(item.svg, item.name);
    tell("Zahtjev za preuzimanje poslan pregledniku. Provjeri mapu Preuzimanja. Ako nije spremio SVG, klikni „Spremi / podijeli” (na mobitelu) ili „Kopiraj SVG kod”.", "ok");
  } catch (e) { tell(e.message, "error"); }
});
els.shareBtn.addEventListener("click", async function () {
  try {
    var item = buildExport();
    var file = new File([item.svg], item.name, { type: "image/svg+xml" });
    // Use the native Android share sheet when file sharing is available.
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
      try {
        await navigator.share({files:[file], title:item.name});
        tell("SVG je poslan u Androidov izbornik. Odaberi aplikaciju ili lokaciju za spremanje.", "ok");
      } catch (e) {
        if (e.name !== "AbortError") tell("Dijeljenje nije uspjelo: " + e.message + ". Pokušaj Preuzmi ili Kopiraj SVG kod.", "error");
      }
    } else {
      saveWithAnchor(item.svg, item.name);
      tell("Ovaj preglednik ne podržava dijeljenje SVG datoteke. Pokušao sam standardno preuzimanje. Ako ne radi, odaberi Kopiraj SVG kod.", "ok");
    }
  } catch (e) { tell(e.message, "error"); }
});
els.copySvgBtn.addEventListener("click", async function () {
  try {
    var item = buildExport();
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(item.svg);
    } else {
      var area = document.createElement("textarea");
      area.value = item.svg;
      area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.focus(); area.select();
      var copied = document.execCommand("copy");
      area.remove();
      if (!copied) throw new Error("Preglednik blokira međuspremnik.");
    }
    tell("✓ SVG kod kopiran. Možeš ga zalijepiti u tekstualnu datoteku s nastavkom .svg.", "ok");
  } catch (e) {
    tell("Kopiranje nije uspjelo: " + e.message + ". Probaj otvoriti stranicu u Chromeu umjesto unutar aplikacije.", "error");
  }
});
setButtons();
})();