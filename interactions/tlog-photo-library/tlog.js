
  (function() {
    // Testing embeds keep viewer history local so hidden photos cannot consume
    // the host page's Back button. Standalone library history stays unchanged.
    var embedded = new URLSearchParams(location.search).get('embed') === 'testing';
    var root = document.getElementById('Tlog');
    var stream = document.getElementById('TlStream');
    var dataEl = document.getElementById('TlogData');
    if (!root || !stream || !dataEl) return;

    // Entries come in batches of up to 250: the first is in the page, the rest are fetched together (Shopify doesn't
    // hand them over in date order, so every batch is needed before the roll can be laid out)
    var first = {};
    try { first = JSON.parse(dataEl.textContent); } catch (e) {}
    var batches = [];
    for (var n = 2; n <= (first.pages || 1); n++) batches.push(fetchBatch(n));
    Promise.all(batches).then(function(rest) { tlog([].concat.apply(first.entries || [], rest)); });
    function fetchBatch(n) {
      var url = new URL(location.href);
      url.hash = '';
      url.searchParams.set('view', 'tlog-data');
      url.searchParams.set('page', n);
      return fetch(url.toString(), { credentials: 'same-origin' })
        .then(function(res) { return res.text(); })
        .then(function(body) { return JSON.parse(body).entries || []; })
        .catch(function() { return []; });
    }

    function tlog(entries) {
      var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var subEl = document.getElementById('TlSub');
      var topBar = document.getElementById('TlTop');
      var bar = document.getElementById('TlBar');
      var switches = [].slice.call(document.querySelectorAll('.tl-seg__btn'));
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var phone = window.matchMedia('(max-width: 768px)');

      entries = entries.filter(function(entry) { return entry.photos && entry.photos.length; });
      // A camera roll: oldest first, newest at the bottom; entries on the same day in the order they were made (each
      // entry's ID number only ever goes up), so the latest added lands last
      entries.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0); });

      var photos = [];
      entries.forEach(function(entry) {
        var parts = entry.date.split('-');
        var day = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        entry.year = parts[0];
        entry.month = parts[0] + '-' + parts[1];
        entry.monthName = MONTHS[+parts[1] - 1];
        entry.short = entry.monthName.slice(0, 3) + ' ' + (+parts[2]) + ', ' + parts[0];
        entry.long = entry.monthName + ' ' + (+parts[2]) + ', ' + parts[0];
        entry.weekday = DAYS[day.getDay()];
        entry.photos.forEach(function(photo) {
          // Every size from the one address the data carries
          var base = photo.src.replace(/&width=\d+/, '');
          photo.tiny = base + '&width=120';
          photo.thumb = base + '&width=400';
          photo.thumb2x = base + '&width=800';
          photo.mid = base + '&width=1000';
          photo.full = base + '&width=2000';
          photo.save = photo.type === 'video' ? photo.video : base + '&width=3000';
          photo.alt = photo.alt || '';
          photo.entry = entry;
          photo.index = photos.length;
          photos.push(photo);
        });
      });

      if (!photos.length) {
        stream.innerHTML = '<p class="tl-empty">No Photos</p>';
        bar.style.display = 'none';
        return;
      }

      // Favourites are this visitor's own, kept on their device
      var likes = {};
      try { likes = JSON.parse(localStorage.getItem('fugazi-tlog-likes') || '{}') || {}; } catch (e) {}
      function saveLikes() {
        try { localStorage.setItem('fugazi-tlog-likes', JSON.stringify(likes)); } catch (e) {}
      }
      // Focus only follows along for keyboard users; after a tap, Safari would ring the button it lands on
      var keyed = false;
      document.addEventListener('keydown', function() { keyed = true; }, true);
      document.addEventListener('pointerdown', function() { keyed = false; }, true);
      function keyFocus(el) { if (keyed) el.focus({ preventScroll: true }); }
      function plural(n, word) { return n.toLocaleString() + ' ' + word + (n === 1 ? '' : 's'); }
      // 0:14, 1:02:09
      function clock(seconds) {
        var h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
        return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }
      function text(tag, className, value) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        el.textContent = value;
        return el;
      }
      function makeImg(photo, sizes) {
        var img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = photo.thumb;
        img.srcset = photo.thumb + ' 400w, ' + photo.thumb2x + ' 800w';
        img.sizes = sizes;
        if (img.complete) img.classList.add('is-loaded');
        else img.addEventListener('load', function() { img.classList.add('is-loaded'); });
        return img;
      }
      function heart(el) {
        if (el.querySelector('.tl-tile__heart')) return;
        el.insertAdjacentHTML('beforeend', '<svg class="tl-tile__heart" aria-hidden="true"><use href="#tl-heart"/></svg>');
      }
      function tile(photo) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'tl-tile';
        el.setAttribute('aria-label', (photo.alt ? photo.alt + ', ' : '') + photo.entry.short);
        el.dataset.index = photo.index;
        el.dataset.month = photo.entry.month;
        el.appendChild(makeImg(photo, '(max-width: 768px) 34vw, 13vw'));
        if (photo.type === 'video') el.appendChild(text('span', 'tl-tile__dur', clock(photo.duration || 0)));
        if (likes[photo.id]) heart(el);
        if (favourites && !likes[photo.id]) el.hidden = true;
        return el;
      }

      // Grid sizes to pinch between, per screen
      var SIZES = { phone: [1, 3, 5], wide: [4, 6, 8, 12] };
      var cols = { phone: 3, wide: 6 };
      try {
        var savedCols = JSON.parse(localStorage.getItem('fugazi-tlog-cols') || 'null');
        if (savedCols && savedCols.phone && savedCols.wide) cols = savedCols;
      } catch (e) {}
      function screenKey() { return phone.matches ? 'phone' : 'wide'; }

      var favourites = false;
      // Endless, like the shop: the grid starts with the newest few hundred photos (where the roll opens) and adds older
      // ones above, a batch at a time, as you scroll up. Batches start at multiples of CHUNK from the oldest photo, and
      // CHUNK divides by every grid size, so adding one never shifts the photos already there.
      var CHUNK = 240, shownFrom = 0, watcher = null;
      function growTo(i) {
        var grid = stream.querySelector('.tl-all');
        if (!grid || i >= shownFrom) return;
        var start = Math.max(0, Math.floor(i / CHUNK) * CHUNK);
        var batch = document.createDocumentFragment();
        for (var k = start; k < shownFrom; k++) batch.appendChild(tile(photos[k]));
        // Keep what's on screen where it is while the page grows above it: some browsers do that themselves, so move
        // only by however far the photos already there actually shifted
        var ref = grid.firstChild;
        var before = ref.getBoundingClientRect().top;
        grid.insertBefore(batch, grid.firstChild);
        shownFrom = start;
        window.scrollBy(0, ref.getBoundingClientRect().top - before);
      }
      var builders = {
        // Favorites only hides tiles, so switching never reloads them
        all: function() {
          var wrap = document.createElement('div');
          var edge = document.createElement('div');
          edge.style.height = '1px';
          wrap.appendChild(edge);
          var grid = document.createElement('div');
          grid.className = 'tl-grid tl-all';
          grid.style.setProperty('--tl-cols', cols[screenKey()]);
          shownFrom = Math.max(0, (Math.ceil(photos.length / CHUNK) - 2) * CHUNK);
          for (var k = shownFrom; k < photos.length; k++) grid.appendChild(tile(photos[k]));
          wrap.appendChild(grid);
          if (watcher) watcher.disconnect();
          if (window.IntersectionObserver) {
            watcher = new IntersectionObserver(function(seen) {
              if (seen[0].isIntersecting && shownFrom > 0) growTo(shownFrom - 1);
            }, { rootMargin: '1500px 0px 0px 0px' });
            watcher.observe(edge);
          } else {
            shownFrom = photos.length;
            growTo(0);
          }
          var count = document.createElement('p');
          count.className = 'tl-count';
          count.appendChild(document.createTextNode(''));
          count.appendChild(text('span', '', 'Updated ' + photos[photos.length - 1].entry.short));
          wrap.appendChild(count);
          var empty = document.createElement('p');
          empty.className = 'tl-empty';
          empty.appendChild(document.createTextNode(''));
          empty.appendChild(text('span', '', 'Tap ♡ on a photo to keep it here.'));
          wrap.appendChild(empty);
          return wrap;
        },
        months: function() { return cards('month', 'tl-months', function(g) { return [g.cover.entry.monthName, g.cover.entry.year]; }, 'all'); },
        years: function() { return cards('year', 'tl-years', function(g) { return [g.key, plural(g.count, 'Photo')]; }, 'months'); }
      };

      // Months and years: the newest photo of each as its cover; tapping one opens that stretch one level down
      function cards(key, className, words, next) {
        var wrap = document.createElement('div');
        var list = document.createElement('div');
        list.className = 'tl-cards ' + className;
        var groups = [];
        photos.forEach(function(photo) {
          var group = groups[groups.length - 1];
          if (!group || group.key !== photo.entry[key]) groups.push(group = { key: photo.entry[key], count: 0 });
          group.cover = photo;
          group.count++;
        });
        groups.forEach(function(group) {
          var card = document.createElement('button');
          card.type = 'button';
          card.className = 'tl-card';
          card.dataset.key = group.key;
          card.dataset.month = group.cover.entry.month;
          var cover = document.createElement('span');
          cover.className = 'tl-tile';
          cover.appendChild(makeImg(group.cover, '(max-width: 768px) 100vw, 40vw'));
          card.appendChild(cover);
          var label = words(group);
          var textWrap = document.createElement('span');
          textWrap.className = 'tl-card__text';
          textWrap.appendChild(text('span', 'tl-card__title', label[0]));
          textWrap.appendChild(text('span', 'tl-card__sub', label[1]));
          card.appendChild(textWrap);
          card.setAttribute('aria-label', label.join(', '));
          card.addEventListener('click', function() { show(next, group.key); });
          list.appendChild(card);
        });
        wrap.appendChild(list);
        return wrap;
      }

      // The date under Tlog follows the photos under it, and the type turns white while photos are behind it
      var HEAD = 64;
      function updateSub() {
        var line = topBar.getBoundingClientRect().top + HEAD;
        var items = stream.querySelectorAll(current === 'all' ? '.tl-tile' : '.tl-card');
        var hit = null;
        for (var i = 0; i < items.length; i++) {
          if (items[i].getBoundingClientRect().bottom > line) { hit = items[i]; break; }
        }
        topBar.classList.toggle('is-over', !!hit && hit.getBoundingClientRect().top < line);
        if (favourites && current === 'all') { subEl.textContent = 'Favorites'; return; }
        if (current === 'years') { subEl.textContent = photos[0].entry.year + ' – ' + photos[photos.length - 1].entry.year; return; }
        if (!hit) hit = items[items.length - 1];
        if (!hit) { subEl.textContent = ''; return; }
        if (current === 'months') {
          subEl.textContent = hit.dataset.month.split('-')[0];
          return;
        }
        subEl.textContent = photos[+hit.dataset.index].entry.short;
      }
      var ticking = false;
      window.addEventListener('scroll', function() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function() { ticking = false; updateSub(); });
      }, { passive: true });

      // Like Photos: the newest row sits just above the bottom buttons, with the photo count tucked under them (scroll
      // on to see it). Months and Years go to the very end.
      function toBottom(smooth) {
        var top = document.documentElement.scrollHeight;
        var tiles = current === 'all' ? stream.querySelectorAll('.tl-all > .tl-tile:not([hidden])') : [];
        var lastTile = tiles[tiles.length - 1];
        var barEl = document.getElementById('TlBar');
        if (lastTile && barEl) {
          top = lastTile.getBoundingClientRect().bottom + window.pageYOffset - (barEl.getBoundingClientRect().top - 8);
        }
        window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduced ? 'smooth' : 'auto' });
      }

      function filter() {
        var grid = stream.querySelector('.tl-all');
        if (!grid) return;
        // Counted from all the photos, not just the tiles made so far; Favorites makes sure its oldest one is there
        var n = 0, clips = 0, oldest = -1;
        photos.forEach(function(photo, i) {
          if (favourites && !likes[photo.id]) return;
          n++;
          if (photo.type === 'video') clips++;
          if (oldest < 0) oldest = i;
        });
        if (favourites && oldest >= 0) growTo(oldest);
        [].forEach.call(grid.children, function(el) {
          el.hidden = favourites && !likes[photos[+el.dataset.index].id];
        });
        var count = stream.querySelector('.tl-count');
        var empty = stream.querySelector('.tl-empty');
        count.hidden = !n;
        // Like the phone: 40 Photos, 2 Videos
        count.firstChild.textContent = [n - clips ? plural(n - clips, 'Photo') : '', clips ? plural(clips, 'Video') : ''].filter(Boolean).join(', ');
        count.lastChild.hidden = favourites;
        empty.hidden = !!n;
        empty.firstChild.textContent = 'No Favorites';
      }
      // A quick fade when what's shown changes, so it reads as one page changing rather than a new one loading
      function settleIn() {
        if (!reduced && stream.animate) stream.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      }

      var current = null;
      function show(view, focusKey) {
        if (!builders[view]) view = 'all';
        current = view;
        stream.innerHTML = '';
        stream.appendChild(builders[view]());
        if (view === 'all') filter();
        switches.forEach(function(button) { button.setAttribute('aria-pressed', button.dataset.view === view ? 'true' : 'false'); });
        try { localStorage.setItem('fugazi-tlog-view', view); } catch (e) {}
        var target = null;
        if (focusKey && view === 'all') {
          for (var k = 0; k < photos.length; k++) {
            if (photos[k].entry.month === focusKey) { growTo(k); break; }
          }
        }
        if (focusKey) {
          target = view === 'all'
            ? stream.querySelector('.tl-tile[data-month="' + focusKey + '"]')
            : stream.querySelector('.tl-card[data-key^="' + focusKey + '-"]');
        }
        if (target) {
          window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - HEAD - 20, behavior: 'auto' });
        } else {
          toBottom();
        }
        updateSub();
      }
      switches.forEach(function(button) {
        button.addEventListener('click', function() {
          if (button.dataset.view === current) toBottom(true);
          else show(button.dataset.view);
        });
      });
      // Library button: the pill grows out of it into Library and Favorites tabs; Library shrinks it back to
      // Years / Months / All. The photos stay put; only what's shown changes.
      var tabs = [].slice.call(document.querySelectorAll('.tl-tab'));
      var tabPill = document.querySelector('.tl-tabs');
      var segPill = document.querySelector('.tl-seg');
      var newestBtn = document.getElementById('TlNewest');
      var homeBtn = document.getElementById('TlHome');
      var MORPH = { duration: 420, easing: 'cubic-bezier(.3, .9, .3, 1)' };
      function setTab(tab) {
        var was = favourites;
        favourites = tab === 'favorites';
        tabs.forEach(function(button) { button.setAttribute('aria-pressed', button.dataset.tab === tab ? 'true' : 'false'); });
        if (current !== 'all') { show('all'); settleIn(); return; }
        if (was === favourites) return;
        filter();
        toBottom();
        updateSub();
        settleIn();
      }
      function morph(toTabs) {
        var circle = newestBtn.getBoundingClientRect();
        var homeFrom = homeBtn.getBoundingClientRect();
        bar.classList.toggle('is-tabs', toTabs);
        if (reduced || !tabPill.animate) return;
        var homeTo = homeBtn.getBoundingClientRect();
        homeBtn.animate([{ transform: 'translateX(' + (homeFrom.left - homeTo.left) + 'px)' }, { transform: 'none' }], MORPH);
        if (toTabs) {
          // The tabs pill opens out of the Library button
          var t = tabPill.getBoundingClientRect();
          tabPill.animate([
            { clipPath: 'inset(' + (circle.top - t.top) + 'px ' + (t.right - circle.right) + 'px ' + (t.bottom - circle.bottom) + 'px ' + (circle.left - t.left) + 'px round 999px)' },
            { clipPath: 'inset(0 0 0 0 round 999px)' }
          ], MORPH);
          tabs.forEach(function(button, i) {
            button.animate([{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 60 + i * 50, easing: MORPH.easing, fill: 'backwards' });
          });
        } else {
          // The views pill opens back out to the right of the Library button, which pops back in
          var s = segPill.getBoundingClientRect();
          segPill.animate([
            { clipPath: 'inset(0 ' + (s.width - s.height) + 'px 0 0 round 999px)', opacity: .4 },
            { clipPath: 'inset(0 0 0 0 round 999px)', opacity: 1 }
          ], MORPH);
          newestBtn.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: MORPH.easing });
        }
      }
      newestBtn.addEventListener('click', function() {
        morph(true);
        setTab('library');
        keyFocus(tabs[0]);
      });
      tabs.forEach(function(button) {
        button.addEventListener('click', function() {
          if (button.dataset.tab === 'library') {
            morph(false);
            setTab('library');
            keyFocus(newestBtn);
          } else {
            setTab('favorites');
          }
        });
      });
      stream.addEventListener('click', function(evt) {
        var el = evt.target.closest('.tl-tile[data-index]');
        if (el) open(+el.dataset.index, el);
      });

      // Pinch the grid (touch, or a trackpad pinch) to change its size, keeping the photo in the middle in place
      function setCols(step) {
        var grid = stream.querySelector('.tl-all');
        if (!grid) return;
        var key = screenKey();
        var list = SIZES[key];
        var at = list.indexOf(cols[key]);
        if (at < 0) at = 1;
        var next = Math.max(0, Math.min(list.length - 1, at + step));
        if (next === at) return;
        var middle = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        var anchor = middle && middle.closest && middle.closest('.tl-tile');
        cols[key] = list[next];
        grid.style.setProperty('--tl-cols', cols[key]);
        try { localStorage.setItem('fugazi-tlog-cols', JSON.stringify(cols)); } catch (e) {}
        if (anchor) anchor.scrollIntoView({ block: 'center' });
        updateSub();
      }
      var pinch = null;
      function spread(evt) {
        var a = evt.touches[0], b = evt.touches[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      }
      stream.addEventListener('touchstart', function(evt) {
        if (evt.touches.length === 2 && current === 'all') pinch = spread(evt);
      }, { passive: true });
      stream.addEventListener('touchmove', function(evt) {
        if (pinch === null || evt.touches.length !== 2) return;
        evt.preventDefault();
        var ratio = spread(evt) / pinch;
        if (ratio > 1.3) { setCols(-1); pinch = spread(evt); }
        else if (ratio < .77) { setCols(1); pinch = spread(evt); }
      }, { passive: false });
      stream.addEventListener('touchend', function(evt) {
        if (evt.touches.length < 2) pinch = null;
      });
      var wheelSum = 0, wheelTimer = null;
      stream.addEventListener('wheel', function(evt) {
        if (!evt.ctrlKey || current !== 'all') return;
        evt.preventDefault();
        wheelSum += evt.deltaY;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function() { wheelSum = 0; }, 200);
        if (wheelSum < -40) { setCols(-1); wheelSum = 0; }
        else if (wheelSum > 40) { setCols(1); wheelSum = 0; }
      }, { passive: false });

      // Viewer
      var viewer = document.getElementById('TlViewer');
      var pages = document.getElementById('TlPages');
      var strip = document.getElementById('TlStrip');
      var prevBtn = document.getElementById('TlPrev');
      var nextBtn = document.getElementById('TlNext');
      var titleEl = document.getElementById('TlTitle');
      var whenEl = document.getElementById('TlWhen');
      var likeBtn = document.getElementById('TlLike');
      var infoBtn = document.getElementById('TlInfoBtn');
      var info = document.getElementById('TlInfo');
      var moreBtn = document.getElementById('TlMore');
      var menu = document.getElementById('TlMenu');
      var toast = document.getElementById('TlToast');
      var at = -1, pushed = false, toastTimer = null;

      // One page and one thumbnail per photo; their images load as they come near
      var pageImgs = [], thumbs = [];
      photos.forEach(function(photo) {
        var page = document.createElement('div');
        page.className = 'tl-page';
        var img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        img.style.setProperty('--r', photo.w && photo.h ? photo.w / photo.h : 1);
        page.appendChild(img);
        pages.appendChild(page);
        pageImgs.push(img);
        var thumb = document.createElement('button');
        thumb.type = 'button';
        thumb.className = 'tl-strip__item';
        thumb.tabIndex = -1;
        thumb.dataset.index = photo.index;
        strip.appendChild(thumb);
        thumbs.push(thumb);
      });
      // The viewer runs through the photos it was opened from: the whole roll, or just Favorites. Photos outside that
      // set, and their thumbnails, are taken out, so both scrollers count only these. order[pos] is a photo's index.
      var order = [], posOf = {};
      function setOrder(list) {
        order = list;
        posOf = {};
        list.forEach(function(i, pos) { posOf[i] = pos; });
        photos.forEach(function(photo, i) {
          var shown = posOf[i] !== undefined;
          pageImgs[i].parentNode.style.display = shown ? '' : 'none';
          thumbs[i].style.display = shown ? '' : 'none';
        });
      }
      // Load the photos around photo i (radius 0: just i, so a zoom isn't held up decoding its neighbours)
      function near(i, radius) {
        if (radius === undefined) radius = 2;
        var p = posOf[i];
        for (var q = p - radius; q <= p + radius; q++) {
          var n = order[q];
          var img = pageImgs[n];
          if (img && !img.getAttribute('src')) {
            // The grid's thumbnail (the very file already on screen) shows at once, under the full photo while it loads
            var shown = stream.querySelector('.tl-tile[data-index="' + n + '"] img');
            img.style.backgroundImage = 'url("' + ((shown && shown.currentSrc) || photos[n].thumb2x) + '")';
            img.addEventListener('load', function() { this.style.backgroundImage = ''; }, { once: true });
            img.sizes = '100vw';
            img.srcset = photos[n].mid + ' 1000w, ' + photos[n].full + ' 2000w';
            img.src = photos[n].full;
            img.alt = photos[n].alt;
          }
        }
        if (!radius) return;
        for (var r = p - 24; r <= p + 24; r++) {
          var t = order[r];
          if (thumbs[t] && !thumbs[t].style.backgroundImage) thumbs[t].style.backgroundImage = 'url("' + photos[t].tiny + '")';
        }
      }

      // The photos and the strip are two native scrollers kept in step. Swiping the photos glides the strip along with
      // them; scrubbing the strip swaps the photo straight to the one at its centre, with no slide.
      // The photo at position n sits at n × (page width + gap); its thumbnail at n × (thumb width + gap).
      var pageGap = parseFloat(getComputedStyle(pages).columnGap) || 0;
      function pagePitch() { return pages.clientWidth + pageGap; }
      function thumbPitch() { return order.length > 1 ? thumbs[order[1]].offsetLeft - thumbs[order[0]].offsetLeft : 26; }
      function atPos() { return posOf[at] || 0; }
      var driver = 'pages';
      ['pointerdown', 'touchstart', 'wheel'].forEach(function(type) {
        pages.addEventListener(type, function() {
          driver = 'pages';
          if (type !== 'pointerdown') pages.classList.remove('is-free');
        }, { passive: true });
        strip.addEventListener(type, function() {
          driver = 'strip';
          pages.classList.add('is-free');
        }, { passive: true });
      });
      pages.addEventListener('scroll', function() {
        var p = pages.scrollLeft / pagePitch();
        if (driver === 'pages') strip.scrollLeft = p * thumbPitch();
        setCurrent(order[Math.max(0, Math.min(order.length - 1, Math.round(p)))]);
      }, { passive: true });
      var stripSettle = null;
      function jumpTo(pos) {
        pos = Math.max(0, Math.min(order.length - 1, pos));
        near(order[pos]);
        pages.scrollLeft = pos * pagePitch();
        setCurrent(order[pos]);
      }
      // Glide the strip to centre the current thumbnail; while it glides, neither scroller leads the other
      function centreStrip() {
        driver = 'auto';
        strip.scrollTo({ left: atPos() * thumbPitch(), behavior: reduced ? 'auto' : 'smooth' });
      }
      strip.addEventListener('scroll', function() {
        if (driver !== 'strip') return;
        jumpTo(Math.round(strip.scrollLeft / thumbPitch()));
        // Once the strip stops, it settles with the current thumbnail at its centre
        clearTimeout(stripSettle);
        stripSettle = setTimeout(centreStrip, 120);
      }, { passive: true });
      function goTo(pos, smooth) {
        pos = Math.max(0, Math.min(order.length - 1, pos));
        driver = 'pages';
        pages.classList.remove('is-free');
        near(order[pos]);
        pages.scrollTo({ left: pos * pagePitch(), behavior: smooth && !reduced ? 'smooth' : 'auto' });
      }
      strip.addEventListener('click', function(evt) {
        var thumb = evt.target.closest('.tl-strip__item');
        if (!thumb) return;
        clearTimeout(stripSettle);
        pages.classList.add('is-free');
        jumpTo(posOf[+thumb.dataset.index]);
        centreStrip();
      });
      prevBtn.addEventListener('click', function() { goTo(atPos() - 1, true); });
      nextBtn.addEventListener('click', function() { goTo(atPos() + 1, true); });
      window.addEventListener('resize', function() {
        if (!viewer.classList.contains('is-open')) return;
        pages.scrollLeft = atPos() * pagePitch();
        strip.scrollLeft = atPos() * thumbPitch();
      });

      // The details, laid out like the phone's: caption, day and date, file name, then a card with the photo itself
      function fillInfo(photo) {
        info.innerHTML = '';
        if (photo.entry.note) info.appendChild(text('p', 'tl-sheet__caption', photo.entry.note));
        var body = document.createElement('div');
        body.className = 'tl-sheet__body';
        body.appendChild(text('p', 'tl-sheet__when', photo.entry.weekday + ' • ' + photo.entry.short));
        if (photo.entry.place) body.appendChild(text('p', 'tl-sheet__place', photo.entry.place));
        // The file name, without the extension or the code Shopify adds to a repeated name
        var name = (photo.name || '').replace(/\.[^.]+$/, '').replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '');
        if (name) body.appendChild(text('p', 'tl-sheet__file', name));
        var card = document.createElement('div');
        card.className = 'tl-sheet__card';
        var head = document.createElement('div');
        head.className = 'tl-sheet__head';
        head.appendChild(text('span', '', (photo.type === 'video' ? 'Video ' : 'Photo ') + (photo.index + 1) + ' of ' + photos.length));
        var ext = photo.type === 'video' ? 'mp4' : ((photo.name || '').match(/\.([a-z0-9]+)$/i) || [])[1];
        if (ext) head.appendChild(text('span', 'tl-sheet__chip', ext.toUpperCase()));
        card.appendChild(head);
        if (photo.type === 'video') {
          card.appendChild(text('p', 'tl-sheet__spec', (photo.w && photo.h ? photo.w + ' × ' + photo.h + ' • ' : '') + clock(photo.duration || 0)));
        } else if (photo.w && photo.h) {
          card.appendChild(text('p', 'tl-sheet__spec', Math.max(1, Math.round(photo.w * photo.h / 1e6)) + ' MP • ' + photo.w + ' × ' + photo.h));
        }
        body.appendChild(card);
        info.appendChild(body);
      }
      function setInfo(shown) {
        viewer.classList.toggle('is-info', shown);
        if (shown) viewer.classList.remove('is-bare');
        infoBtn.setAttribute('aria-pressed', shown ? 'true' : 'false');
        infoBtn.querySelector('use').setAttribute('href', shown ? '#tl-info-fill' : '#tl-info');
      }
      function paintLike(photo) {
        var liked = !!likes[photo.id];
        likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
        likeBtn.querySelector('use').setAttribute('href', liked ? '#tl-heart' : '#tl-heart-line');
      }
      // A light tick as each thumbnail passes the centre while the strip is dragged: vibration where the browser has it
      // (Android); on an iPhone, toggling a hidden switch control makes Safari (iOS 18 and later) play the system tick
      var tickSwitch = null;
      function tick() {
        if (navigator.vibrate) { try { navigator.vibrate(5); } catch (e) {} return; }
        if (!tickSwitch) {
          tickSwitch = document.createElement('label');
          tickSwitch.setAttribute('aria-hidden', 'true');
          tickSwitch.className = 'tl-tick';
          var input = document.createElement('input');
          input.type = 'checkbox';
          input.setAttribute('switch', '');
          input.tabIndex = -1;
          tickSwitch.appendChild(input);
          document.body.appendChild(tickSwitch);
        }
        tickSwitch.click();
      }

      // Videos: a player laid over the video's still, made the first time it's shown; only the current one plays.
      // Its controls are the glass bar above the strip, like the phone's; sound stays as last set (off to start).
      var player = document.getElementById('TlPlayer');
      var playBtn = document.getElementById('TlPlay');
      var muteBtn = document.getElementById('TlMute');
      var track = document.getElementById('TlTrack');
      var fill = document.getElementById('TlFill');
      var soundOn = false, frame = null;
      function videoAt(i) { return pageImgs[i] && pageImgs[i].parentNode.querySelector('video'); }
      function paintPlayer() {
        var isVideo = !!(photos[at] && photos[at].type === 'video' && viewer.classList.contains('is-open'));
        if (player.hidden === isVideo) {
          player.hidden = !isVideo;
          viewer.style.setProperty('--tl-foot', viewer.querySelector('.tl-viewer__foot').offsetHeight + 'px');
        }
        var v = videoAt(at);
        if (!isVideo || !v) return;
        playBtn.querySelector('use').setAttribute('href', v.paused ? '#tl-play' : '#tl-pause');
        playBtn.setAttribute('aria-label', v.paused ? 'Play' : 'Pause');
        muteBtn.querySelector('use').setAttribute('href', v.muted ? '#tl-muted' : '#tl-sound');
        muteBtn.setAttribute('aria-label', v.muted ? 'Turn sound on' : 'Turn sound off');
        var done = v.duration ? v.currentTime / v.duration * 100 : 0;
        fill.style.width = done + '%';
        track.setAttribute('aria-valuenow', Math.round(done));
      }
      // While it plays, the bar moves every frame
      function follow() {
        paintPlayer();
        var v = videoAt(at);
        frame = v && !v.paused ? requestAnimationFrame(follow) : null;
      }
      playBtn.addEventListener('click', function() {
        var v = videoAt(at);
        if (!v) return;
        if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function() {}); }
        else v.pause();
      });
      muteBtn.addEventListener('click', function() {
        var v = videoAt(at);
        soundOn = !soundOn;
        if (v) v.muted = !soundOn;
        paintPlayer();
      });
      // Drag along the bar to scrub
      var scrubbing = false;
      function scrubTo(evt) {
        var v = videoAt(at);
        if (!v || !v.duration) return;
        var box = track.getBoundingClientRect();
        v.currentTime = Math.max(0, Math.min(1, (evt.clientX - box.left) / box.width)) * v.duration;
        paintPlayer();
      }
      track.addEventListener('pointerdown', function(evt) {
        scrubbing = true;
        try { track.setPointerCapture(evt.pointerId); } catch (e) {}
        scrubTo(evt);
      });
      track.addEventListener('pointermove', function(evt) { if (scrubbing) scrubTo(evt); });
      track.addEventListener('pointerup', function() { scrubbing = false; });
      track.addEventListener('pointercancel', function() { scrubbing = false; });
      function stopVideo(i) {
        var v = videoAt(i);
        if (v) { v.pause(); try { v.currentTime = 0; } catch (e) {} }
      }
      function playCurrent() {
        var photo = photos[at];
        if (!photo || photo.type !== 'video' || !viewer.classList.contains('is-open') || viewer.classList.contains('is-zooming')) return;
        var v = videoAt(at);
        if (!v) {
          v = document.createElement('video');
          v.src = photo.video;
          v.poster = photo.full;
          v.playsInline = true;
          v.setAttribute('playsinline', '');
          v.preload = 'auto';
          v.style.setProperty('--r', photo.w && photo.h ? photo.w / photo.h : 1);
          ['play', 'pause', 'ended', 'loadedmetadata', 'seeked'].forEach(function(type) {
            v.addEventListener(type, function() {
              if (type === 'play' && !frame) follow();
              else paintPlayer();
            });
          });
          pageImgs[at].parentNode.appendChild(v);
        }
        v.muted = !soundOn;
        var playing = v.play();
        if (playing && playing.catch) playing.catch(function() {});
      }

      // The photo in the middle of the screen becomes the current one: its title, its thumbnail, its link
      var prefetchTimer = null;
      function setCurrent(i) {
        if (i === undefined || i === at) return;
        if (driver === 'strip' && at !== -1 && viewer.classList.contains('is-open')) tick();
        if (viewer.classList.contains('is-zoomed')) resetZoom(false);
        stopVideo(at);
        if (thumbs[at]) thumbs[at].classList.remove('is-current');
        at = i;
        var photo = photos[i];
        thumbs[i].classList.add('is-current');
        if (!viewer.classList.contains('is-zooming')) near(i);
        prevBtn.disabled = posOf[i] === 0;
        nextBtn.disabled = posOf[i] === order.length - 1;
        // Like the phone: the place as the title (or the note, if there's no place), otherwise the day
        var heading = photo.entry.place || photo.entry.note;
        titleEl.textContent = heading || photo.entry.weekday;
        whenEl.textContent = heading ? photo.entry.weekday + '  ' + photo.entry.short : photo.entry.long;
        paintLike(photo);
        fillInfo(photo);
        if (pushed && !embedded) history.replaceState({ tlogPhoto: true }, '', '#photo-' + photo.id);
        playCurrent();
        paintPlayer();
        // Get the photo ready to save while it's looked at, so Share opens straight away (videos only when asked: too big)
        clearTimeout(prefetchTimer);
        if (canShareFiles && photo.type !== 'video') prefetchTimer = setTimeout(function() { fileFor(at); }, 500);
      }

      function closeMenu() {
        menu.classList.remove('is-shown');
        moreBtn.setAttribute('aria-expanded', 'false');
      }
      // The zoom: a copy of the photo, laid out once at its full size on screen, is moved and scaled (never resized,
      // so the phone's graphics chip does the work) from its square in the grid to its place, while a clip opens its
      // square crop out to the whole photo. Closing runs it backwards.
      var ZOOM = { duration: 380, easing: 'cubic-bezier(.32, .72, 0, 1)' };
      function fitted(box, ratio) {
        var w = box.width, h = w / ratio;
        if (h > box.height) { h = box.height; w = h * ratio; }
        return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
      }
      function ghost(src, full, tile, opening, done) {
        var el = document.createElement('img');
        el.className = 'tl-ghost';
        el.alt = '';
        el.style.width = full.width + 'px';
        el.style.height = full.height + 'px';
        el.src = src;
        var k = Math.max(tile.width / full.width, tile.height / full.height);
        var cropX = Math.max(0, (full.width - tile.width / k) / 2);
        var cropY = Math.max(0, (full.height - tile.height / k) / 2);
        var small = {
          transform: 'translate3d(' + (tile.left + tile.width / 2 - full.width * k / 2) + 'px, ' + (tile.top + tile.height / 2 - full.height * k / 2) + 'px, 0) scale(' + k + ')',
          clipPath: 'inset(' + cropY + 'px ' + cropX + 'px)'
        };
        var big = {
          transform: 'translate3d(' + full.left + 'px, ' + full.top + 'px, 0) scale(1)',
          clipPath: 'inset(0px 0px)'
        };
        el.style.transform = (opening ? small : big).transform;
        el.style.clipPath = (opening ? small : big).clipPath;
        document.body.appendChild(el);
        var start = function() {
          var anim = el.animate(opening ? [small, big] : [big, small], ZOOM);
          anim.onfinish = anim.oncancel = function() {
            el.style.transform = (opening ? big : small).transform;
            el.style.clipPath = (opening ? big : small).clipPath;
            done(function() { el.remove(); });
          };
        };
        // Start once the image is ready to paint, so the first frames don't stall
        if (el.decode) el.decode().then(start, start);
        else start();
      }
      function ratioOf(img, fallback) {
        return img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : fallback;
      }
      function open(i, fromEl) {
        var thumbImg = fromEl && fromEl.querySelector('img');
        var zoom = fromEl && thumbImg && thumbImg.complete && !reduced && fromEl.animate;
        if (zoom) viewer.classList.add('is-zooming');
        viewer.classList.add('is-open');
        viewer.classList.remove('is-bare');
        viewer.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('tl-locked');
        viewer.style.setProperty('--tl-foot', viewer.querySelector('.tl-viewer__foot').offsetHeight + 'px');
        // Opened from Favorites, it runs through the favourites only
        var list = [];
        photos.forEach(function(photo, n) { if (!(favourites && current === 'all') || likes[photo.id] || n === i) list.push(n); });
        setOrder(list);
        at = -1;
        near(i, zoom ? 0 : 2);
        driver = 'pages';
        pages.classList.remove('is-free');
        pages.scrollLeft = posOf[i] * pagePitch();
        strip.scrollLeft = posOf[i] * thumbPitch();
        setCurrent(i);
        if (zoom) {
          var full = fitted(pageImgs[i].getBoundingClientRect(), ratioOf(thumbImg, 1));
          fromEl.style.visibility = 'hidden';
          var target = pageImgs[i];
          ghost(thumbImg.currentSrc || thumbImg.src, full, fromEl.getBoundingClientRect(), true, function(remove) {
            fromEl.style.visibility = '';
            // The copy stays in place until the photo under it is ready to paint, so the swap can't flash
            var swapped = false;
            var swap = function() {
              if (swapped) return;
              swapped = true;
              viewer.classList.remove('is-zooming');
              requestAnimationFrame(function() { requestAnimationFrame(remove); });
              near(i);
              playCurrent();
            };
            if (target.decode) target.decode().then(swap, swap);
            setTimeout(swap, 600);
          });
        }
        keyFocus(document.getElementById('TlBack'));
        // The back button closes the photo rather than leaving the page
        if (!pushed) {
          if (!embedded) history.pushState({ tlogPhoto: true }, '', '#photo-' + photos[i].id);
          pushed = true;
        }
      }
      function close(fromHistory) {
        if (!viewer.classList.contains('is-open')) return;
        if (viewer.classList.contains('is-zoomed')) resetZoom(false);
        var img = pageImgs[at];
        var shownAt = fitted(img.getBoundingClientRect(), ratioOf(img, 1));
        img.style.transform = '';
        if (videoAt(at)) videoAt(at).style.transform = '';
        stopVideo(at);
        viewer.style.backgroundColor = '';
        viewer.classList.remove('is-open');
        player.hidden = true;
        viewer.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('tl-locked');
        setInfo(false);
        closeMenu();
        growTo(at);
        var el = stream.querySelector('.tl-tile[data-index="' + at + '"]');
        if (el && el.hidden) el = null;
        if (el) {
          var rect = el.getBoundingClientRect();
          if (rect.top < topBar.getBoundingClientRect().top + HEAD || rect.bottom > window.innerHeight - 90) el.scrollIntoView({ block: 'center' });
          keyFocus(el);
          if (!reduced && el.animate && img.complete && img.naturalWidth) {
            el.style.visibility = 'hidden';
            ghost(img.currentSrc || img.src, shownAt, el.getBoundingClientRect(), false, function(remove) { el.style.visibility = ''; remove(); });
          }
        }
        if (pushed && !fromHistory && !embedded) { pushed = false; history.back(); }
        pushed = false;
        // Favorites may have changed while the photo was open
        if (favourites && current === 'all') filter();
      }
      document.getElementById('TlBack').addEventListener('click', function() { close(); });
      if (!embedded) window.addEventListener('popstate', function() { close(true); });

      // Down closes, up shows the details (and down puts them away), a tap hides or shows the controls; on a computer
      // the mouse can drag the photos sideways too
      var press = null;
      function dragged() { return [pageImgs[at], videoAt(at)].filter(Boolean); }

      // Zoom, like the phone: pinch (or a trackpad pinch), or double-tap, to look closer; drag to look around; pinch
      // back out or double-tap again to return. While zoomed, the photo stays put: no swiping on, no swipe to close.
      // Zooming in hides the controls and lets the photo have the whole screen (is-zoomed); zooming back
      // out returns it to its place and the controls to how they were.
      // zoom.x / zoom.y are where the photo's top-left corner has moved to, relative to its own box; zoom.home is the
      // scale at which the full-screen photo matches the size it had before
      var zoom = { s: 1, x: 0, y: 0, home: 1 }, pinchZoom = null, lastTap = null, tapTimer = null;
      var wasBare = false, leaveTimer = null;
      function paintZoom(animate) {
        var img = pageImgs[at];
        if (!img) return;
        var w = img.offsetWidth, h = img.offsetHeight;
        // Scaled about the box's centre (where it scales from when dragged to close), so shift to match
        var still = zoom.s === 1 && !zoom.x && !zoom.y;
        var moved = still ? '' : 'translate3d(' + (zoom.x + w / 2 * (zoom.s - 1)) + 'px,' + (zoom.y + h / 2 * (zoom.s - 1)) + 'px,0) scale(' + zoom.s + ')';
        dragged().forEach(function(el) {
          el.classList.toggle('is-dragging', !animate);
          el.style.transform = moved;
        });
        var zoomed = viewer.classList.contains('is-zoomed');
        pages.style.overflowX = zoomed ? 'hidden' : '';
        pages.style.touchAction = zoomed ? 'none' : '';
      }
      // The photo's own box on screen, leaving out any zoom
      function boxOf(img) {
        var page = img.parentNode.getBoundingClientRect();
        return { left: page.left + img.offsetLeft, top: page.top + img.offsetTop, width: img.offsetWidth };
      }
      // Go full screen, starting the photo exactly where and how big it already was, so nothing jumps
      function enterZoom() {
        clearTimeout(leaveTimer);
        if (viewer.classList.contains('is-zoomed')) {
          viewer.classList.add('is-bare');
          return;
        }
        var img = pageImgs[at];
        var before = boxOf(img);
        wasBare = viewer.classList.contains('is-bare');
        viewer.classList.add('is-zoomed', 'is-bare');
        closeMenu();
        var after = boxOf(img);
        zoom = { s: before.width / after.width, x: before.left - after.left, y: before.top - after.top };
        zoom.home = zoom.s;
        paintZoom(false);
        void img.offsetWidth;
      }
      function resetZoom(animate) {
        var img = pageImgs[at];
        var leave = function() {
          clearTimeout(leaveTimer);
          var zoomed = viewer.classList.contains('is-zoomed');
          viewer.classList.remove('is-zoomed');
          if (zoomed) viewer.classList.toggle('is-bare', wasBare);
          zoom = { s: 1, x: 0, y: 0, home: 1 };
          paintZoom(false);
          requestAnimationFrame(function() { dragged().forEach(function(el) { el.classList.remove('is-dragging'); }); });
        };
        if (!animate || reduced || !img || !viewer.classList.contains('is-zoomed')) return leave();
        // Glide back to where the photo sits with the controls showing, then hand over to that layout
        var full = boxOf(img);
        viewer.classList.remove('is-zoomed');
        var home = boxOf(img);
        viewer.classList.add('is-zoomed');
        zoom = { s: home.width / full.width, x: home.left - full.left, y: home.top - full.top, home: zoom.home };
        viewer.classList.toggle('is-bare', wasBare);
        paintZoom(true);
        leaveTimer = setTimeout(leave, 260);
      }
      // Scale to s, keeping the point under (cx, cy) where it is
      function zoomAt(s, cx, cy) {
        var img = pageImgs[at];
        var page = img.parentNode.getBoundingClientRect();
        var left = page.left + img.offsetLeft, top = page.top + img.offsetTop;
        s = Math.max(zoom.home * .6, Math.min(5, s));
        var px = (cx - left - zoom.x) / zoom.s, py = (cy - top - zoom.y) / zoom.s;
        zoom.x = cx - left - px * s;
        zoom.y = cy - top - py * s;
        zoom.s = s;
      }
      // A zoomed photo always covers the screen, or sits centred where it's smaller than it
      function clampZoom() {
        var img = pageImgs[at];
        var page = img.parentNode.getBoundingClientRect(), stage = pages.getBoundingClientRect();
        var left = page.left + img.offsetLeft, top = page.top + img.offsetTop;
        var w = img.offsetWidth * zoom.s, h = img.offsetHeight * zoom.s;
        zoom.x = w <= stage.width ? (img.offsetWidth - w) / 2 : Math.min(stage.left - left, Math.max(stage.right - left - w, zoom.x));
        zoom.y = h <= stage.height ? (img.offsetHeight - h) / 2 : Math.min(stage.top - top, Math.max(stage.bottom - top - h, zoom.y));
      }
      function spread2(evt) {
        var a = evt.touches[0], b = evt.touches[1];
        return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      }
      pages.addEventListener('touchstart', function(evt) {
        if (evt.touches.length !== 2 || viewer.classList.contains('is-info')) return;
        // Two fingers: a pinch, not a swipe
        press = null;
        dragged().forEach(function(el) { el.classList.remove('is-dragging'); });
        viewer.style.backgroundColor = '';
        enterZoom();
        var f = spread2(evt);
        pinchZoom = { d: f.d, s: zoom.s, x: f.x, y: f.y };
      }, { passive: true });
      pages.addEventListener('touchmove', function(evt) {
        if (!pinchZoom || evt.touches.length !== 2) return;
        evt.preventDefault();
        var f = spread2(evt);
        // Follow the fingers as they move, and scale about the point between them
        zoom.x += f.x - pinchZoom.x;
        zoom.y += f.y - pinchZoom.y;
        pinchZoom.x = f.x;
        pinchZoom.y = f.y;
        zoomAt(pinchZoom.s * f.d / pinchZoom.d, f.x, f.y);
        paintZoom(false);
      }, { passive: false });
      pages.addEventListener('touchend', function(evt) {
        if (!pinchZoom || evt.touches.length >= 2) return;
        pinchZoom = null;
        if (zoom.s < Math.max(1, zoom.home) * 1.05) resetZoom(true);
        else { clampZoom(); paintZoom(true); }
      });
      pages.addEventListener('wheel', function(evt) {
        if (!evt.ctrlKey || !viewer.classList.contains('is-open')) return;
        evt.preventDefault();
        if (viewer.classList.contains('is-info') || (evt.deltaY >= 0 && !viewer.classList.contains('is-zoomed'))) return;
        if (evt.deltaY < 0) enterZoom();
        zoomAt(zoom.s * Math.exp(-evt.deltaY / 100), evt.clientX, evt.clientY);
        if (evt.deltaY > 0 && zoom.s < Math.max(1, zoom.home) * 1.02) resetZoom(true);
        else { clampZoom(); paintZoom(false); }
      }, { passive: false });
      pages.addEventListener('pointerdown', function(evt) {
        if (evt.pointerType === 'mouse' && evt.button !== 0) return;
        press = { x: evt.clientX, y: evt.clientY, left: pages.scrollLeft, axis: null, t: Date.now(), id: evt.pointerId, mouse: evt.pointerType === 'mouse', zx: zoom.x, zy: zoom.y };
      });
      pages.addEventListener('pointermove', function(evt) {
        if (!press || evt.pointerId !== press.id) return;
        var dx = evt.clientX - press.x, dy = evt.clientY - press.y;
        // Zoomed in, one finger (or the mouse) moves around the photo
        if (viewer.classList.contains('is-zoomed') && !pinchZoom) {
          if (!press.axis && Math.abs(dx) + Math.abs(dy) < 6) return;
          press.axis = 'pan';
          zoom.x = press.zx + dx;
          zoom.y = press.zy + dy;
          clampZoom();
          paintZoom(false);
          return;
        }
        if (!press.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          press.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
          if (press.axis === 'y') dragged().forEach(function(el) { el.classList.add('is-dragging'); });
          if (press.axis === 'x' && press.mouse) {
            pages.classList.add('is-free');
            try { pages.setPointerCapture(evt.pointerId); } catch (e) {}
          }
        }
        if (press.axis === 'y' && dy > 0 && !viewer.classList.contains('is-info')) {
          var moved = 'translate3d(' + dx * .3 + 'px,' + dy + 'px,0) scale(' + Math.max(.75, 1 - dy / 1000) + ')';
          dragged().forEach(function(el) { el.style.transform = moved; });
          viewer.style.backgroundColor = 'rgba(255,255,255,' + Math.max(.2, 1 - dy / 400) + ')';
        } else if (press.axis === 'x' && press.mouse) {
          pages.scrollLeft = press.left - dx;
        }
      });
      function release(evt) {
        if (!press || evt.pointerId !== press.id) return;
        var p = press;
        press = null;
        var dx = evt.clientX - p.x, dy = evt.clientY - p.y;
        var quick = Date.now() - p.t < 250;
        if (p.axis === 'pan') return;
        if (!p.axis) {
          // A long press is the phone's own save menu, not a tap
          if (evt.type !== 'pointerup' || Date.now() - p.t > 500) return;
          // Two quick taps zoom in where tapped (or back out); one tap, a moment later, hides or shows the controls
          var now = Date.now();
          if (lastTap && now - lastTap.t < 300 && Math.hypot(evt.clientX - lastTap.x, evt.clientY - lastTap.y) < 40 && !viewer.classList.contains('is-info')) {
            clearTimeout(tapTimer);
            lastTap = null;
            if (viewer.classList.contains('is-zoomed')) resetZoom(true);
            else { enterZoom(); zoomAt(2.5, evt.clientX, evt.clientY); clampZoom(); paintZoom(true); }
            return;
          }
          lastTap = { t: now, x: evt.clientX, y: evt.clientY };
          clearTimeout(tapTimer);
          tapTimer = setTimeout(function() {
            lastTap = null;
            if (viewer.classList.contains('is-info')) setInfo(false);
            else viewer.classList.toggle('is-bare');
            closeMenu();
          }, 260);
          return;
        }
        if (p.axis === 'y') {
          var els = dragged();
          els.forEach(function(el) { el.classList.remove('is-dragging'); });
          viewer.style.backgroundColor = '';
          if (viewer.classList.contains('is-info')) {
            if (dy > 40) setInfo(false);
            return;
          }
          // Closing zooms back from wherever the photo was dragged to
          if (dy > 100 || (quick && dy > 40)) return close();
          els.forEach(function(el) { el.style.transform = ''; });
          if (dy < -40) setInfo(true);
          return;
        }
        if (p.mouse) {
          var start = Math.round(p.left / pagePitch());
          var target = Math.round(pages.scrollLeft / pagePitch());
          if (target === start && (Math.abs(dx) > 50 || (quick && Math.abs(dx) > 15))) target = start + (dx < 0 ? 1 : -1);
          goTo(target, true);
        }
      }
      pages.addEventListener('pointerup', release);
      pages.addEventListener('pointercancel', release);

      // Save to the camera roll: the photo goes to the phone's share sheet (Save Image); a computer downloads it
      var canShareFiles = !!(navigator.canShare && window.File && (function() {
        try { return navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] }); } catch (e) { return false; }
      })());
      var files = {}, fileOrder = [];
      function fileFor(i) {
        var photo = photos[i];
        if (!files[photo.id]) {
          files[photo.id] = { ready: null, promise: null };
          files[photo.id].promise = fetch(photo.save)
            .then(function(res) { if (!res.ok) throw new Error(res.status); return res.blob(); })
            .then(function(blob) {
              var video = photo.type === 'video';
              var file = new File([blob], 'fugazi-tlog-' + photo.entry.date + '-' + (photo.index + 1) + (video ? '.mp4' : '.jpg'), { type: blob.type || (video ? 'video/mp4' : 'image/jpeg') });
              if (files[photo.id]) files[photo.id].ready = file;
              return file;
            });
          files[photo.id].promise.catch(function() { delete files[photo.id]; });
          // Keep only the last few in memory
          fileOrder.push(photo.id);
          while (fileOrder.length > 5) delete files[fileOrder.shift()];
        }
        return files[photo.id].promise;
      }
      function download(file) {
        var url = URL.createObjectURL(file);
        var a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
        say('Saved');
      }
      function sharePhoto() {
        var photo = photos[at];
        var held = files[photo.id] && files[photo.id].ready;
        if (canShareFiles && held) {
          navigator.share({ files: [held] }).catch(function() {});
          return;
        }
        if (canShareFiles) say('Getting Photo');
        fileFor(at).then(function(file) {
          if (!canShareFiles) return download(file);
          navigator.share({ files: [file] }).then(function() {}, function(err) {
            // Some phones only open the share sheet straight from a tap: by now the photo is ready for the next one
            if (err && err.name === 'NotAllowedError') say('Tap Again to Save');
          });
        }, function() { say('Photo Unavailable'); });
      }
      var shareBtn = document.getElementById('TlShare');
      shareBtn.addEventListener('pointerdown', function() { if (canShareFiles) fileFor(at); });
      shareBtn.addEventListener('click', sharePhoto);
      document.getElementById('TlSave').addEventListener('click', function() { closeMenu(); sharePhoto(); });

      function say(message) {
        toast.textContent = message;
        toast.classList.add('is-shown');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() { toast.classList.remove('is-shown'); }, 1600);
      }
      document.getElementById('TlCopy').addEventListener('click', function() {
        closeMenu();
        // Static-host adaptation: share the current test page and original photo hash.
        var url = location.origin + location.pathname + (embedded ? '' : location.search) + '#photo-' + encodeURIComponent(photos[at].id);
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(function() { say('Link Copied'); }, function() { say(url); });
        else say(url);
      });
      likeBtn.addEventListener('click', function() {
        var photo = photos[at];
        if (likes[photo.id]) delete likes[photo.id];
        else likes[photo.id] = 1;
        saveLikes();
        paintLike(photo);
        var el = stream.querySelector('.tl-tile[data-index="' + at + '"]');
        if (el) {
          if (likes[photo.id]) heart(el);
          else { var h = el.querySelector('.tl-tile__heart'); if (h) h.remove(); }
        }
      });
      infoBtn.addEventListener('click', function() { setInfo(!viewer.classList.contains('is-info')); });
      moreBtn.addEventListener('click', function(evt) {
        evt.stopPropagation();
        var shown = menu.classList.toggle('is-shown');
        moreBtn.setAttribute('aria-expanded', shown ? 'true' : 'false');
      });
      viewer.addEventListener('click', function(evt) {
        if (!evt.target.closest('#TlMenu, #TlMore')) closeMenu();
      });

      document.addEventListener('keydown', function(evt) {
        if (!viewer.classList.contains('is-open')) return;
        if (evt.key === 'Escape') {
          if (menu.classList.contains('is-shown')) closeMenu();
          else if (viewer.classList.contains('is-info')) setInfo(false);
          else close();
        }
        else if (evt.key === 'ArrowLeft') { evt.preventDefault(); goTo(atPos() - 1, true); }
        else if (evt.key === 'ArrowRight') { evt.preventDefault(); goTo(atPos() + 1, true); }
        else if (evt.key === 'Tab') {
          var focusable = [].filter.call(viewer.querySelectorAll('.tl-round, .tl-pill-btn'), function(b) { return b.offsetParent && !b.disabled; });
          var first = focusable[0], last = focusable[focusable.length - 1];
          if (evt.shiftKey && document.activeElement === first) { evt.preventDefault(); last.focus(); }
          else if (!evt.shiftKey && document.activeElement === last) { evt.preventDefault(); first.focus(); }
        }
      });

      // Start at the bottom on the newest photo, or on the photo a shared link points to
      if (!embedded && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
      var saved = null;
      try { saved = localStorage.getItem('fugazi-tlog-view'); } catch (e) {}
      show(saved === 'years' || saved === 'months' ? saved : 'all');
      window.addEventListener('load', function() { if (!pushed) toBottom(); updateSub(); });
      var linked = location.hash.match(/^#photo-(.+)$/);
      if (linked) {
        var id = decodeURIComponent(linked[1]);
        for (var i = 0; i < photos.length; i++) {
          if (String(photos[i].id) === id) {
            if (!embedded) history.replaceState(null, '', location.pathname + location.search);
            if (current !== 'all') show('all');
            open(i);
            break;
          }
        }
      }
    }
  })();
