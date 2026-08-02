(function() {
  const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'src', 'sck', 'fbclid', 'gclid', 'ttclid'];
  const STORAGE_KEY = '_tracking_params';
  const COOKIE_DAYS = 90;

  function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  function setCookie(name, value, days) {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/; SameSite=Lax";
  }

  function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for(let i=0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  function getStorage() {
    try {
      const ls = localStorage.getItem(STORAGE_KEY);
      if (ls) return JSON.parse(ls);
    } catch(e) {}
    
    const ck = getCookie(STORAGE_KEY);
    if (ck) {
      try { return JSON.parse(decodeURIComponent(ck)); } catch(e) {}
    }
    return { first_touch: {}, last_touch: {} };
  }

  function saveStorage(data) {
    const json = JSON.stringify(data);
    try { localStorage.setItem(STORAGE_KEY, json); } catch(e) {}
    setCookie(STORAGE_KEY, encodeURIComponent(json), COOKIE_DAYS);
  }

  function initTracking() {
    let storage = getStorage();
    let urlHasParams = false;
    let currentParams = {};

    // Collect current URL params
    UTM_PARAMS.forEach(param => {
      const val = getQueryParam(param);
      if (val) {
        currentParams[param] = val;
        urlHasParams = true;
      }
    });

    if (urlHasParams) {
      // Set First Touch if empty
      if (!storage.first_touch || Object.keys(storage.first_touch).length === 0) {
        storage.first_touch = { ...currentParams, _timestamp: Date.now() };
      }
      
      // Always update Last Touch with latest incoming params
      storage.last_touch = { ...currentParams, _timestamp: Date.now() };
      
      saveStorage(storage);
    }
    
    window.UTMManager = {
      get: function() {
        return getStorage();
      },
      // Utility to get current effective tracking (combines both, prioritizing last touch for attribution payload)
      getPayload: function() {
        const s = getStorage();
        const ft = s.first_touch || {};
        const lt = s.last_touch || {};
        
        // Expose a combined view if needed, or structured
        let payload = {};
        UTM_PARAMS.forEach(p => {
          if (lt[p]) payload[p] = lt[p];
          else if (ft[p]) payload[p] = ft[p]; // Fallback to first touch if last touch misses it
        });
        
        // Expose explicit first/last touch tracking for API
        payload.first_touch = ft;
        payload.last_touch = lt;
        
        return payload;
      },
      appendParamsToUrl: function(urlString) {
        if (!urlString) return urlString;
        try {
          const url = new URL(urlString, window.location.origin);
          const s = getStorage();
          const lt = s.last_touch || {};
          let modified = false;
          
          UTM_PARAMS.forEach(p => {
            if (lt[p] && !url.searchParams.has(p)) {
              url.searchParams.set(p, lt[p]);
              modified = true;
            }
          });
          
          return modified ? url.toString() : urlString;
        } catch(e) {
          // If URL parsing fails (e.g. relative paths or invalid formats), return original
          return urlString;
        }
      }
    };
  }

  function shouldIgnoreLink(a) {
    if (!a.href) return true;
    const href = a.href.toLowerCase();
    if (href.startsWith('javascript:')) return true;
    if (href.startsWith('mailto:')) return true;
    if (href.startsWith('tel:')) return true;
    if (href.includes('whatsapp.com') || href.includes('wa.me') || href.includes('api.whatsapp.com')) return true;
    if (a.getAttribute('href') && a.getAttribute('href').startsWith('#')) return true;
    
    // Social media logic exclusion if needed (e.g., facebook.com, instagram.com)
    if (href.includes('facebook.com') || href.includes('instagram.com') || href.includes('twitter.com') || href.includes('linkedin.com') || href.includes('youtube.com')) return true;
    
    return false;
  }

  function propagateToLinks() {
    if (!window.UTMManager) return;
    const links = document.querySelectorAll('a');
    links.forEach(a => {
      if (shouldIgnoreLink(a)) return;
      try {
        const newHref = window.UTMManager.appendParamsToUrl(a.href);
        if (newHref !== a.href) {
          a.href = newHref;
        }
      } catch(e) {}
    });
  }

  // Initialize immediately
  initTracking();
  
  // Propagate on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', propagateToLinks);
  } else {
    propagateToLinks();
  }

  // Observe DOM changes for SPA / dynamically injected links
  const observer = new MutationObserver((mutations) => {
    let shouldPropagate = false;
    for (let mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        shouldPropagate = true;
        break;
      }
    }
    if (shouldPropagate) {
      propagateToLinks();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

})();
