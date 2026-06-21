// ============================================================
// BELTON IPQC Global Loading Overlay System v5.6 (Smart Suppress)
// ============================================================
(function() {
    if (window.BLoader) return;

    const loaderCSS = `
      <style>
        #b-loader-overlay {
            position: fixed;
            top: 0; left: 0;
            width: 100vw; height: 100vh;
            background-color: rgba(248, 250, 252, 0.98);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s ease, visibility 0.2s ease;
        }
        #b-loader-overlay.active {
            opacity: 1;
            visibility: visible;
        }
        .b-logo-container {
            width: 220px;
            height: 202px;
        }
        .b-logo-container svg {
            will-change: transform;
        }
        .b-spiral-logo-path {
            fill: none;
            stroke: #E8333A;
            stroke-width: 10;
            stroke-linecap: square;
            stroke-linejoin: miter;
            stroke-dasharray: 2000;
            stroke-dashoffset: 2000;
            animation: b-draw-line 2s cubic-bezier(0.6, 0, 0.4, 1) infinite;
        }
        @keyframes b-draw-line {
            0%   { stroke-dashoffset: 2000; opacity: 0;   }
            8%   { opacity: 1;                             }
            70%  { stroke-dashoffset: 0;    opacity: 1;   }
            85%  { stroke-dashoffset: 0;    opacity: 1;   }
            100% { stroke-dashoffset: 2000; opacity: 0;   }
        }
        .b-loading-text {
            margin-top: 20px;
            font-size: 1rem;
            font-family: 'Calibri', 'Segoe UI', sans-serif;
            font-weight: 700;
            color: #E8333A;
            letter-spacing: 1px;
            text-transform: uppercase;
            animation: b-text-pulse 2s ease-in-out infinite;
        }
        @keyframes b-text-pulse {
            0%,  15% { opacity: 0.4; }
            50%       { opacity: 1;   }
            85%, 100% { opacity: 0.4; }
        }
        .b-dots::after {
            content: '';
            animation: b-loading-dots 1.5s steps(4, end) infinite;
        }
        @keyframes b-loading-dots {
            0%, 20% { content: ''; }
            40%      { content: '.'; }
            60%      { content: '..'; }
            80%, 100%{ content: '...'; }
        }

        /* â”€â”€ (sync bar removed â€” à¹„à¸¡à¹ˆà¹ƒà¸Šà¹‰à¹à¸¥à¹‰à¸§) â”€â”€ */
      </style>
    `;

    const loaderHTML = `
      <div id="b-loader-overlay">
        <div class="b-logo-container">
          <svg viewBox="0 0 220 202" xmlns="http://www.w3.org/2000/svg" width="220" height="202">
            <path class="b-spiral-logo-path" id="b-logo-path" d="
              M 10,8
              L 10,192
              L 210,192
              L 210,56
              L 28,56
              L 28,174
              L 192,174
              L 192,74
              L 46,74
              L 46,156
              L 174,156
              L 174,92
              L 64,92
              L 64,110
            "/>
          </svg>
        </div>
        <div class="b-loading-text" id="b-loader-text">à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”<span class="b-dots"></span></div>
      </div>
    `;

    window.BLoader = {
        // â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // loader à¸ˆà¸°à¹‚à¸œà¸¥à¹ˆà¹€à¸‰à¸žà¸²à¸°à¸•à¸­à¸™à¸—à¸µà¹ˆ operation à¹ƒà¸Šà¹‰à¹€à¸§à¸¥à¸²à¹€à¸à¸´à¸™ SLOW_THRESHOLD ms à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™
        SLOW_THRESHOLD: 1500,   // ms â€” à¸–à¹‰à¸²à¹€à¸£à¹‡à¸§à¸à¸§à¹ˆà¸²à¸™à¸µà¹‰ à¹„à¸¡à¹ˆà¹‚à¸œà¸¥à¹ˆà¹€à¸¥à¸¢
        MIN_DISPLAY:     600,   // ms â€” à¸–à¹‰à¸²à¹‚à¸œà¸¥à¹ˆà¹à¸¥à¹‰à¸§à¸•à¹‰à¸­à¸‡à¸­à¸¢à¸¹à¹ˆà¸­à¸¢à¹ˆà¸²à¸‡à¸™à¹‰à¸­à¸¢à¹€à¸—à¹ˆà¸²à¸™à¸µà¹‰

        showTimer: null,
        hideTimer: null,
        showTimestamp: 0,
        isCurrentlyShowing: false,

        _calibratePath: function() {
            const path = document.getElementById('b-logo-path');
            if (!path) return;
            try {
                const len = Math.ceil(path.getTotalLength());
                const style = document.createElement('style');
                style.textContent = `
                    .b-spiral-logo-path { stroke-dasharray: ${len} !important; }
                    @keyframes b-draw-line {
                        0%   { stroke-dashoffset: ${len}; opacity: 0; }
                        8%   { opacity: 1; }
                        70%  { stroke-dashoffset: 0; opacity: 1; }
                        85%  { stroke-dashoffset: 0; opacity: 1; }
                        100% { stroke-dashoffset: ${len}; opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            } catch(e) {}
        },

        _executeShow: function(text) {
            const overlay = document.getElementById('b-loader-overlay');
            if (!overlay || this.isCurrentlyShowing) return;
            const textEl = document.getElementById('b-loader-text');
            if (textEl) textEl.innerHTML = `${text}<span class="b-dots"></span>`;
            overlay.classList.add('active');
            this.isCurrentlyShowing = true;
            this.showTimestamp = Date.now();
        },

        // â”€â”€ show / hide: à¹ƒà¸Šà¹‰à¸•à¸­à¸™ user à¸à¸”à¸›à¸¸à¹ˆà¸¡ sync à¸”à¹‰à¸§à¸¢à¸•à¸±à¸§à¹€à¸­à¸‡ (manual action) â”€â”€
        // à¸ˆà¸°à¹‚à¸œà¸¥à¹ˆ loader à¸—à¸±à¸™à¸—à¸µ à¹„à¸¡à¹ˆà¸¡à¸µ threshold (à¹€à¸žà¸£à¸²à¸° user à¸£à¸¹à¹‰à¸§à¹ˆà¸²à¸à¸³à¸¥à¸±à¸‡à¸—à¸³à¸­à¸°à¹„à¸£)
        show: function(text = 'à¸à¸³à¸¥à¸±à¸‡à¸›à¸£à¸°à¸¡à¸§à¸¥à¸œà¸¥') {
            if (this.showTimer) clearTimeout(this.showTimer);
            this._executeShow(text);
        },

        hide: function() {
            if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
            const overlay = document.getElementById('b-loader-overlay');
            if (!overlay || !this.isCurrentlyShowing) return;
            const elapsed = Date.now() - this.showTimestamp;
            const remaining = this.MIN_DISPLAY - elapsed;
            if (this.hideTimer) clearTimeout(this.hideTimer);
            const doHide = () => {
                overlay.classList.remove('active');
                this.isCurrentlyShowing = false;
            };
            if (remaining > 0) {
                this.hideTimer = setTimeout(doHide, remaining);
            } else {
                doHide();
            }
        },

        // â”€â”€ showIfSlow / hideIfSlow: à¹ƒà¸Šà¹‰à¸•à¸­à¸™ background fetch / render â”€â”€
        // loader à¸ˆà¸°à¹‚à¸œà¸¥à¹ˆà¸à¹‡à¸•à¹ˆà¸­à¹€à¸¡à¸·à¹ˆà¸­ operation à¸Šà¹‰à¸²à¹€à¸à¸´à¸™ SLOW_THRESHOLD à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™
        // à¸–à¹‰à¸²à¹€à¸£à¹‡à¸§ â†’ à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰à¸ˆà¸°à¹„à¸¡à¹ˆà¹€à¸«à¹‡à¸™ loader à¹€à¸¥à¸¢
        showIfSlow: function(text = 'à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”') {
            if (this.isCurrentlyShowing) return;
            if (this.showTimer) clearTimeout(this.showTimer);
            this.showTimer = setTimeout(() => this._executeShow(text), this.SLOW_THRESHOLD);
        },

        hideIfSlow: function() {
            if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
            if (this.isCurrentlyShowing) this.hide();
        },

        // â”€â”€ wrapAsync: utility à¸ªà¸³à¸«à¸£à¸±à¸š wrap async function à¸”à¹‰à¸§à¸¢ showIfSlow â”€â”€
        // à¹ƒà¸Šà¹‰à¹à¸—à¸™à¸à¸²à¸£ call show/hide à¹€à¸­à¸‡: BLoader.wrapAsync(async () => { ... }, 'à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡')
        wrapAsync: async function(fn, text = 'à¸à¸³à¸¥à¸±à¸‡à¹‚à¸«à¸¥à¸”') {
            this.showIfSlow(text);
            try {
                return await fn();
            } finally {
                this.hideIfSlow();
            }
        },

        // â”€â”€ renderInChunks: à¸¢à¸±à¸‡à¸„à¸‡à¹„à¸§à¹‰ à¹à¸•à¹ˆà¹„à¸¡à¹ˆà¸ˆà¸±à¸”à¸à¸²à¸£ loader à¹€à¸­à¸‡ â”€â”€
        renderInChunks: function(array, renderItemFn, chunkSize = 50, onCompleteFn = null) {
            let index = 0;
            function doChunk() {
                let count = chunkSize;
                while (count > 0 && index < array.length) {
                    renderItemFn(array[index], index);
                    index++; count--;
                }
                if (index < array.length) {
                    requestAnimationFrame(() => setTimeout(doChunk, 0));
                } else {
                    if (onCompleteFn) onCompleteFn();
                }
            }
            doChunk();
        },

        // â”€â”€ backward-compat stubs (à¸à¸±à¸™ error à¸–à¹‰à¸²à¸¡à¸µ code à¹€à¸à¹ˆà¸²à¹€à¸£à¸µà¸¢à¸) â”€â”€
        showSilent: function() {},
        hideSilent: function() {},
        interceptRenderFn: function(fn) { return fn; }
    };

    document.addEventListener('DOMContentLoaded', () => {
        document.head.insertAdjacentHTML('beforeend', loaderCSS);
        document.body.insertAdjacentHTML('beforeend', loaderHTML);
        requestAnimationFrame(() => window.BLoader._calibratePath());
    });

})();

