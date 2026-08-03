/* ============================================================
   muh4mmedh.dev — interaction engine v2
   particle-text hero · pinned scenes · drag gallery · lenis
   gsap + scrolltrigger (cdn). degrades gracefully without js.
   ============================================================ */
(function(){
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine    = window.matchMedia('(pointer:fine)').matches;
  var anim    = !!window.gsap && !!window.ScrollTrigger && !reduced;

  /* ---------------------------------------------------------- utils */
  function q(s, c){ return (c||document).querySelector(s); }
  function qa(s, c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); }
  var clamp = function(v, a, b){ return Math.max(a, Math.min(b, v)); };

  /* while the page is actively scrolling, ambient layers (led grid, portrait
     shimmer) skip their redraws so the main thread stays free for the scroll */
  var scrollBusyUntil = 0;
  addEventListener('scroll', function(){ scrollBusyUntil = performance.now() + 160; }, {passive:true});

  var POOL = 'abcdefghjkmnpqrstuvwxyz0123456789#%&*+=';
  function splitChars(root){
    var chs = [];
    (function walk(node){
      Array.prototype.slice.call(node.childNodes).forEach(function(n){
        if(n.nodeType === 3){
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function(part){
            if(!part) return;
            if(/^\s+$/.test(part)){ frag.appendChild(document.createTextNode(part)); return; }
            var wd = document.createElement('span'); wd.className = 'wd';
            part.split('').forEach(function(ch){
              var s = document.createElement('span');
              s.className = 'ch'; s.dataset.ch = ch; s.textContent = ch;
              wd.appendChild(s); chs.push(s);
            });
            frag.appendChild(wd);
          });
          node.replaceChild(frag, n);
        } else if(n.nodeType === 1 && n.tagName !== 'BR'){ walk(n); }
      });
    })(root);
    return chs;
  }
  function decode(chs, each, show){
    each = each || 34;
    chs.forEach(function(c, i){
      setTimeout(function(){
        if(show !== false){ c.style.visibility = 'visible'; c.style.opacity = '1'; }
        var frames = 0, need = 2 + (Math.random()*3|0), fin = c.dataset.ch;
        var iv = setInterval(function(){
          if(frames >= need){ c.textContent = fin; clearInterval(iv); }
          else c.textContent = POOL[(Math.random()*POOL.length)|0];
          frames++;
        }, 42);
      }, i*each);
    });
  }
  /* wrap words in masked spans (keeps nested <strong>/<span> styling) */
  function wrapMasked(el){
    var spans = [];
    (function walk(node){
      Array.prototype.slice.call(node.childNodes).forEach(function(n){
        if(n.nodeType === 3){
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function(part){
            if(!part) return;
            if(/^\s+$/.test(part)){ frag.appendChild(document.createTextNode(part)); return; }
            var wm = document.createElement('span'); wm.className = 'wm';
            var inner = document.createElement('span'); inner.textContent = part;
            wm.appendChild(inner); frag.appendChild(wm); spans.push(inner);
          });
          node.replaceChild(frag, n);
        } else if(n.nodeType === 1 && n.tagName !== 'BR'){ walk(n); }
      });
    })(el);
    return spans;
  }

  /* ---------------------------------------------------------- ambient led grid */
  (function led(){
    var cv = q('#led'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var GAP = fine ? 30 : 36;              // sparser grid on touch devices
    var FRAME_MS = 28;                     // ambient layer: ~30fps is plenty
    var W, H, dots = [], mx = -9999, my = -9999, t = 0, lastTs = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    function build(){
      W = innerWidth; H = innerHeight;
      cv.width = W*dpr; cv.height = H*dpr;
      cv.style.width = W+'px'; cv.style.height = H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      dots = [];
      for(var y = GAP/2; y < H; y += GAP)
        for(var x = GAP/2; x < W; x += GAP)
          dots.push({x:x, y:y, a:0, blink:Math.random()*6.28, bs:.4 + Math.random()*1.2});
    }
    build();
    var rt;
    addEventListener('resize', function(){ clearTimeout(rt); rt = setTimeout(build, 180); }, {passive:true});
    if(fine) addEventListener('mousemove', function(e){ mx = e.clientX; my = e.clientY; }, {passive:true});
    var R = 150, R2 = R*R;
    /* setting globalAlpha + fillRect per dot costs one canvas state change and one
       draw call each — ~37k/sec at 720p. quantising alpha into LV levels lets every
       dot at the same level go out in a single batched fill: ~20 calls/frame. */
    var LV = 9, A_MAX = .72;
    var bins = []; for(var b = 0; b < LV*2; b++) bins.push([]);
    function frame(ts){
      if(FRAME_MS && ts - lastTs < FRAME_MS){ requestAnimationFrame(frame); return; }
      if(ts < scrollBusyUntil){ requestAnimationFrame(frame); return; }
      lastTs = ts;
      t += .016;
      ctx.clearRect(0,0,W,H);
      for(var n = 0; n < bins.length; n++) bins[n].length = 0;
      for(var i = 0; i < dots.length; i++){
        var d = dots[i];
        var base = .05 + .035*Math.max(0, Math.sin(t*d.bs + d.blink));
        var dx = d.x - mx, dy = d.y - my, dd = dx*dx + dy*dy;
        var target = base;
        if(dd < R2){
          var k = 1 - Math.sqrt(dd)/R;
          target = base + k*k*.6;
        }
        d.a += (target - d.a)*.14;
        var lvl = (d.a/A_MAX*LV)|0;
        if(lvl < 0) continue;
        if(lvl >= LV) lvl = LV-1;
        var red = dd < R2*.14 && d.a > .09;
        var arr = bins[red ? LV+lvl : lvl];
        arr.push(d.x-1, d.y-1);
      }
      for(var bi = 0; bi < bins.length; bi++){
        var bucket = bins[bi]; if(!bucket.length) continue;
        var isRed = bi >= LV, lv = isRed ? bi-LV : bi;
        ctx.fillStyle = (isRed ? 'rgba(255,68,56,' : 'rgba(237,237,237,') +
                        ((lv + .5)/LV*A_MAX).toFixed(3) + ')';
        ctx.beginPath();
        for(var j = 0; j < bucket.length; j += 2) ctx.rect(bucket[j], bucket[j+1], 2, 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    if(!reduced){ requestAnimationFrame(frame); }
    else {
      ctx.fillStyle = 'rgba(237,237,237,.06)';
      dots.forEach(function(d){ ctx.fillRect(d.x-1, d.y-1, 2, 2); });
    }
  })();

  /* ---------------------------------------------------------- hero particle text */
  var particles = (function(){
    var cv = q('#heroCanvas'), hero = q('.hero'), h1 = q('.hero-name');
    if(!cv || !anim) return null;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var pts = [], built = false, started = false, disperse = 0;
    var mx = -9999, my = -9999, t0 = 0;

    function build(){
      var hr = hero.getBoundingClientRect();
      cv.width = hr.width*dpr; cv.height = hr.height*dpr;
      cv.style.width = hr.width+'px'; cv.style.height = hr.height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      pts = [];
      var lines = qa('.ln > span', h1);
      var off = document.createElement('canvas');
      var octx = off.getContext('2d');
      lines.forEach(function(ln){
        var lr = ln.getBoundingClientRect();
        if(lr.width < 4) return;
        var fs = parseFloat(getComputedStyle(ln.closest('.hero-name')).fontSize);
        off.width = Math.ceil(lr.width) + 8; off.height = Math.ceil(lr.height) + 8;
        octx.clearRect(0,0,off.width,off.height);
        octx.font = '900 ' + fs + 'px Doto, monospace';
        octx.textBaseline = 'top';
        // draw dim/white/red parts with real colors
        var x = 0;
        Array.prototype.slice.call(ln.childNodes).forEach(function(n){
          var txt = n.textContent; if(!txt) return;
          var red = n.nodeType === 1 && n.classList.contains('r');
          var dim = ln.classList.contains('dim');
          octx.fillStyle = red ? '#ff4438' : (dim ? '#9a9a9a' : '#ededed');
          octx.fillText(txt, x, 2);
          x += octx.measureText(txt).width;
        });
        var step = Math.max(4, Math.round(fs/24));
        var img = octx.getImageData(0,0,off.width,off.height).data;
        var ox = lr.left - hr.left, oy = lr.top - hr.top;
        for(var yy = 0; yy < off.height; yy += step){
          for(var xx = 0; xx < off.width; xx += step){
            var i4 = (yy*off.width + xx)*4;
            if(img[i4+3] > 120){
              var red = img[i4] > 200 && img[i4+1] < 130;
              var ang = Math.random()*6.28;
              pts.push({
                hx: ox + xx, hy: oy + yy,
                x: Math.random()*hr.width, y: Math.random()*hr.height,
                sx: Math.cos(ang)*(260 + Math.random()*420),
                sy: Math.sin(ang)*(200 + Math.random()*360),
                d: Math.random()*650,
                red: red,
                ox: 0, oy: 0,
                a: red ? 1 : (img[i4] > 180 ? .95 : .62)
              });
            }
          }
        }
      });
      pts.sort(function(a, b){ return (a.red?1:0) - (b.red?1:0); }); // group by color → 2 fillStyle switches per frame
      built = pts.length > 60;
      if(built) document.body.classList.add('particles-on');
      else document.body.classList.remove('particles-on');
    }

    var mouseActiveUntil = 0;
    if(fine) addEventListener('mousemove', function(e){
      var hr = hero.getBoundingClientRect();
      mx = e.clientX - hr.left; my = e.clientY - hr.top;
      if(my >= 0 && my <= hr.height) mouseActiveUntil = performance.now() + 1200;
    }, {passive:true});

    var R = 105, R2 = R*R;
    var heroVisible = true;
    new IntersectionObserver(function(es){
      es.forEach(function(e){ heroVisible = e.isIntersecting; });
    }, {threshold:0}).observe(hero);
    var lastDisperse = -1;
    var LV = 5;                                    // alpha buckets → batched fills
    var bins = []; for(var bq = 0; bq < LV*2; bq++) bins.push([]);
    function frame(ts){
      if(!t0) t0 = ts;
      if(!heroVisible){ requestAnimationFrame(frame); return; }
      var el = ts - t0;
      // dirty check: skip redraw when fully settled (assembled, cursor away, no scroll shatter)
      var settled = el > 5000 && ts > mouseActiveUntil && Math.abs(disperse - lastDisperse) < .0004;
      if(settled){ requestAnimationFrame(frame); return; }
      lastDisperse = disperse;
      ctx.clearRect(0,0,cv.width,cv.height);
      var vis = 1 - disperse;
      if(vis <= 0){ requestAnimationFrame(frame); return; }
      for(var n = 0; n < bins.length; n++) bins[n].length = 0;
      for(var i = 0; i < pts.length; i++){
        var p = pts[i];
        if(el > p.d){
          p.x += (p.hx - p.x)*.085;
          p.y += (p.hy - p.y)*.085;
        }
        var dx = p.x - mx, dy = p.y - my, dd = dx*dx + dy*dy;
        var tox = 0, toy = 0;
        if(dd < R2 && dd > .01){
          var dist = Math.sqrt(dd), k = (1 - dist/R);
          k = k*k*36;
          tox = dx/dist*k; toy = dy/dist*k;
        }
        p.ox += (tox - p.ox)*.16;
        p.oy += (toy - p.oy)*.16;
        var rx = p.x + p.ox + p.sx*disperse;
        var ry = p.y + p.oy + p.sy*disperse;
        var lvl = (p.a*LV)|0; if(lvl >= LV) lvl = LV-1;
        var arr = bins[p.red ? LV+lvl : lvl];
        arr.push(rx-1.1, ry-1.1);
      }
      for(var bi = 0; bi < bins.length; bi++){
        var bucket = bins[bi]; if(!bucket.length) continue;
        var isRed = bi >= LV, lv = isRed ? bi-LV : bi;
        ctx.fillStyle = (isRed ? 'rgba(255,68,56,' : 'rgba(237,237,237,') +
                        (((lv + .5)/LV)*vis).toFixed(3) + ')';
        ctx.beginPath();
        for(var j = 0; j < bucket.length; j += 2) ctx.rect(bucket[j], bucket[j+1], 2.2, 2.2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }

    var resizeTimer;
    addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function(){ if(started){ build(); t0 = 0; } }, 220);
    }, {passive:true});

    return {
      start: function(){
        var kick = function(){
          build();
          if(!built){ // font sampling failed — fall back to decode
            gsap.set(h1, {autoAlpha:1});
            var chs = [];
            qa('.hero-name .ln > span').forEach(function(s){ chs = chs.concat(splitChars(s)); });
            chs.forEach(function(c){ c.style.opacity = '0'; });
            decode(chs, 36);
            return;
          }
          started = true;
          requestAnimationFrame(frame);
        };
        if(document.fonts && document.fonts.load){
          Promise.all([
            document.fonts.load('900 100px Doto'),
            document.fonts.ready
          ]).then(kick, kick);
        } else kick();
      },
      setDisperse: function(v){ disperse = v; }
    };
  })();

  /* ---------------------------------------------------------- portrait: led halftone + hover develop */
  (function portrait(){
    var card = q('#meCard'), cv = q('#meCanvas'), img = q('.me-img');
    if(!card || !cv || !img || !anim) return;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, cells = [], GAP = 7;
    var mx = -9999, my = -9999, r = 0, targetR = 0, running = false, ready = false;
    var halftone = null;   // pre-rendered dot matrix — static, so it is drawn once

    function cover(iw, ih, cw, ch){
      var s = Math.max(cw/iw, ch/ih);
      return { w: iw*s, h: ih*s, x: (cw - iw*s)/2, y: (ch - ih*s)/2 };
    }
    function build(){
      var rect = card.getBoundingClientRect();
      W = rect.width; H = rect.height;
      cv.width = W*dpr; cv.height = H*dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      var off = document.createElement('canvas');
      var octx = off.getContext('2d');
      var cols = Math.ceil(W/GAP), rows = Math.ceil(H/GAP);
      off.width = cols; off.height = rows;
      var f = cover(img.naturalWidth, img.naturalHeight, cols, rows);
      octx.drawImage(img, f.x, f.y, f.w, f.h);
      var data = octx.getImageData(0, 0, cols, rows).data;
      cells = [];
      for(var y = 0; y < rows; y++){
        for(var x = 0; x < cols; x++){
          var i4 = (y*cols + x)*4;
          var lum = (data[i4]*.299 + data[i4+1]*.587 + data[i4+2]*.114)/255;
          lum = Math.pow(lum, .62); // lift midtones — source portrait is low-key
          if(lum > .07) cells.push({x:x*GAP + GAP/2, y:y*GAP + GAP/2, l:lum, ph:Math.random()*6.28});
        }
      }
      bakeHalftone();
      ready = true;
    }
    /* the halftone never changes once built, so rasterise it once and blit it each
       frame instead of re-issuing ~4000 alpha-set + fillRect pairs per frame */
    function bakeHalftone(){
      halftone = document.createElement('canvas');
      halftone.width = Math.max(1, W*dpr); halftone.height = Math.max(1, H*dpr);
      var hc = halftone.getContext('2d');
      hc.setTransform(dpr,0,0,dpr,0,0);
      var LV = 10, bins = [], i;
      for(i = 0; i < LV; i++) bins.push([]);
      for(i = 0; i < cells.length; i++){
        var c = cells[i];
        var sz = c.l*GAP*.62;
        if(sz < .3) continue;
        var lvl = ((.18 + c.l*.82)*LV)|0;
        if(lvl >= LV) lvl = LV-1;
        bins[lvl].push(c.x - sz/2, c.y - sz/2, sz);
      }
      for(i = 0; i < LV; i++){
        var arr = bins[i]; if(!arr.length) continue;
        hc.fillStyle = 'rgba(237,237,237,' + ((i + .5)/LV).toFixed(3) + ')';
        hc.beginPath();
        for(var j = 0; j < arr.length; j += 3) hc.rect(arr[j], arr[j+1], arr[j+2], arr[j+2]);
        hc.fill();
      }
    }
    var t = 0, lastT = 0;
    function frame(ts){
      if(!running) return;
      var idle = targetR === 0 && r < 2;
      if(idle && ts - lastT < 45){ requestAnimationFrame(frame); return; }  // idle breathe at ~22fps
      if(idle && ts < scrollBusyUntil){ requestAnimationFrame(frame); return; }
      lastT = ts;
      t += .02;
      ctx.clearRect(0,0,W,H);
      r += (targetR - r)*.11;
      if(halftone){
        ctx.globalAlpha = .93 + Math.sin(t)*.07;   // whole-layer breathe replaces per-cell shimmer
        ctx.drawImage(halftone, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      if(r > 2){
        var f = cover(img.naturalWidth, img.naturalHeight, W, H);
        ctx.save();
        ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.29); ctx.clip();
        ctx.drawImage(img, f.x, f.y, f.w, f.h);
        var g = ctx.createRadialGradient(mx, my, r*.66, mx, my, r);
        g.addColorStop(0, 'rgba(10,10,10,0)');
        g.addColorStop(1, 'rgba(10,10,10,1)');
        ctx.fillStyle = g;
        ctx.fillRect(mx - r, my - r, r*2, r*2);
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }
    function start(){ if(!running && ready){ running = true; requestAnimationFrame(frame); } }
    function stop(){ running = false; }

    function init(){
      build();
      new IntersectionObserver(function(es){
        es.forEach(function(e){ e.isIntersecting ? start() : stop(); });
      }, {threshold:.05}).observe(card);
      card.addEventListener('pointermove', function(e){
        var rect = card.getBoundingClientRect();
        mx = e.clientX - rect.left; my = e.clientY - rect.top;
        targetR = Math.min(rect.width, rect.height)*.34;
      });
      card.addEventListener('pointerleave', function(){ targetR = 0; });
      var rt;
      addEventListener('resize', function(){
        clearTimeout(rt); rt = setTimeout(build, 220);
      }, {passive:true});
    }
    if(img.complete && img.naturalWidth) init();
    else {
      img.addEventListener('load', init);
      img.addEventListener('error', function(){
        // no portrait asset — show nothing rather than a broken card
        card.style.display = 'none';
      });
    }
  })();

  /* ---------------------------------------------------------- nav + menu */
  var nav = q('#nav');
  function onScroll(){ nav.classList.toggle('scrolled', window.scrollY > 24); }
  addEventListener('scroll', onScroll, {passive:true}); onScroll();

  var ham = q('#hamburger'), menu = q('#mobileMenu');
  function toggleMenu(){ ham.classList.toggle('open'); menu.classList.toggle('open'); }
  ham.addEventListener('click', toggleMenu);
  ham.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleMenu(); } });
  qa('a', menu).forEach(function(a){
    a.addEventListener('click', function(){ ham.classList.remove('open'); menu.classList.remove('open'); });
  });

  /* ---------------------------------------------------------- clock + year */
  function tick(){
    var el = q('#localTime'); if(!el) return;
    try{
      el.textContent = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Colombo'}).format(new Date()).toLowerCase();
    }catch(_){
      var n = new Date(), u = n.getTime() + n.getTimezoneOffset()*60000, c = new Date(u + 5.5*3600000);
      var h = c.getHours(), m = c.getMinutes();
      el.textContent = ((h%12)||12) + ':' + String(m).padStart(2,'0') + ' ' + (h>=12?'pm':'am');
    }
  }
  tick(); setInterval(tick, 15000);
  q('#year').textContent = new Date().getFullYear();

  /* ---------------------------------------------------------- github live */
  var GH = 'muh4mmedh';
  var EXCLUDE = ['aaminawed','muh4mmedh','isdn','isdn_presentation','filetransfer','zoro.to-clone'];

  function countUp(id, target, decimals){
    var el = q('#'+id); if(!el) return;
    if(!anim){ el.textContent = target.toFixed(decimals); return; }
    var t0 = null, dur = 1400;
    function step(ts){
      if(!t0) t0 = ts;
      var p = Math.min((ts-t0)/dur, 1);
      p = 1 - Math.pow(1-p, 3);
      el.textContent = (target*p).toFixed(decimals);
      if(p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  fetch('https://api.github.com/users/' + GH)
    .then(function(r){ if(!r.ok) throw 0; return r.json(); })
    .then(function(d){
      countUp('statRepos', d.public_repos || 10, 0);
      var yrs = (Date.now() - new Date(d.created_at).getTime()) / 31557600000;
      countUp('statYears', Math.round(yrs*10)/10, 1);
      q('#ghFollowers').textContent = d.followers;
      q('#ghPublic').textContent = d.public_repos;
    })
    .catch(function(){
      q('#statRepos').textContent = '10';
      q('#statYears').textContent = '3.8';
      q('#ghFollowers').textContent = '3';
      q('#ghPublic').textContent = '10';
    });

  fetch('https://api.github.com/users/' + GH + '/repos?per_page=100&sort=pushed')
    .then(function(r){ if(!r.ok) throw 0; return r.json(); })
    .then(function(repos){
      var list = q('#repoList');
      var picks = repos.filter(function(r){
        return !r.fork && EXCLUDE.indexOf(r.name.toLowerCase()) === -1;
      }).slice(0, 6);
      if(!picks.length) throw 0;
      list.innerHTML = picks.map(function(r){
        var d = new Date(r.pushed_at);
        var when = d.toLocaleDateString('en-GB',{month:'short',year:'numeric'}).toLowerCase();
        return '<a class="repo" href="' + r.html_url + '" target="_blank" rel="noopener">' +
          '<span class="repo-dot" aria-hidden="true"></span>' +
          '<span class="repo-body">' +
            '<span class="repo-name">' + r.name.toLowerCase() + '</span>' +
            '<span class="repo-desc">' + (r.description ? r.description.replace(/</g,'&lt;') : 'no description — the code speaks') + '</span>' +
          '</span>' +
          '<span class="repo-meta">' + (r.language ? '<b>' + r.language.toLowerCase() + '</b><br>' : '') + when +
            (r.stargazers_count ? ' &middot; ★' + r.stargazers_count : '') + '</span>' +
        '</a>';
      }).join('');
    })
    .catch(function(){
      q('#repoList').innerHTML =
        '<div class="repos-fallback">couldn’t reach the github api — <a href="https://github.com/' + GH + '?tab=repositories" style="color:var(--white)">browse repositories directly &nearr;</a></div>';
    });

  /* ---------------------------------------------------------- ide typing loop */
  (function ide(){
    var code = q('#ideCode'), gut = q('#ideGutter'), status = q('#ideStatus');
    if(!code) return;
    var LINES = [
      ['ctx', 'ALTER PROCEDURE dbo.sp_inventory_sync'],
      ['ctx', '  @warehouse_id INT'],
      ['del', '  SELECT * FROM stock WITH (NOLOCK)'],
      ['add', '  SELECT s.sku, s.qty, s.updated_at'],
      ['add', '  FROM stock s WITH (READCOMMITTED)'],
      ['add', '  WHERE s.warehouse_id = @warehouse_id'],
      ['ctx', '  ORDER BY s.updated_at DESC'],
      ['del', '  -- TODO: fix race condition'],
      ['add', '  OPTION (RECOMPILE)'],
      ['ctx', 'END']
    ];
    var STATUSES = ['3 objects changed', 'diff: +4 −2', 'review requested', 'merged ✓'];
    var li = 0, ci = 0, lineEl = null, sIdx = 0;
    function newLine(){
      lineEl = document.createElement('span');
      lineEl.className = 'ln-' + LINES[li][0];
      code.appendChild(lineEl);
      gut.innerHTML += (li+1) + '<br>';
    }
    function typeStep(){
      if(li >= LINES.length){
        status.textContent = STATUSES[(sIdx++) % STATUSES.length];
        setTimeout(function(){
          status.textContent = STATUSES[(sIdx++) % STATUSES.length];
          setTimeout(reset, 2200);
        }, 1600);
        return;
      }
      if(ci === 0) newLine();
      var text = LINES[li][1];
      ci += 1 + (Math.random()*2|0);
      if(ci >= text.length){
        lineEl.textContent = text;
        li++; ci = 0;
        setTimeout(typeStep, 90 + Math.random()*160);
      } else {
        lineEl.innerHTML = text.slice(0, ci).replace(/</g,'&lt;') + '<span class="caret"></span>';
        setTimeout(typeStep, 14 + Math.random()*30);
      }
    }
    function reset(){
      code.innerHTML = ''; gut.innerHTML = '';
      li = 0; ci = 0;
      status.textContent = STATUSES[0]; sIdx = 1;
      typeStep();
    }
    if(reduced){
      LINES.forEach(function(l, i){
        var s = document.createElement('span');
        s.className = 'ln-' + l[0]; s.textContent = l[1];
        code.appendChild(s);
        gut.innerHTML += (i+1) + '<br>';
      });
      return;
    }
    var seen = false;
    new IntersectionObserver(function(es, io){
      es.forEach(function(e){
        if(e.isIntersecting && !seen){ seen = true; typeStep(); io.disconnect(); }
      });
    }, {threshold:.25}).observe(code);
  })();

  /* ---------------------------------------------------------- scrollspy rail */
  (function spy(){
    var links = {};
    qa('#rail a').forEach(function(a){ links[a.dataset.spy] = a; });
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(e.isIntersecting){
          qa('#rail a').forEach(function(a){ a.classList.remove('active'); });
          var l = links[e.target.id];
          if(l) l.classList.add('active');
        }
      });
    }, {rootMargin:'-40% 0px -50% 0px'});
    qa('[data-spy-target]').forEach(function(s){ io.observe(s); });
  })();

  /* ---------------------------------------------------------- animation engine */
  if (anim) {
    gsap.registerPlugin(ScrollTrigger);
    document.body.classList.add('gs');

    /* lenis inertia scroll */
    var lenis = null;
    if (window.Lenis) {
      document.documentElement.classList.add('lenis-on');
      /* lerp drives perceived input lag: each frame closes this fraction of the
         remaining distance, so .09 trails the wheel by ~800ms. .18 still reads as
         smooth but settles in ~390ms. */
      lenis = new Lenis({ lerp: .18, wheelMultiplier: 1.15 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function(t){ lenis.raf(t*1000); });
      gsap.ticker.lagSmoothing(0);
      qa('a[href^="#"]').forEach(function(a){
        a.addEventListener('click', function(e){
          var id = a.getAttribute('href');
          if(id.length > 1 && q(id)){
            e.preventDefault();
            lenis.scrollTo(id, {offset:-64, duration:.9});
          }
        });
      });
    }

    /* progress bar */
    gsap.to('#progress', {scaleX:1, ease:'none',
      scrollTrigger:{start:0, end:'max', scrub:.3}});

    /* masked word setups */
    var subWords = wrapMasked(q('.hero-sub'));
    qa('.lab-desc, .contact p, .about-text p').forEach(function(el){
      var spans = wrapMasked(el);
      ScrollTrigger.create({
        trigger:el, start:'top 88%', once:true,
        onEnter:function(){
          gsap.to(spans, {y:0, duration:.9, ease:'power4.out', stagger:.012});
        }
      });
    });

    /* initial hidden states */
    if(particles) gsap.set('.hero-name', {autoAlpha:0});
    gsap.set(['.hero-eyebrow','.hero-actions'], {autoAlpha:0, y:26});
    gsap.set('.hero-meta', {autoAlpha:0});
    gsap.set('.reveal', {autoAlpha:0, y:44});

    /* hero entrance */
    function intro(){
      var tl = gsap.timeline();
      tl.to('.hero-eyebrow', {autoAlpha:1, y:0, duration:.7, ease:'power3.out'});
      tl.call(function(){ if(particles) particles.start(); }, null, '-=0.5');
      tl.to(subWords, {y:0, duration:.9, ease:'power4.out', stagger:.014}, '+=0.9');
      tl.to('.hero-actions', {autoAlpha:1, y:0, duration:.85, ease:'power3.out'}, '-=0.55');
      tl.to('.hero-meta', {autoAlpha:1, duration:.9}, '-=0.5');
    }

    /* preloader boot */
    var pre = q('#preloader');
    pre.style.display = 'flex';
    var boot = q('#preBoot');
    ['loading dot grid', 'sampling glyphs', 'charging particles', 'ready'].forEach(function(b, i){
      setTimeout(function(){
        var d = document.createElement('div');
        d.className = 'ok'; d.textContent = b;
        boot.appendChild(d);
      }, 140 + i*190);
    });
    var cntEl = q('#preCount'), cnt = {v:0};
    var ptl = gsap.timeline();
    ptl.to(cnt, {v:100, duration:1.05, ease:'power2.inOut', onUpdate:function(){
      cntEl.textContent = String(Math.round(cnt.v)).padStart(3,'0');
    }});
    ptl.to('#preLine', {width:'100%', duration:1.05, ease:'power2.inOut'}, 0);
    ptl.to(pre, {yPercent:-100, duration:.8, ease:'power4.inOut', delay:.12, onComplete:function(){ pre.style.display='none'; }});
    ptl.add(intro, '-=0.42');

    /* hero scroll-out: particles shatter + content drifts */
    ScrollTrigger.create({
      trigger:'.hero', start:'top top', end:'75% top', scrub:true,
      onUpdate:function(self){ if(particles) particles.setDisperse(self.progress); }
    });
    gsap.to('.hero-inner', {yPercent:-10, autoAlpha:.08, ease:'none',
      scrollTrigger:{trigger:'.hero', start:'top top', end:'85% top', scrub:true}});
    gsap.to('.hero-meta', {autoAlpha:0, ease:'none',
      scrollTrigger:{trigger:'.hero', start:'5% top', end:'30% top', scrub:true}});

    /* heading decode on scroll */
    qa('.sec-head h2, .contact h2, .lab-copy h2').forEach(function(h){
      var chs = splitChars(h);
      gsap.set(chs, {autoAlpha:0});
      ScrollTrigger.create({
        trigger:h, start:'top 88%', once:true,
        onEnter:function(){ decode(chs, 22); }
      });
    });

    /* ghost parallax type */
    qa('.ghost').forEach(function(g){
      gsap.fromTo(g, {xPercent:10}, {xPercent:-16, ease:'none',
        scrollTrigger:{trigger:g.parentElement, start:'top bottom', end:'bottom top', scrub:true}});
    });

    /* statement — pinned scene, scrubbed word ignition */
    (function(){
      var el = q('#statementText'); if(!el) return;
      (function wrap(node){
        Array.prototype.slice.call(node.childNodes).forEach(function(n){
          if(n.nodeType === 3){
            var frag = document.createDocumentFragment();
            n.textContent.split(/(\s+)/).forEach(function(part){
              if(!part) return;
              if(/^\s+$/.test(part)){ frag.appendChild(document.createTextNode(part)); return; }
              var s = document.createElement('span'); s.className = 'w'; s.textContent = part;
              frag.appendChild(s);
            });
            node.replaceChild(frag, n);
          }
        });
      })(el);
      var mm0 = gsap.matchMedia();
      mm0.add('(min-width: 981px)', function(){
        var tl = gsap.timeline({
          scrollTrigger:{trigger:'#statement', start:'top top', end:'+=65%', scrub:.3, pin:true, anticipatePin:1}
        });
        tl.fromTo(el, {scale:.96, y:30}, {scale:1, y:0, ease:'none', duration:.3}, 0);
        tl.to('#statementText .w', {color:'#ededed', stagger:.05, ease:'none'}, 0);
      });
      mm0.add('(max-width: 980px)', function(){
        gsap.to('#statementText .w', {
          color:'#ededed', stagger:.06, ease:'none',
          scrollTrigger:{trigger:'#statement', start:'top 78%', end:'bottom 62%', scrub:.5}
        });
      });
    })();

    /* reveal batches */
    ScrollTrigger.batch('.reveal', {
      start:'top 90%', once:true,
      onEnter:function(batch){
        gsap.to(batch, {autoAlpha:1, y:0, duration:1.05, ease:'power3.out', stagger:.09});
      }
    });

    /* ide window wipe-in */
    gsap.from('.ide', {clipPath:'inset(0% 0% 100% 0%)', duration:1.2, ease:'power4.inOut',
      scrollTrigger:{trigger:'.ide', start:'top 82%', once:true}});

    /* horizontal work gallery (desktop) — native overflow scroll.
       deliberately NOT pinned/scrubbed: pinning hijacked ~2700px of vertical
       scroll and stranded the section in half-scrolled states. native scrollLeft
       is 1:1 with input, so it can never desync from where the user is. */
    var mm = gsap.matchMedia();
    mm.add('(min-width: 981px)', function(){
      var wrap = q('#hwrap'), cards = qa('.hcard');
      q('#hTotal').textContent = String(cards.length).padStart(2,'0');
      var hCurEl = q('#hCur'), lastIdx = 0;

      function maxScroll(){ return Math.max(0, wrap.scrollWidth - wrap.clientWidth); }
      function sync(){
        var m = maxScroll();
        var p = m > 0 ? wrap.scrollLeft/m : 0;
        var idx = clamp(Math.round(p*(cards.length-1)) + 1, 1, cards.length);
        if(idx !== lastIdx){ lastIdx = idx; hCurEl.textContent = String(idx).padStart(2,'0'); }
      }
      wrap.addEventListener('scroll', sync, {passive:true});
      sync();

      /* vertical wheel pans the rail, but releases the page at either end so the
         user is never trapped in the section */
      wrap.addEventListener('wheel', function(e){
        if(Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;   // genuine horizontal intent
        var m = maxScroll(); if(m <= 0) return;
        var cur = wrap.scrollLeft;
        /* only hand the page back once the rail is *exactly* at a bound — clamping
           rather than overshoot-and-release is what stops it stranding mid-card */
        if((e.deltaY > 0 && cur >= m - 1) || (e.deltaY < 0 && cur <= 0)) return;
        e.preventDefault();
        e.stopPropagation();            // keep lenis from scrolling the page too
        wrap.scrollLeft = Math.max(0, Math.min(m, cur + e.deltaY));
      }, {passive:false});

      /* drag to pan */
      var down = false, startX = 0, startL = 0, moved = 0;
      wrap.addEventListener('pointerdown', function(e){
        down = true; moved = 0; startX = e.clientX; startL = wrap.scrollLeft;
        wrap.classList.add('dragging');
        try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
      });
      wrap.addEventListener('pointermove', function(e){
        if(!down) return;
        var dx = e.clientX - startX;
        moved += Math.abs(dx);
        wrap.scrollLeft = startL - dx;
      });
      function release(e){
        if(!down) return;
        down = false; wrap.classList.remove('dragging');
        try{ wrap.releasePointerCapture(e.pointerId); }catch(_){}
      }
      wrap.addEventListener('pointerup', release);
      wrap.addEventListener('pointercancel', release);
      wrap.addEventListener('click', function(e){
        if(moved > 6){ e.preventDefault(); e.stopPropagation(); moved = 0; }
      }, true);

      /* IntersectionObserver rather than a ScrollTrigger: it fires immediately for
         cards already on screen, so landing on this section directly (deep link,
         reload part-way down) can never leave the whole gallery invisible */
      gsap.set(cards, {autoAlpha:0, y:34});
      var cio = new IntersectionObserver(function(entries){
        var hit = entries.filter(function(e){ return e.isIntersecting; })
                         .map(function(e){ cio.unobserve(e.target); return e.target; });
        if(hit.length) gsap.to(hit, {autoAlpha:1, y:0, duration:.9, ease:'power3.out', stagger:.07});
      }, {threshold:.08});
      cards.forEach(function(c){ cio.observe(c); });

      /* belt and braces: a blank "selected work" section is the worst possible
         failure here, so force anything on screen visible if the observer hasn't */
      var net = setTimeout(function(){
        cards.forEach(function(c){
          var r = c.getBoundingClientRect();
          if(getComputedStyle(c).visibility === 'hidden' && r.right > 0 && r.left < innerWidth){
            cio.unobserve(c);
            gsap.set(c, {autoAlpha:1, y:0});
          }
        });
      }, 2600);

      return function(){ clearTimeout(net); cio.disconnect(); gsap.set(cards, {clearProps:'all'}); };
    });
    mm.add('(max-width: 980px)', function(){
      gsap.set('.hcard', {autoAlpha:0, y:40});
      ScrollTrigger.batch('.hcard', {
        start:'top 92%', once:true,
        onEnter:function(b){ gsap.to(b, {autoAlpha:1, y:0, duration:.9, ease:'power3.out', stagger:.08}); }
      });
    });

    /* velocity marquee */
    (function(){
      var track = q('#marqueeTrack'); if(!track) return;
      var x = 0, base = .55, boost = 0, visible = true;
      new IntersectionObserver(function(es){
        es.forEach(function(e){ visible = e.isIntersecting; });
      }, {threshold:0}).observe(track.parentElement);
      ScrollTrigger.create({
        onUpdate:function(self){
          boost = clamp(self.getVelocity()/220, -14, 14);
        }
      });
      gsap.ticker.add(function(){
        if(!visible) return;
        boost *= .92;
        x -= (base + Math.abs(boost));
        var half = track.scrollWidth/2;
        if(-x >= half) x += half;
        track.style.transform = 'translateX(' + x + 'px) skewX(' + (boost*-.35) + 'deg)';
      });
    })();

    /* velocity skew on content grids */
    (function(){
      var targets = qa('.bento, .repo-list, .clients');
      if(!targets.length) return;
      var v = 0, sk = 0, applied = 0, resting = true;
      ScrollTrigger.create({ onUpdate:function(self){ v = self.getVelocity(); } });
      gsap.ticker.add(function(){
        v *= .9;
        var target = clamp(v/900, -1.4, 1.4);
        sk += (target - sk)*.12;
        var i;
        if(Math.abs(sk) > .01){
          /* skewing these grids repaints large text subtrees, so only push a value
             when it moved enough to actually be visible */
          var qz = Math.round(sk*20)/20;
          if(qz === applied) return;
          applied = qz; resting = false;
          for(i = 0; i < targets.length; i++) gsap.set(targets[i], {skewY:qz});
        } else if(!resting){
          resting = true; sk = 0; applied = 0;
          for(i = 0; i < targets.length; i++) gsap.set(targets[i], {skewY:0});
        }
      });
    })();

    /* capability rows — hover scramble */
    qa('.cap-row').forEach(function(row){
      var nameEl = q('.cap-name', row);
      var chs = splitChars(nameEl);
      var busy = false;
      row.addEventListener('mouseenter', function(){
        if(busy) return; busy = true;
        decode(chs, 14, false);
        setTimeout(function(){ busy = false; }, chs.length*14 + 400);
      });
    });

    /* custom cursor */
    if (fine) {
      document.body.classList.add('cur');
      var dot = q('#curDot'), ring = q('#curRing');
      var dx = innerWidth/2, dy = innerHeight/2, rx = dx, ry = dy, tx = dx, ty = dy, shown = false;
      addEventListener('mousemove', function(e){
        tx = e.clientX; ty = e.clientY;
        if(!shown){ shown = true; gsap.to([dot,ring], {opacity:1, duration:.3}); }
      }, {passive:true});
      gsap.ticker.add(function(){
        if(Math.abs(tx-dx) + Math.abs(ty-dy) + Math.abs(tx-rx) + Math.abs(ty-ry) < .08) return; // cursor settled
        dx += (tx-dx)*.55; dy += (ty-dy)*.55;
        rx += (tx-rx)*.14; ry += (ty-ry)*.14;
        dot.style.transform = 'translate(' + dx + 'px,' + dy + 'px) translate(-50%,-50%)';
        ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
      });
      qa('a, button, .cap-row, .client, .tag, .hwrap').forEach(function(el){
        el.addEventListener('mouseenter', function(){ document.body.classList.add('cur-hover'); });
        el.addEventListener('mouseleave', function(){ document.body.classList.remove('cur-hover'); });
      });
    }

    /* magnetic buttons */
    if (fine) {
      qa('.btn, .nav-cta').forEach(function(b){
        b.addEventListener('mousemove', function(e){
          var r = b.getBoundingClientRect();
          gsap.to(b, {x:(e.clientX - r.left - r.width/2)*.22, y:(e.clientY - r.top - r.height/2)*.34, duration:.4, ease:'power3.out'});
        });
        b.addEventListener('mouseleave', function(){
          gsap.to(b, {x:0, y:0, duration:.7, ease:'elastic.out(1,.45)'});
        });
      });
    }

    addEventListener('load', function(){ ScrollTrigger.refresh(); });

  } else {
    /* fallback: simple reveals, everything visible */
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    },{threshold:.12, rootMargin:'0px 0px -30px 0px'});
    qa('.reveal').forEach(function(el){ io.observe(el); });
    var st = q('#statementText'); if(st) st.style.color = '#ededed';
  }
})();
