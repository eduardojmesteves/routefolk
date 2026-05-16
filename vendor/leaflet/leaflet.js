/*
 * routefolk local Leaflet-compatible runtime
 * Scope: minimal API used by screens/v2/v2-archive-map.js.
 * Replace with upstream Leaflet dist/leaflet.js if a full vendor bundle is later added.
 */
(function(global){
  'use strict';

  const TILE_SIZE = 256;
  const R = 6378137;

  function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
  function toRad(deg){ return deg * Math.PI / 180; }
  function lngToX(lng, zoom){ return (lng + 180) / 360 * TILE_SIZE * Math.pow(2, zoom); }
  function latToY(lat, zoom){
    const limited = clamp(lat, -85.05112878, 85.05112878);
    const sin = Math.sin(toRad(limited));
    return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE * Math.pow(2, zoom);
  }
  function xToLng(x, zoom){ return x / (TILE_SIZE * Math.pow(2, zoom)) * 360 - 180; }
  function yToLat(y, zoom){
    const n = Math.PI - 2 * Math.PI * y / (TILE_SIZE * Math.pow(2, zoom));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  function project(latLng, zoom){ return { x: lngToX(latLng[1], zoom), y: latToY(latLng[0], zoom) }; }
  function unproject(point, zoom){ return [yToLat(point.y, zoom), xToLng(point.x, zoom)]; }

  class Bounds {
    constructor(points){
      this._valid = false;
      this.minLat = Infinity; this.maxLat = -Infinity; this.minLng = Infinity; this.maxLng = -Infinity;
      (points || []).forEach((point) => this.extend(point));
    }
    extend(point){
      if (!Array.isArray(point)) return this;
      const lat = Number(point[0]); const lng = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return this;
      this._valid = true;
      this.minLat = Math.min(this.minLat, lat); this.maxLat = Math.max(this.maxLat, lat);
      this.minLng = Math.min(this.minLng, lng); this.maxLng = Math.max(this.maxLng, lng);
      return this;
    }
    isValid(){ return this._valid; }
    getCenter(){ return [(this.minLat + this.maxLat) / 2, (this.minLng + this.maxLng) / 2]; }
  }

  class LayerGroup {
    constructor(){ this.layers = []; this.map = null; }
    addTo(map){ this.map = map; map._layers.push(this); return this; }
    clearLayers(){ this.layers.forEach((layer) => layer.remove && layer.remove()); this.layers = []; return this; }
    _add(layer){ this.layers.push(layer); if (this.map) layer.addTo(this.map); return layer; }
  }

  class TileLayer {
    constructor(url, options){ this.url = url; this.options = options || {}; this.map = null; }
    addTo(map){ this.map = map; map._tileLayer = this; map._render(); return this; }
    _tileUrl(x, y, z){
      const subdomains = this.options.subdomains || ['a','b','c'];
      const s = Array.isArray(subdomains) ? subdomains[Math.abs(x + y) % subdomains.length] : String(subdomains)[Math.abs(x + y) % String(subdomains).length];
      return this.url.replace('{s}', s).replace('{z}', z).replace('{x}', x).replace('{y}', y);
    }
  }

  class Polyline {
    constructor(latLngs, options){ this.latLngs = latLngs || []; this.options = options || {}; this.map = null; this.el = null; this.tooltipText = ''; }
    addTo(target){
      const map = target instanceof LayerGroup ? target.map : target;
      if (target instanceof LayerGroup) target.layers.push(this);
      this.map = map; if (map) { map._vectorLayers.push(this); map._render(); }
      return this;
    }
    bindTooltip(text){ this.tooltipText = text || ''; if (this.el) this.el.setAttribute('data-tooltip', this.tooltipText); return this; }
    remove(){ if (this.el) this.el.remove(); this.el = null; }
    _draw(svg){
      if (!this.map || this.latLngs.length < 2) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = this.latLngs.map((ll, index) => {
        const p = this.map._latLngToContainerPoint(ll);
        return `${index ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }).join(' ');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', this.options.color || '#26345e');
      path.setAttribute('stroke-width', String(this.options.weight || 3));
      path.setAttribute('stroke-opacity', String(this.options.opacity ?? 0.85));
      path.setAttribute('stroke-linecap', this.options.lineCap || 'round');
      path.setAttribute('stroke-linejoin', this.options.lineJoin || 'round');
      path.classList.add('leaflet-interactive');
      if (this.tooltipText) path.setAttribute('data-tooltip', this.tooltipText);
      svg.appendChild(path);
      this.el = path;
    }
  }

  class CircleMarker {
    constructor(latLng, options){ this.latLng = latLng; this.options = options || {}; this.map = null; this.el = null; }
    addTo(target){
      const map = target instanceof LayerGroup ? target.map : target;
      if (target instanceof LayerGroup) target.layers.push(this);
      this.map = map; if (map) { map._vectorLayers.push(this); map._render(); }
      return this;
    }
    remove(){ if (this.el) this.el.remove(); this.el = null; }
    _draw(svg){
      if (!this.map) return;
      const p = this.map._latLngToContainerPoint(this.latLng);
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1));
      c.setAttribute('r', String(this.options.radius || 4));
      c.setAttribute('stroke', this.options.color || '#26345e');
      c.setAttribute('stroke-width', String(this.options.weight || 2));
      c.setAttribute('fill', this.options.fillColor || '#fff');
      c.setAttribute('fill-opacity', String(this.options.fillOpacity ?? 1));
      svg.appendChild(c); this.el = c;
    }
  }

  class Map {
    constructor(el, options){
      this.el = typeof el === 'string' ? document.getElementById(el) : el;
      this.options = options || {};
      this.zoom = 5; this.center = [40.2, -3.7]; this._layers = []; this._vectorLayers = []; this._tileLayer = null;
      this._buildDom();
      this._bind();
    }
    _buildDom(){
      this.el.classList.add('leaflet-container'); this.el.innerHTML = '';
      this.tilePane = document.createElement('div'); this.tilePane.className = 'leaflet-tile-pane';
      this.overlayPane = document.createElement('div'); this.overlayPane.className = 'leaflet-overlay-pane';
      this.controls = document.createElement('div'); this.controls.className = 'leaflet-control-container';
      this.zoomControl = document.createElement('div'); this.zoomControl.className = 'leaflet-control leaflet-control-zoom leaflet-top leaflet-left';
      this.zoomControl.innerHTML = '<a href="#" data-zoom="in">+</a><a href="#" data-zoom="out">−</a>';
      this.attribution = document.createElement('div'); this.attribution.className = 'leaflet-control leaflet-control-attribution leaflet-bottom leaflet-right';
      this.el.append(this.tilePane, this.overlayPane, this.controls);
      this.controls.append(this.zoomControl, this.attribution);
    }
    _bind(){
      this.zoomControl.addEventListener('click', (event) => {
        const a = event.target.closest('[data-zoom]'); if (!a) return;
        event.preventDefault(); this.setZoom(this.zoom + (a.dataset.zoom === 'in' ? 1 : -1));
      });
    }
    setView(center, zoom){ this.center = center || this.center; this.zoom = Number.isFinite(Number(zoom)) ? Number(zoom) : this.zoom; this._render(); return this; }
    setZoom(zoom){ this.zoom = clamp(Math.round(zoom), 1, 18); this._render(); return this; }
    fitBounds(bounds, options){
      const b = bounds instanceof Bounds ? bounds : new Bounds(bounds);
      if (!b.isValid()) return this;
      this.center = b.getCenter();
      const size = this._size();
      const pad = (options && options.padding) || [24,24];
      let zoom = 5;
      for (let z = 18; z >= 1; z--) {
        const p1 = project([b.minLat, b.minLng], z); const p2 = project([b.maxLat, b.maxLng], z);
        if (Math.abs(p2.x - p1.x) <= size.w - pad[0] * 2 && Math.abs(p2.y - p1.y) <= size.h - pad[1] * 2) { zoom = z; break; }
      }
      this.zoom = Math.min(zoom, options?.maxZoom || 18); this._render(); return this;
    }
    invalidateSize(){ this._render(); return this; }
    remove(){ this.el.innerHTML = ''; this._layers = []; this._vectorLayers = []; }
    _size(){ return { w: this.el.clientWidth || 640, h: this.el.clientHeight || 360 }; }
    _centerWorld(){ return project(this.center, this.zoom); }
    _latLngToContainerPoint(latLng){ const size = this._size(); const center = this._centerWorld(); const p = project(latLng, this.zoom); return { x: p.x - center.x + size.w / 2, y: p.y - center.y + size.h / 2 }; }
    _render(){ this._renderTiles(); this._renderVectors(); }
    _renderTiles(){
      this.tilePane.innerHTML = '';
      if (!this._tileLayer) return;
      const size = this._size(); const center = this._centerWorld(); const z = this.zoom;
      const startX = Math.floor((center.x - size.w / 2) / TILE_SIZE); const endX = Math.floor((center.x + size.w / 2) / TILE_SIZE);
      const startY = Math.floor((center.y - size.h / 2) / TILE_SIZE); const endY = Math.floor((center.y + size.h / 2) / TILE_SIZE);
      const max = Math.pow(2, z);
      for (let x = startX; x <= endX; x++) for (let y = startY; y <= endY; y++) {
        if (y < 0 || y >= max) continue;
        const wrappedX = ((x % max) + max) % max;
        const img = document.createElement('img'); img.className = 'leaflet-tile'; img.alt = '';
        img.src = this._tileLayer._tileUrl(wrappedX, y, z);
        img.style.left = `${x * TILE_SIZE - (center.x - size.w / 2)}px`; img.style.top = `${y * TILE_SIZE - (center.y - size.h / 2)}px`;
        this.tilePane.appendChild(img);
      }
      this.attribution.innerHTML = this._tileLayer.options.attribution || '';
    }
    _renderVectors(){
      this.overlayPane.innerHTML = '';
      const size = this._size(); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size.w); svg.setAttribute('height', size.h); svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
      this.overlayPane.appendChild(svg);
      this._vectorLayers.forEach((layer) => layer._draw && layer._draw(svg));
    }
  }

  function map(el, options){ return new Map(el, options); }
  function tileLayer(url, options){ return new TileLayer(url, options); }
  function layerGroup(){ return new LayerGroup(); }
  function polyline(latLngs, options){ return new Polyline(latLngs, options); }
  function circleMarker(latLng, options){ return new CircleMarker(latLng, options); }
  function latLngBounds(points){ return new Bounds(points); }

  global.L = { map, tileLayer, layerGroup, polyline, circleMarker, latLngBounds };
  global.leaflet = global.L;
})(window);
