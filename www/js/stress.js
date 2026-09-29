/*
 * Auto-capture stress screens.
 *
 * Two views on the same rich card, with the same controls, differing only in
 * how much of the tree is in the DOM at once:
 *
 *   /stress-static — every card built up front. The worst case.
 *   /stress-feed   — cards appended as you scroll, the way a real infinite
 *                    list grows. The fairer of the two.
 *
 * What they stress, concretely. The engine installs four capture-phase
 * listeners on `document` (`click`, `change`, `input`, `submit`), so every
 * event in the page reaches it before anything knows which element was hit.
 * From there, resolving one interaction:
 *
 *   * walks the target's ancestors to `document` to build the hierarchy path
 *     (`dom/element-inspector.js`), so depth is paid per event;
 *   * asks each ancestor for its index among its siblings with
 *     `Array.prototype.indexOf.call(parent.children, element)` — a scan that
 *     is linear in the sibling count, which is why the 120-chip block is here;
 *   * walks the ancestors again to resolve the nearest privacy marker
 *     (`dom/governance.js`), and re-runs `document.querySelectorAll` for any
 *     selector-based marker that is still applied.
 *
 * Toggle auto-capture from the controls to A/B the same screen, and watch the
 * frame and node readouts at the bottom while scrolling. Measure a release
 * build on a real device; these numbers mean nothing in a desktop browser.
 */

/** Cards mounted before the first scroll, and added per batch after it. */
var STRESS_PAGE_SIZE = 20;

/**
 * The most cards a screen will mount, whatever the preset says.
 *
 * Nothing is ever removed here, so without a ceiling the tree grows until the
 * WebView's content process is killed under memory pressure — which ends the
 * run instead of measuring it. The heaviest preset sits at this cap.
 */
var STRESS_MAX_MOUNTED = 250;

var STRESS_STATIC_PRESETS = [
    { label: '40 / flat', itemCount: 40, nestingDepth: 0 },
    { label: '120 / deep 6', itemCount: 120, nestingDepth: 6 },
    { label: '250 / deep 12', itemCount: 250, nestingDepth: 12 }
];

var STRESS_FEED_PRESETS = [
    { label: '60 / flat', itemCount: 60, nestingDepth: 0 },
    { label: '120 / deep 6', itemCount: 120, nestingDepth: 6 },
    { label: '250 / deep 12', itemCount: 250, nestingDepth: 12 }
];

// Live state per screen, keyed by the route it belongs to.
var stressScreens = {};

/**
 * Wires both stress screens. Called once from onDeviceReady, before the first
 * render, so a deep link straight to a stress route lands on a built screen.
 */
function setupStressScreens() {
    stressScreens['/stress-static'] = createStressScreen({
        route: '/stress-static',
        presets: STRESS_STATIC_PRESETS,
        lazy: false,
        prefix: 'stressStatic'
    });

    stressScreens['/stress-feed'] = createStressScreen({
        route: '/stress-feed',
        presets: STRESS_FEED_PRESETS,
        lazy: true,
        prefix: 'stressFeed'
    });

    // Building 250 rich cards takes long enough to be worth deferring until the
    // screen is actually opened — otherwise it is paid on every app launch.
    window.addEventListener('hashchange', renderActiveStressScreen);
    renderActiveStressScreen();
}

function renderActiveStressScreen() {
    var route = (location.hash || '#/home').replace(/^#/, '');
    var screen = stressScreens[route];
    if (screen && !screen.built) {
        screen.build();
    }
}

/**
 * Builds one stress screen and returns a handle the router can ask to render.
 *
 * `lazy` picks the growth model: false mounts the whole preset at once, true
 * mounts STRESS_PAGE_SIZE and appends a batch whenever the sentinel scrolls
 * into view.
 */
function createStressScreen(config) {
    var controlsEl = document.getElementById(config.prefix + 'Controls');
    var noteEl = document.getElementById(config.prefix + 'Note');
    var cardsEl = document.getElementById(config.prefix + 'Cards');
    var sentinelEl = document.getElementById(config.prefix + 'Sentinel');
    var statsEl = document.getElementById(config.prefix + 'Stats');
    if (!controlsEl || !cardsEl || !statsEl) return null;

    var screen = {
        built: false,
        preset: config.presets[1],
        // Off by default. Ten images a card, none of them ever released, is the
        // fastest way to get the WebView's content process killed — and image
        // decode is cost that has nothing to do with the SDK either way.
        images: false,
        autoCapture: true,
        mounted: 0,
        cardState: {},
        build: null
    };

    var stats = createStressStatsBar(statsEl);

    function ceiling() {
        return Math.min(screen.preset.itemCount, STRESS_MAX_MOUNTED);
    }

    function updateNote() {
        if (!noteEl) return;
        var total = ceiling();
        noteEl.textContent = config.lazy
            ? screen.mounted +
              ' of ' +
              total +
              ' cards mounted, each wrapped in ' +
              screen.preset.nestingDepth +
              ' extra elements. Scroll to grow the tree.'
            : total +
              ' cards, all in the DOM at once, each wrapped in ' +
              screen.preset.nestingDepth +
              ' extra elements. Every 4th carries a table, every 6th a form, ' +
              'every 10th a 120-chip block.';
    }

    function appendCards(from, to) {
        // One fragment for the whole batch: appending card by card would let
        // the WebView lay out and paint between each, which turns a build into
        // dozens of reflows and makes the mount reading meaningless.
        var fragment = document.createDocumentFragment();
        for (var index = from; index < to; index++) {
            fragment.appendChild(
                nestStressElement(
                    buildHeavyCard(index, screen),
                    screen.preset.nestingDepth
                )
            );
        }
        cardsEl.appendChild(fragment);
        screen.mounted = to;
    }

    function rebuild() {
        var started = Date.now();
        cardsEl.innerHTML = '';
        screen.mounted = 0;
        screen.cardState = {};
        appendCards(0, config.lazy ? Math.min(STRESS_PAGE_SIZE, ceiling()) : ceiling());
        stats.reportBuild(Date.now() - started);
        updateNote();
        updateSentinel();
    }

    function growOneBatch() {
        var total = ceiling();
        if (screen.mounted >= total) return;
        var started = Date.now();
        appendCards(screen.mounted, Math.min(screen.mounted + STRESS_PAGE_SIZE, total));
        stats.reportBuild(Date.now() - started);
        updateNote();
        updateSentinel();
    }

    function updateSentinel() {
        if (!sentinelEl) return;
        var done = screen.mounted >= ceiling();
        sentinelEl.hidden = done;
        sentinelEl.textContent = done ? '' : 'Scroll to mount more cards…';
    }

    buildStressControls(controlsEl, config.presets, screen, rebuild);

    if (config.lazy && sentinelEl && typeof IntersectionObserver === 'function') {
        new IntersectionObserver(function (entries) {
            if (entries.some(function (entry) { return entry.isIntersecting; })) {
                growOneBatch();
            }
        }).observe(sentinelEl);
    }

    screen.build = function () {
        screen.built = true;
        // Make the switch's position true rather than assumed — see
        // setStressAutoCapture.
        setStressAutoCapture(true);
        rebuild();
        stats.start();
    };

    return screen;
}

/** Preset buttons plus the auto-capture and photos switches. */
function buildStressControls(container, presets, screen, rebuild) {
    container.innerHTML = '';

    var presetRow = document.createElement('div');
    presetRow.className = 'heavy-preset-row';

    var buttons = presets.map(function (preset) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'heavy-preset-btn';
        button.textContent = preset.label;
        button.setAttribute('data-testid', 'heavy-preset-' + preset.itemCount);
        button.addEventListener('click', function () {
            screen.preset = preset;
            syncSelected();
            rebuild();
        });
        presetRow.appendChild(button);
        return button;
    });

    function syncSelected() {
        buttons.forEach(function (button, i) {
            button.classList.toggle('selected', presets[i] === screen.preset);
        });
    }

    syncSelected();
    container.appendChild(presetRow);

    var switchRow = document.createElement('div');
    switchRow.className = 'heavy-switch-row';

    switchRow.appendChild(
        stressToggle('Auto-capture', screen.autoCapture, function (on) {
            screen.autoCapture = on;
            setStressAutoCapture(on);
        })
    );

    switchRow.appendChild(
        stressToggle('Photos', screen.images, function (on) {
            screen.images = on;
            rebuild();
        })
    );

    container.appendChild(switchRow);
}

function stressToggle(label, checked, onChange) {
    var wrap = document.createElement('label');
    wrap.className = 'ac-field';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-label', label);
    input.checked = checked;
    input.addEventListener('change', function () {
        onChange(input.checked);
    });

    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(' ' + label));
    return wrap;
}

/**
 * Pauses or resumes the engine.
 *
 * The plugin exposes no way to read whether capture is currently paused, so the
 * switches start at their assumed position. Arriving here after stopping
 * capture on the Auto-Capture Config screen would show them on while nothing is
 * captured — resume once on build so the assumption holds.
 */
function setStressAutoCapture(enabled) {
    var plugin = getUserpilotPlugin();
    if (!plugin) return;

    var method = enabled ? plugin.resumeAutoCapture : plugin.stopAutoCapture;
    if (typeof method !== 'function') return;

    method.call(
        plugin,
        function () {
            logOutput('Auto-capture ' + (enabled ? 'resumed' : 'stopped'));
        },
        function (err) {
            logOutput('Auto-capture toggle error: ' + JSON.stringify(err));
        }
    );
}

/**
 * Wraps `element` in `depth` nested elements.
 *
 * Deliberately varied: each kind contributes its own box and its own class
 * attribute, the way a real design system's nested wrappers do. Every one is
 * another ancestor the engine walks — twice, once for the hierarchy path and
 * once for the privacy marker — and another parent whose sibling list it scans.
 */
function nestStressElement(element, depth) {
    var classes = ['nest-pad', 'nest-box', 'nest-inline', 'nest-clip'];
    var result = element;
    for (var i = 0; i < depth; i++) {
        var wrapper = document.createElement(i % 4 === 2 ? 'span' : 'div');
        wrapper.className = classes[i % 4];
        wrapper.appendChild(result);
        result = wrapper;
    }
    return result;
}

/** A deterministic pseudo-photo URL, so a run is reproducible. */
function stressPhotoUrl(seed, width, height) {
    return 'https://picsum.photos/seed/up' + seed + '/' + width + '/' + height;
}

/**
 * One rich feed card: hero, author row, thumbnail strip, chip carousel,
 * metrics, controls and — on some indexes — a form, a table and a wide block.
 *
 * Built imperatively rather than from a template string so the elements that
 * carry handlers, `data-testid`s and `aria-label`s are obvious: those are the
 * attributes the engine's label resolution and element classifier read, and
 * they are the reason this markup is a fixture rather than UI to tidy.
 */
function buildHeavyCard(index, screen) {
    var card = document.createElement('div');
    card.className = 'heavy-card';
    card.setAttribute('data-testid', 'heavy-card-' + index);

    card.appendChild(buildHeavyHero(index, screen));

    var body = document.createElement('div');
    body.className = 'heavy-card-body';
    card.appendChild(body);

    body.appendChild(buildHeavyAuthorRow(index, screen));

    var title = document.createElement('h2');
    title.className = 'heavy-title';
    title.textContent =
        'Feed item ' + index + ' — quarterly performance summary';
    body.appendChild(title);

    var copy = document.createElement('p');
    copy.className = 'heavy-body';
    copy.textContent =
        'A longer supporting line of body copy, the kind a real card carries, ' +
        'so the text layout and the capture path are representative.';
    body.appendChild(copy);

    body.appendChild(buildHeavyThumbStrip(index, screen));
    body.appendChild(buildHeavyChipRow(index));
    body.appendChild(buildHeavyMetricsRow(index));
    body.appendChild(buildHeavyRatingRow(index));
    body.appendChild(buildHeavyControlRow(index, screen));
    body.appendChild(buildHeavyActionRow(index, screen));

    if (index % 6 === 0) body.appendChild(buildHeavyFormBlock(index));
    if (index % 4 === 0) body.appendChild(buildHeavyTable(index));
    if (index % 10 === 0) body.appendChild(buildHeavyWideBlock(index));

    return card;
}

/** A photo, or the gradient that stands in for one when photos are off. */
function heavyMedia(screen, seed, className, width, height) {
    if (!screen.images) {
        var block = document.createElement('div');
        block.className = className + ' heavy-gradient';
        return block;
    }

    var img = document.createElement('img');
    img.className = className;
    img.src = stressPhotoUrl(seed, width, height);
    img.alt = 'media ' + seed;
    img.loading = 'lazy';
    // A failed fetch falls back to the gradient, so the card lays out the same
    // offline and a dead network cannot be mistaken for a fast screen.
    img.addEventListener('error', function () {
        img.classList.add('heavy-gradient');
    });
    return img;
}

/* A tap near the top-right of the hero resolves through the overlaid button,
   not the card body — different ancestry, different payload. */
function buildHeavyHero(index, screen) {
    var stack = document.createElement('div');
    stack.className = 'heavy-hero-stack';
    stack.appendChild(heavyMedia(screen, index, 'heavy-hero', 640, 260));

    var bookmark = document.createElement('button');
    bookmark.type = 'button';
    bookmark.className = 'heavy-hero-bookmark';
    bookmark.textContent = '☆';
    bookmark.setAttribute('aria-label', 'Bookmark item ' + index);
    stack.appendChild(bookmark);

    var tag = document.createElement('span');
    tag.className = 'heavy-hero-tag';
    tag.textContent = 'Featured';
    stack.appendChild(tag);

    return stack;
}

function buildHeavyAuthorRow(index, screen) {
    var row = document.createElement('div');
    row.className = 'heavy-author-row';
    row.appendChild(
        heavyMedia(screen, index + 5000, 'heavy-avatar-img', 64, 64)
    );

    var text = document.createElement('div');
    text.className = 'heavy-author-text';

    var name = document.createElement('span');
    name.className = 'heavy-author-name';
    name.textContent = 'Author ' + (index % 50);
    text.appendChild(name);

    var meta = document.createElement('span');
    meta.className = 'heavy-meta';
    meta.textContent = (index % 24) + 'h ago · 4 min read';
    text.appendChild(meta);

    row.appendChild(text);

    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'heavy-icon-btn';
    more.textContent = '⋮';
    more.setAttribute('aria-label', 'More for item ' + index);
    row.appendChild(more);

    return row;
}

/* Nested scrollers inside a scroller are common in real feeds and worth
   having: each thumbnail is its own tap target, so the ancestry under a finger
   differs from the card body's. */
function buildHeavyThumbStrip(index, screen) {
    var strip = document.createElement('div');
    strip.className = 'heavy-scroller';
    for (var i = 0; i < 8; i++) {
        var wrap = document.createElement('button');
        wrap.type = 'button';
        wrap.className = 'heavy-thumb-wrap';
        wrap.setAttribute('aria-label', 'Thumbnail ' + i + ' of item ' + index);
        wrap.appendChild(
            heavyMedia(screen, index * 10 + i, 'heavy-thumb', 144, 144)
        );
        strip.appendChild(wrap);
    }
    return strip;
}

function buildHeavyChipRow(index) {
    var row = document.createElement('div');
    row.className = 'heavy-scroller';
    for (var i = 0; i < 12; i++) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'heavy-chip';
        chip.textContent = 'tag ' + i;
        chip.setAttribute('data-testid', 'heavy-tag-' + index + '-' + i);
        row.appendChild(chip);
    }
    return row;
}

function buildHeavyMetricsRow(index) {
    var metrics = [
        ['👁', 'Views'],
        ['👍', 'Likes'],
        ['💬', 'Replies'],
        ['↗', 'Shares']
    ];

    var row = document.createElement('div');
    row.className = 'heavy-metrics-row';
    metrics.forEach(function (metric) {
        var cell = document.createElement('div');
        cell.className = 'heavy-metric';

        var glyph = document.createElement('span');
        glyph.textContent = metric[0];
        cell.appendChild(glyph);

        var value = document.createElement('span');
        value.className = 'heavy-metric-value';
        value.textContent = String(((index + 1) * 7) % 999);
        cell.appendChild(value);

        var name = document.createElement('span');
        name.className = 'heavy-meta';
        name.textContent = metric[1];
        cell.appendChild(name);

        row.appendChild(cell);
    });
    return row;
}

function buildHeavyRatingRow(index) {
    var row = document.createElement('div');
    row.className = 'heavy-rating-row';
    for (var i = 0; i < 5; i++) {
        var star = document.createElement('button');
        star.type = 'button';
        star.className = 'heavy-star';
        star.textContent = i <= index % 5 ? '★' : '☆';
        star.setAttribute('aria-label', 'Rate ' + (i + 1));
        row.appendChild(star);
    }

    var score = document.createElement('span');
    score.className = 'heavy-meta';
    score.textContent = (index % 5) + 1 + '.0';
    row.appendChild(score);

    return row;
}

/* A range and a switch: the two shapes that reach the engine's value-capture
   path rather than its tap path. */
function buildHeavyControlRow(index, screen) {
    var row = document.createElement('div');
    row.className = 'heavy-control-row';

    var range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.value = String(screen.cardState['range-' + index] || 40);
    range.setAttribute('aria-label', 'Weight ' + index);
    range.addEventListener('change', function () {
        screen.cardState['range-' + index] = Number(range.value);
    });
    row.appendChild(range);

    var toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', 'Notify for item ' + index);
    row.appendChild(toggle);

    return row;
}

function buildHeavyActionRow(index, screen) {
    var row = document.createElement('div');
    row.className = 'heavy-action-row';

    var like = document.createElement('button');
    like.type = 'button';
    like.className = 'heavy-action-btn';
    like.textContent = '♡ Like';
    like.setAttribute('aria-label', 'Like item ' + index);
    like.addEventListener('click', function () {
        var liked = !screen.cardState['liked-' + index];
        screen.cardState['liked-' + index] = liked;
        like.textContent = liked ? '♥ Liked' : '♡ Like';
        like.classList.toggle('liked', liked);
    });
    row.appendChild(like);

    var reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'heavy-action-btn';
    reply.textContent = 'Reply';
    row.appendChild(reply);

    var spacer = document.createElement('div');
    spacer.className = 'heavy-spacer';
    row.appendChild(spacer);

    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'heavy-action-btn outline';
    open.textContent = 'Open';
    row.appendChild(open);

    return row;
}

/**
 * Inputs and selects reach capture paths a read-only card never does: the
 * debounced text-change path, value capture, and a different branch of element
 * classification for each control.
 *
 * Left uncontrolled on purpose — typing here runs the real debounce without a
 * re-render on every keystroke competing with it.
 */
function buildHeavyFormBlock(index) {
    var block = document.createElement('div');
    block.className = 'heavy-form-block';

    block.appendChild(
        heavyField('Title', 'text', 'Item ' + index + ' title')
    );
    block.appendChild(
        heavyField('Owner email', 'email', 'owner@example.com')
    );

    var selectLabel = document.createElement('label');
    selectLabel.textContent = 'Segment';
    var select = document.createElement('select');
    select.setAttribute('aria-label', 'Segment for item ' + index);
    for (var i = 0; i < 6; i++) {
        var option = document.createElement('option');
        option.value = 'seg-' + i;
        option.textContent = 'Segment ' + i;
        select.appendChild(option);
    }
    selectLabel.appendChild(select);
    block.appendChild(selectLabel);

    var radioGroup = document.createElement('div');
    radioGroup.setAttribute('role', 'radiogroup');
    radioGroup.setAttribute('aria-label', 'Plan for item ' + index);
    ['Free', 'Pro', 'Enterprise'].forEach(function (plan, i) {
        var label = document.createElement('label');
        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'heavy-plan-' + index;
        radio.value = 'plan-' + i;
        radio.checked = i === index % 3;
        label.appendChild(radio);
        label.appendChild(document.createTextNode(' ' + plan));
        radioGroup.appendChild(label);
    });
    block.appendChild(radioGroup);

    var notesLabel = document.createElement('label');
    notesLabel.textContent = 'Notes';
    var notes = document.createElement('textarea');
    notes.rows = 2;
    notes.placeholder = 'Anything worth remembering';
    notes.setAttribute('aria-label', 'Notes for item ' + index);
    notesLabel.appendChild(notes);
    block.appendChild(notesLabel);

    return block;
}

function heavyField(labelText, type, placeholder) {
    var label = document.createElement('label');
    label.textContent = labelText;

    var input = document.createElement('input');
    input.type = type;
    input.placeholder = placeholder;
    input.setAttribute('aria-label', labelText);
    label.appendChild(input);

    return label;
}

/**
 * 40 cells sharing a handful of parents, so a tap on a cell resolves through a
 * wide sibling list and a tag path with no id or class of its own to latch on
 * to — the case where the engine has the least to work with.
 */
function buildHeavyTable(index) {
    var scroller = document.createElement('div');
    scroller.className = 'heavy-scroller';

    var table = document.createElement('table');
    table.className = 'heavy-table';

    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Metric', 'D1', 'D7', 'D30'].forEach(function (head) {
        var th = document.createElement('th');
        th.textContent = head;
        headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    for (var row = 0; row < 10; row++) {
        var tr = document.createElement('tr');

        var label = document.createElement('td');
        label.textContent = 'Cohort ' + row;
        tr.appendChild(label);

        for (var col = 0; col < 3; col++) {
            var td = document.createElement('td');
            var cell = document.createElement('button');
            cell.type = 'button';
            cell.textContent = ((index + row) * (col + 2)) % 97 + '%';
            td.appendChild(cell);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    scroller.appendChild(table);
    return scroller;
}

/**
 * 120 chips under one parent.
 *
 * Building a hierarchy asks each ancestor for its index among its siblings, and
 * that scan is linear in the sibling count — so a parent this wide is the worst
 * case for the hierarchy half of resolving an interaction.
 */
function buildHeavyWideBlock(index) {
    var block = document.createElement('div');
    block.className = 'heavy-wide-block';
    for (var i = 0; i < 120; i++) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'heavy-wide-chip';
        chip.textContent = String(i);
        chip.setAttribute('aria-label', 'Chip ' + i + ' of item ' + index);
        block.appendChild(chip);
    }
    return block;
}

/**
 * Live frame timings, the last build cost and the page's node count, so the
 * jank is visible without attaching a profiler.
 *
 * Repaints on a timer rather than per frame — reporting the cost must not
 * become part of it.
 */
function createStressStatsBar(container) {
    var samples = [];
    var lastBuildMs = 0;
    var nodes = 0;
    var nodesStale = true;
    var running = false;

    // Only the screen being looked at should be sampled. Both stress screens
    // stay in the DOM once built, and a second rAF loop counting nodes behind
    // the one on screen would be cost the readout attributes to autocapture.
    function visible() {
        return container.offsetParent !== null;
    }

    function countNodes() {
        // A plain HTML page, so one live HTMLCollection is the whole tree. The
        // Ionic sample has to walk shadow roots for this; there are none here,
        // which is one fewer thing between the count and the truth.
        return document.getElementsByTagName('*').length;
    }

    function repaint() {
        if (samples.length === 0 || !visible()) return;

        if (nodesStale) {
            // Recounted only after the tree changed shape: at 250 cards this
            // walks a six-figure node count, which is not something to do
            // twice a second inside a measurement.
            nodes = countNodes();
            nodesStale = false;
        }

        var total = samples.reduce(function (sum, ms) { return sum + ms; }, 0);
        var worst = Math.max.apply(null, samples);
        // 16.7ms is the 60fps budget; anything above it dropped a frame.
        var dropped = samples.filter(function (ms) { return ms > 16.7; }).length;

        container.textContent = '';
        [
            Math.round(1000 / (total / samples.length)) + ' fps',
            'dropped ' + dropped + '/' + samples.length,
            'worst ' + Math.round(worst) + 'ms',
            'build ' + lastBuildMs + 'ms',
            nodes.toLocaleString() + ' nodes'
        ].forEach(function (text) {
            var span = document.createElement('span');
            span.textContent = text;
            container.appendChild(span);
        });
    }

    return {
        reportBuild: function (ms) {
            lastBuildMs = ms;
            nodesStale = true;
            samples.length = 0;
        },
        start: function () {
            if (running) return;
            running = true;

            var last = performance.now();
            function tick(now) {
                if (visible()) {
                    samples.push(now - last);
                    if (samples.length > 120) samples.shift();
                }
                last = now;
                requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
            setInterval(repaint, 500);
        }
    };
}
