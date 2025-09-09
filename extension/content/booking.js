(() => {
  function text(el) {
    return el ? el.textContent.trim() : undefined;
  }

  function num(v) {
    const n = typeof v === 'string' ? v.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.') : v;
    const parsed = parseFloat(n);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function getJsonLd() {
    const nodes = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const node of nodes) {
      try {
        const data = JSON.parse(node.textContent);
        if (Array.isArray(data)) {
          const hotel = data.find(x => x['@type'] === 'Hotel' || x['@type'] === 'LodgingBusiness');
          if (hotel) return hotel;
        } else if (data && (data['@type'] === 'Hotel' || data['@type'] === 'LodgingBusiness')) {
          return data;
        }
      } catch (_) {}
    }
    return undefined;
  }

  function queryAll(sel) {
    return Array.from(document.querySelectorAll(sel));
  }

  function getTitle() {
    const h = document.querySelector('h2[data-testid="title"]') || document.querySelector('h2[data-capla-component-boundary]');
    return text(h) || document.title.replace(/\s*-\s*Booking\.com.*/i, '').trim();
  }

  function getAddress() {
    const addr = document.querySelector('[data-node_tt_id="location_score_tooltip"]') || document.querySelector('[data-testid="address"]');
    return text(addr);
  }

  function getRating() {
    const score = text(document.querySelector('[data-testid="review-score-component"] [aria-label]'))
      || text(document.querySelector('[data-testid="review-score-component"] div'))
      || text(document.querySelector('[data-testid="review-score-right-component"]'));
    const ratingNumber = num(score);
    const countText = text(document.querySelector('[data-testid="review-score-component"] span'))
      || text(document.querySelector('[data-testid="review-subtitle"]'));
    const totalReviews = countText ? num(countText) : undefined;
    return { ratingNumber, totalReviews };
  }

  function getCoordinatesFromLinks() {
    const mapLink = document.querySelector('a[href*="maps.google."]') || document.querySelector('a[href*="goo.gl/maps"]');
    if (!mapLink) return undefined;
    const href = mapLink.getAttribute('href') || '';
    const m = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { latitude: Number(m[1]), longitude: Number(m[2]) };
    return undefined;
  }

  function getAmenities() {
    const items = queryAll('[data-testid="property-most-popular-facilities-wrapper"] li, [data-testid="amenities-container"] li').map(li => text(li)).filter(Boolean);
    return Array.from(new Set(items));
  }

  function getRoomTypes() {
    const cards = queryAll('[data-testid="room-info"]');
    if (cards.length === 0) return undefined;
    return cards.map(card => {
      const name = text(card.querySelector('[data-testid="room-name"]')) || text(card.querySelector('h3'));
      const sizeText = text(card.querySelector('[data-testid="room-size"]'));
      const size = sizeText;
      const occupancyText = text(card.querySelector('[data-testid="occupancy"]'));
      const maxOccupancy = occupancyText ? num(occupancyText) : undefined;
      const beds = queryAll('[data-testid="bed-type"]', card).map(el => text(el)).filter(Boolean);
      const priceText = text(card.querySelector('[data-testid="price-and-discounted-price"] [data-testid="price-and-discounted-price"])')) || text(card.querySelector('[data-testid="price-for-x-nights"]'));
      const baseRate = priceText ? num(priceText) : undefined;
      const amenities = queryAll('li', card).map(el => text(el)).filter(Boolean);
      return {
        name,
        size,
        maxOccupancy,
        bedConfiguration: beds && beds.length ? beds.join(', ') : undefined,
        amenities: Array.from(new Set(amenities)),
        pricing: baseRate ? { baseRate, currency: undefined, taxIncluded: undefined } : undefined
      };
    });
  }

  function getPhotos() {
    const imgs = queryAll('img').map(img => ({ src: img.src, alt: img.alt || undefined })).filter(x => x.src && x.src.startsWith('http'));
    return Array.from(new Set(imgs.map(x => x.src))).slice(0, 50).map(src => ({ src }));
  }

  function scrape() {
    const jsonld = getJsonLd();
    const title = jsonld?.name || getTitle();
    const address = jsonld?.address || getAddress();
    const geo = jsonld?.geo || getCoordinatesFromLinks();
    const { ratingNumber, totalReviews } = getRating();
    const amenities = getAmenities();
    const roomTypes = getRoomTypes();
    const photos = getPhotos();

    const data = {
      scrapedAt: new Date().toISOString(),
      source: location.href,
      hotel: {
        name: title,
        description: jsonld?.description,
        address,
        coordinates: geo ? { latitude: geo.latitude, longitude: geo.longitude } : undefined,
        rating: ratingNumber,
        totalReviews,
        amenities,
        roomTypes,
        photos
      }
    };
    return data;
  }

  // Listen for popup requests
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'SCRAPE_BOOKING') {
      try {
        const data = scrape();
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
      return true;
    }
  });

  // Expose for quick debugging in console
  window.__BOOKING_SCRAPER__ = { scrape };
})();


