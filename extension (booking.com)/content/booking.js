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

  function queryAll(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function getTitle() {
    const h = document.querySelector('h2[data-testid="title"]') || document.querySelector('h2[data-capla-component-boundary]');
    return text(h) || document.title.replace(/\s*-\s*Booking\.com.*/i, '').trim();
  }

  function getAddressText() {
    const addr = document.querySelector('[data-node_tt_id="location_score_tooltip"]') || document.querySelector('[data-testid="address"]');
    return text(addr);
  }

  function getAggregateRating(jsonld) {
    if (jsonld?.aggregateRating) {
      return {
        ratingNumber: num(jsonld.aggregateRating.ratingValue),
        totalReviews: num(jsonld.aggregateRating.reviewCount)
      };
    }
    const score = text(document.querySelector('[data-testid="review-score-component"] [aria-label]'))
      || text(document.querySelector('[data-testid="review-score-component"] div'))
      || text(document.querySelector('[data-testid="review-score-right-component"]'));
    const ratingNumber = num(score);
    const countText = text(document.querySelector('[data-testid="review-score-component"] span'))
      || text(document.querySelector('[data-testid="review-subtitle"]'));
    const totalReviews = countText ? num(countText) : undefined;
    return { ratingNumber, totalReviews };
  }

  function getCoordinates(jsonld) {
    if (jsonld?.geo && (jsonld.geo.latitude || jsonld.geo.longitude)) {
      return { latitude: Number(jsonld.geo.latitude), longitude: Number(jsonld.geo.longitude) };
    }
    if (jsonld?.hasMap && typeof jsonld.hasMap === 'string') {
      const m = jsonld.hasMap.match(/center=([-\d\.]+),([-\d\.]+)/);
      if (m) {
        return { latitude: Number(m[1]), longitude: Number(m[2]) };
      }
    }
    const mapLink = document.querySelector('a[href*="maps.google."]') || document.querySelector('a[href*="goo.gl/maps"]');
    if (!mapLink) return undefined;
    const href = mapLink.getAttribute('href') || '';
    const m = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { latitude: Number(m[1]), longitude: Number(m[2]) };
    return undefined;
  }

  function getAmenities() {
    const items = queryAll('[data-testid="property-most-popular-facilities-wrapper"] li, [data-testid="amenities-container"] li').map(li => text(li)).filter(Boolean);
    const unique = Array.from(new Set(items));
    return unique.length ? unique : undefined;
  }

  function getRoomTypes() {
    const cards = queryAll('[data-testid="room-info"]');
    if (cards.length === 0) return undefined;
    return cards.map(card => {
      const name = text(card.querySelector('[data-testid="room-name"]')) || text(card.querySelector('h3'));
      const sizeText = text(card.querySelector('[data-testid="room-size"]'));
      const occupancyText = text(card.querySelector('[data-testid="occupancy"]'));
      const maxOccupancy = occupancyText ? num(occupancyText) : undefined;
      const beds = queryAll('[data-testid="bed-type"]', card).map(el => text(el)).filter(Boolean);
      const priceNode = card.querySelector('[data-testid="price-and-discounted-price"]') || card.querySelector('[data-testid="price-for-x-nights"]');
      const priceText = text(priceNode);
      const baseRate = priceText ? num(priceText) : undefined;
      const amenities = queryAll('li', card).map(el => text(el)).filter(Boolean);
      return {
        id: null,
        name: name || null,
        description: null,
        size: sizeText || null,
        maxOccupancy: maxOccupancy ?? null,
        bedConfiguration: beds && beds.length ? beds.join(', ') : null,
        amenities: amenities.length ? Array.from(new Set(amenities)) : null,
        pricing: baseRate ? { baseRate, currency: null, taxIncluded: null } : null
      };
    });
  }

  function ensureNull(v) {
    return v === undefined ? null : v;
  }

  function extractFromInlineScripts() {
    const result = { id: undefined, name: undefined, photos: [] };
    const scripts = Array.from(document.scripts);
    for (const s of scripts) {
      const t = s.textContent || '';
      if (!t) continue;
      if (result.id === undefined) {
        const m = t.match(/b_hotel_id\s*:\s*'([^']+)'/);
        if (m) result.id = m[1];
      }
      if (result.name === undefined) {
        const m2 = t.match(/b_hotel_name\s*:\s*'([^']+)'/);
        if (m2) result.name = m2[1];
      }
      const re = /large_url\s*:\s*'([^']+)'/g;
      let mm;
      while ((mm = re.exec(t)) !== null) {
        result.photos.push(mm[1]);
      }
    }
    result.photos = Array.from(new Set(result.photos));
    return result;
  }

  function mapToHotelSchema() {
    const jsonld = getJsonLd();
    const inline = extractFromInlineScripts();
    const name = jsonld?.name || inline.name || getTitle();
    const description = jsonld?.description;
    const addressObj = jsonld?.address;
    const addressText = getAddressText();
    const geo = getCoordinates(jsonld);
    const { ratingNumber, totalReviews } = getAggregateRating(jsonld);
    const amenities = getAmenities();
    const roomTypes = getRoomTypes();
    const photosInline = inline.photos && inline.photos.length ? inline.photos.map(src => ({ src })) : null;

    const hotel = {
      id: ensureNull(inline.id || null),
      name: ensureNull(name),
      brand: ensureNull(jsonld?.brand?.name || jsonld?.brand || null),
      category: null,
      description: ensureNull(description),
      shortDescription: null,
      status: null,
      isActive: null,
      isVerified: null,
      verificationDate: null,

      contact: {
        phone: {
          primary: null,
          secondary: null,
          reservations: null,
          concierge: null
        },
        email: {
          general: null,
          reservations: null,
          concierge: null,
          groupSales: null
        },
        website: ensureNull(location.href),
        socialMedia: {
          facebook: null,
          instagram: null,
          twitter: null,
          linkedin: null
        }
      },

      location: {
        address: {
          street: ensureNull(addressObj?.streetAddress || addressText || null),
          city: ensureNull(addressObj?.addressLocality || null),
          state: ensureNull(addressObj?.addressRegion || null),
          postalCode: ensureNull(addressObj?.postalCode || null),
          country: ensureNull((typeof addressObj?.addressCountry === 'object' ? addressObj?.addressCountry?.name : addressObj?.addressCountry) || null),
          countryCode: null
        },
        coordinates: geo ? { latitude: geo.latitude, longitude: geo.longitude, accuracy: null } : { latitude: null, longitude: null, accuracy: null },
        neighborhood: null,
        district: null,
        landmarks: null,
        airportDistance: null
      },

      amenities: amenities ? { general: amenities, dining: null, recreation: null, business: null, accessibility: null } : null,

      rooms: {
        totalRooms: null,
        roomTypes: roomTypes || null
      },

      dining: null,

      policies: {
        checkIn: { time: null, earlyCheckIn: null, lateCheckIn: null },
        checkOut: { time: null, lateCheckOut: null },
        cancellation: { freeCancellation: null, refundPolicy: null, noShowPolicy: null },
        petPolicy: { petsAllowed: null, petFee: null, petFeeType: null, petWeightLimit: null, petTypes: null },
        ageRestrictions: { minimumAge: null, childrenPolicy: null },
        smokingPolicy: null
      },

      reviews: {
        overallRating: ratingNumber ?? null,
        totalReviews: totalReviews ?? null,
        ratingBreakdown: null,
        recentReviews: null
      },

      awards: null,
      sustainability: null,
      languages: null,
      paymentMethods: null,
      accessibility: null,
      nearbyAttractions: null,
      transportation: null,
      businessFacilities: null,
      seasonalInformation: null,

      lastUpdated: new Date().toISOString(),
      version: '1.0',
      dataSource: 'Booking',
      language: document.documentElement?.lang || navigator.language || null,
      timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone) || null
    };

    const result = { scrapedAt: new Date().toISOString(), source: location.href, hotel };
    if (photosInline) {
      result.hotel.photos = photosInline;
    }
    return result;
  }

  function scrape() {
    return mapToHotelSchema();
  }

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

  window.__BOOKING_SCRAPER__ = { scrape };
})();


