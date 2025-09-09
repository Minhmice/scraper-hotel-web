(function () {
	function safeParseJson(text) {
		try {
			return JSON.parse(text);
		} catch (e) {
			return null;
		}
	}

	function getText(el) {
		return el ? (el.textContent || "").trim() : null;
	}

	function numberFromText(text) {
		if (typeof text !== "string") return null;
		const cleaned = text.replace(/[^0-9.\-]/g, "").trim();
		if (!cleaned) return null;
		const n = Number(cleaned);
		return Number.isFinite(n) ? n : null;
	}

	function isoNow() {
		try {
			return new Date().toISOString();
		} catch {
			return null;
		}
	}

	function getLanguage() {
		return (
			document.documentElement.getAttribute("lang") ||
			(navigator && (navigator.language || navigator.userLanguage)) ||
			null
		);
	}

	function getTimezone() {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
		} catch {
			return null;
		}
	}

	function getMeta(name) {
		const el = document.querySelector(`meta[name="${name}"]`);
		return el ? el.getAttribute("content")?.trim() || null : null;
	}

	function getOg(property) {
		const el = document.querySelector(`meta[property="${property}"]`);
		return el ? el.getAttribute("content")?.trim() || null : null;
	}

	function normalizePhone(text) {
		if (!text) return null;
		const cleaned = String(text).replace(/[^0-9+]/g, "");
		return cleaned || null;
	}

	function extractTelMailSocial() {
		const result = {
			phonePrimary: null,
			phoneSecondary: null,
			emailGeneral: null,
			facebook: null,
			instagram: null,
			twitter: null,
			linkedin: null
		};
		const tels = Array.from(document.querySelectorAll('a[href^="tel:"]'))
			.map((a) => a.getAttribute('href')?.replace(/^tel:/i, '') || '')
			.map(normalizePhone)
			.filter(Boolean);
		if (tels[0]) result.phonePrimary = tels[0];
		if (tels[1]) result.phoneSecondary = tels[1];
		const mails = Array.from(document.querySelectorAll('a[href^="mailto:"]'))
			.map((a) => (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0])
			.map((s) => s.trim())
			.filter(Boolean);
		if (mails[0]) result.emailGeneral = mails[0];
		const links = Array.from(document.querySelectorAll('a[href]'))
			.map((a) => a.getAttribute('href') || '')
			.filter(Boolean);
		for (const href of links) {
			if (!result.facebook && /facebook\.com\//i.test(href)) result.facebook = href;
			if (!result.instagram && /instagram\.com\//i.test(href)) result.instagram = href;
			if (!result.twitter && /(twitter|x)\.com\//i.test(href)) result.twitter = href;
			if (!result.linkedin && /linkedin\.com\//i.test(href)) result.linkedin = href;
		}
		return result;
	}

	function uniqueStrings(arr, limit) {
		const seen = new Set();
		const out = [];
		for (const s of arr) {
			if (!s) continue;
			if (!seen.has(s)) {
				seen.add(s);
				out.push(s);
				if (limit && out.length >= limit) break;
			}
		}
		return out;
	}

	function extractFromJsonLd() {
		const scripts = Array.from(
			document.querySelectorAll('script[type="application/ld+json"]')
		);
		for (const s of scripts) {
			const json = safeParseJson(s.textContent || "");
			if (!json) continue;
			const candidates = Array.isArray(json) ? json : [json];
			for (const node of candidates) {
				const type = node && (node["@type"] || node["@type"]);
				if (!type) continue;
				const types = Array.isArray(type) ? type : [type];
				if (types.includes("Hotel") || types.includes("LodgingBusiness")) {
					return node;
				}
			}
		}
		return null;
	}

	function extractFromNextData() {
		const el = document.querySelector('#__NEXT_DATA__');
		if (!el) return null;
		return safeParseJson(el.textContent || "");
	}

	function parseCoordinatesFromHasMap(hasMap) {
		if (typeof hasMap !== "string") return { latitude: null, longitude: null };
		try {
			const url = new URL(hasMap);
			const center = url.searchParams.get("center");
			if (center) {
				const [latStr, lngStr] = center.split(",");
				const lat = Number(latStr);
				const lng = Number(lngStr);
				if (Number.isFinite(lat) && Number.isFinite(lng)) {
					return { latitude: lat, longitude: lng };
				}
			}
		} catch {}
		return { latitude: null, longitude: null };
	}

	function parsePoliciesFromJsonLd(ld, out) {
		if (!ld || !out) return;
		const checkin = textOrNull(ld.checkinTime || ld.checkInTime);
		const checkout = textOrNull(ld.checkoutTime || ld.checkOutTime);
		if (checkin) out.policies.checkIn.time = checkin;
		if (checkout) out.policies.checkOut.time = checkout;
	}

	function parsePoliciesFromText(out) {
		const bodyText = (document.body && document.body.innerText) || '';
		if (!bodyText) return;
		const checkInMatch = bodyText.match(/check[- ]?in[^0-9]*([01]?\d|2[0-3]):([0-5]\d)/i);
		if (checkInMatch) out.policies.checkIn.time = `${checkInMatch[1].padStart(2, '0')}:${checkInMatch[2]}`;
		const checkOutMatch = bodyText.match(/check[- ]?out[^0-9]*([01]?\d|2[0-3]):([0-5]\d)/i);
		if (checkOutMatch) out.policies.checkOut.time = `${checkOutMatch[1].padStart(2, '0')}:${checkOutMatch[2]}`;
		if (/free cancellation/i.test(bodyText)) {
			out.policies.cancellation.freeCancellation = 'Free cancellation';
		}
		if (/non[- ]refundable/i.test(bodyText)) {
			out.policies.cancellation.refundPolicy = 'Non-refundable';
		}
		if (/no[- ]show/i.test(bodyText)) {
			out.policies.cancellation.noShowPolicy = 'No-show charges apply';
		}
		if (/pets? (allowed|friendly)/i.test(bodyText)) {
			out.policies.petPolicy.petsAllowed = true;
		} else if (/(no pets|pets? not allowed)/i.test(bodyText)) {
			out.policies.petPolicy.petsAllowed = false;
		}
	}

	function extractHotelIdFallback(nextData) {
		if (nextData) return null; // already attempted via nextData
		try {
			const url = new URL(location.href);
			const byParam = url.searchParams.get('hotelId') || url.searchParams.get('hotel_id') || url.searchParams.get('propertyId');
			if (byParam) return String(byParam).trim();
		} catch {}
		const attr = document.querySelector('[data-hotel-id],[data-hotelid]');
		if (attr) {
			const v = attr.getAttribute('data-hotel-id') || attr.getAttribute('data-hotelid');
			if (v) return String(v).trim();
		}
		return null;
	}

	function textOrNull(v) {
		if (v === undefined || v === null) return null;
		if (typeof v === "string") return v.trim() || null;
		return null;
	}

	function buildBaseSkeleton() {
		const nowIso = isoNow();
		const pageUrl = location.href;
		return {
			scrapedAt: nowIso,
			source: pageUrl,
			hotel: {
				id: null,
				name: null,
				brand: null,
				category: null,
				description: null,
				shortDescription: null,
				status: null,
				isActive: null,
				isVerified: null,
				verificationDate: null,
				contact: {
					phone: { primary: null, secondary: null, reservations: null, concierge: null },
					email: { general: null, reservations: null, concierge: null, groupSales: null },
					website: pageUrl,
					socialMedia: { facebook: null, instagram: null, twitter: null, linkedin: null }
				},
				location: {
					address: { street: null, city: null, state: null, postalCode: null, country: null, countryCode: null },
					coordinates: { latitude: null, longitude: null, accuracy: null },
					neighborhood: null,
					district: null,
					landmarks: null,
					airportDistance: null
				},
				amenities: null,
				rooms: { totalRooms: null, roomTypes: null },
				dining: null,
				policies: {
					checkIn: { time: null, earlyCheckIn: null, lateCheckIn: null },
					checkOut: { time: null, lateCheckOut: null },
					cancellation: { freeCancellation: null, refundPolicy: null, noShowPolicy: null },
					petPolicy: { petsAllowed: null, petFee: null, petFeeType: null, petWeightLimit: null, petTypes: null },
					ageRestrictions: { minimumAge: null, childrenPolicy: null },
					smokingPolicy: null
				},
				reviews: { overallRating: null, totalReviews: null, ratingBreakdown: null, recentReviews: null },
				awards: null,
				sustainability: null,
				languages: null,
				paymentMethods: null,
				accessibility: null,
				nearbyAttractions: null,
				transportation: null,
				businessFacilities: null,
				seasonalInformation: null,
				lastUpdated: nowIso,
				version: "1.0",
				dataSource: "Agoda",
				language: getLanguage(),
				timezone: getTimezone()
			}
		};
	}

	function extractDomText(selector) {
		const el = document.querySelector(selector);
		return el ? getText(el) : null;
	}

	function extractAmenities() {
		const items = Array.from(document.querySelectorAll('ul[data-selenium="facility-list"] li')).map((li) => getText(li)).filter(Boolean);
		if (!items.length) return null;
		return {
			general: items,
			dining: null,
			recreation: null,
			business: null,
			accessibility: null
		};
	}

	function extractRooms() {
		const roomCards = Array.from(document.querySelectorAll('[data-selenium="roomCard"]'));
		if (!roomCards.length) return { totalRooms: null, roomTypes: null };
		const roomTypes = roomCards.map((card) => {
			const name = extractFromDescendants(card, '[data-selenium="room-name"]');
			const size = extractFromDescendants(card, '[data-selenium="room-size"]');
			const occupancyText = extractFromDescendants(card, '[data-selenium="occupancy"]');
			const maxOccupancy = numberFromText(occupancyText);
			const bedConfiguration = extractFromDescendants(card, '[data-selenium="bed-config"]') ||
				(Array.from(card.querySelectorAll('li')).map((li) => getText(li)).filter(Boolean)[0] || null);
			const priceText = extractFromDescendants(card, '[data-selenium="final-price"], [data-selenium="price"]');
			const baseRate = numberFromText(priceText);
			return {
				id: null,
				name: name || null,
				description: null,
				size: size || null,
				maxOccupancy: maxOccupancy,
				bedConfiguration: bedConfiguration || null,
				amenities: null,
				pricing: baseRate != null ? { baseRate, currency: null, taxIncluded: null } : null
			};
		}).filter((r) => r.name || r.size || r.maxOccupancy != null || r.bedConfiguration || r.pricing);
		return {
			totalRooms: null,
			roomTypes: roomTypes.length ? roomTypes : null
		};
	}

	function extractFromDescendants(root, selector) {
		const el = root.querySelector(selector);
		return el ? getText(el) : null;
	}

	function extractTextByXPath(xpath) {
		try {
			const iterator = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
			const node = iterator.singleNodeValue;
			if (node) {
				const txt = (node.textContent || '').trim();
				return txt || null;
			}
		} catch {}
		return null;
	}

	function splitToList(text) {
		if (!text) return null;
		const tokens = String(text)
			.replace(/\s+/g, ' ')
			.split(/[,;•\n\r\t|·•●・]+/)
			.map((s) => s.trim())
			.filter(Boolean);
		return uniqueStrings(tokens);
	}

	function extractImages() {
		const imgs = Array.from(document.querySelectorAll('img[data-selenium*="gallery"], img[src*="agoda"]'))
			.map((img) => img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('srcset'))
			.filter(Boolean)
			.map((s) => (s || "").split(" ")[0].trim())
			.filter(Boolean);
		const unique = uniqueStrings(imgs, 50);
		if (!unique.length) return null;
		return unique.map((src) => ({ src }));
	}

	function build() {
		const data = buildBaseSkeleton();

		// Priority 1: JSON-LD
		const ld = extractFromJsonLd();
		if (ld) {
			data.hotel.name = textOrNull(ld.name) || data.hotel.name;
			data.hotel.description = textOrNull(ld.description) || data.hotel.description;
			// contact from JSON-LD if present
			if (ld.telephone && !data.hotel.contact.phone.primary) data.hotel.contact.phone.primary = normalizePhone(ld.telephone);
			if (ld.email && !data.hotel.contact.email.general) data.hotel.contact.email.general = textOrNull(ld.email);
			if (ld.address) {
				const a = ld.address;
				data.hotel.location.address.street = textOrNull(a.streetAddress) || data.hotel.location.address.street;
				data.hotel.location.address.city = textOrNull(a.addressLocality) || data.hotel.location.address.city;
				data.hotel.location.address.state = textOrNull(a.addressRegion) || data.hotel.location.address.state;
				data.hotel.location.address.postalCode = textOrNull(a.postalCode) || data.hotel.location.address.postalCode;
				data.hotel.location.address.country = textOrNull(a.addressCountry) || data.hotel.location.address.country;
			}
			if (ld.geo) {
				const lat = Number(ld.geo.latitude);
				const lng = Number(ld.geo.longitude);
				if (Number.isFinite(lat)) data.hotel.location.coordinates.latitude = lat;
				if (Number.isFinite(lng)) data.hotel.location.coordinates.longitude = lng;
			}
			if ((!data.hotel.location.coordinates.latitude || !data.hotel.location.coordinates.longitude) && ld.hasMap) {
				const { latitude, longitude } = parseCoordinatesFromHasMap(ld.hasMap);
				if (latitude != null) data.hotel.location.coordinates.latitude = latitude;
				if (longitude != null) data.hotel.location.coordinates.longitude = longitude;
			}
			if (ld.aggregateRating) {
				const ratingVal = Number(ld.aggregateRating.ratingValue);
				const reviewCnt = Number(ld.aggregateRating.reviewCount);
				data.hotel.reviews.overallRating = Number.isFinite(ratingVal) ? ratingVal : data.hotel.reviews.overallRating;
				data.hotel.reviews.totalReviews = Number.isFinite(reviewCnt) ? reviewCnt : data.hotel.reviews.totalReviews;
			}
			// policies from JSON-LD
			parsePoliciesFromJsonLd(ld, data.hotel);
		}

		// Priority 2: __NEXT_DATA__ or embedded JSON
		const nextData = extractFromNextData();
		if (nextData) {
			// Try common Agoda structures, defensive access
			// hotel id
			const hotelId =
				nextData?.props?.pageProps?.hotelId ||
				nextData?.props?.pageProps?.hotel?.id ||
				nextData?.query?.hotelId ||
				nextData?.state?.hotel?.id || null;
			if (hotelId != null) data.hotel.id = String(hotelId);

			// name
			const hotelName = nextData?.props?.pageProps?.hotel?.name || nextData?.props?.pageProps?.name;
			if (hotelName) data.hotel.name = textOrNull(hotelName) || data.hotel.name;

			// address-like
			const addr = nextData?.props?.pageProps?.hotel?.address || nextData?.props?.pageProps?.address;
			if (addr && typeof addr === 'object') {
				data.hotel.location.address.street = textOrNull(addr.street) || data.hotel.location.address.street;
				data.hotel.location.address.city = textOrNull(addr.city || addr.locality) || data.hotel.location.address.city;
				data.hotel.location.address.state = textOrNull(addr.state || addr.region) || data.hotel.location.address.state;
				data.hotel.location.address.postalCode = textOrNull(addr.postalCode || addr.zip) || data.hotel.location.address.postalCode;
				data.hotel.location.address.country = textOrNull(addr.country) || data.hotel.location.address.country;
			}

			// coordinates
			const lat = Number(
				nextData?.props?.pageProps?.hotel?.latitude ?? nextData?.props?.pageProps?.latitude ?? nextData?.props?.pageProps?.hotel?.lat
			);
			const lng = Number(
				nextData?.props?.pageProps?.hotel?.longitude ?? nextData?.props?.pageProps?.longitude ?? nextData?.props?.pageProps?.hotel?.lng
			);
			if (Number.isFinite(lat)) data.hotel.location.coordinates.latitude = lat;
			if (Number.isFinite(lng)) data.hotel.location.coordinates.longitude = lng;

			// rating
			const agg = nextData?.props?.pageProps?.hotel?.aggregateRating || nextData?.props?.pageProps?.aggregateRating;
			if (agg) {
				const ratingVal = Number(agg.ratingValue);
				const reviewCnt = Number(agg.reviewCount || agg.reviewTotal);
				if (Number.isFinite(ratingVal)) data.hotel.reviews.overallRating = ratingVal;
				if (Number.isFinite(reviewCnt)) data.hotel.reviews.totalReviews = reviewCnt;
			}

			// rooms (if available in state)
			const rooms = nextData?.props?.pageProps?.rooms || nextData?.props?.pageProps?.hotel?.rooms;
			if (Array.isArray(rooms) && rooms.length) {
				const mappedRooms = rooms.map((r) => {
					const name = textOrNull(r.name);
					const size = textOrNull(r.size || r.area);
					const maxOccupancy = r.maxOccupancy != null ? Number(r.maxOccupancy) : null;
					const bedConfiguration = textOrNull(r.bedConfiguration || r.bedType);
					const baseRate = r.price != null ? Number(r.price) : r.baseRate != null ? Number(r.baseRate) : null;
					return {
						id: null,
						name: name,
						description: null,
						size: size,
						maxOccupancy: Number.isFinite(maxOccupancy) ? maxOccupancy : null,
						bedConfiguration: bedConfiguration,
						amenities: null,
						pricing: Number.isFinite(baseRate) ? { baseRate, currency: null, taxIncluded: null } : null
					};
				}).filter((r) => r.name || r.size || r.maxOccupancy != null || r.bedConfiguration || r.pricing);
				if (mappedRooms.length) data.hotel.rooms.roomTypes = mappedRooms;
			}
		}

		// Priority 3: Meta tags
		if (!data.hotel.name) {
			const ogTitle = getOg('og:title') || document.title;
			if (ogTitle) {
				data.hotel.name = ogTitle.replace(/\s*-\s*Agoda\s*$/i, '').trim();
			}
		}
		if (!data.hotel.description) {
			data.hotel.description = getOg('og:description') || getMeta('description') || null;
		}

		// Priority 4: DOM selectors
		if (!data.hotel.name) {
			data.hotel.name = extractDomText('h1[data-selenium="hotel-header-name"]') || null;
		}
		if (!data.hotel.location.address.street && !data.hotel.location.address.city) {
			const addr = extractDomText('span[data-selenium="hotel-address-map"], [data-selenium="address-text"]');
			if (addr) {
				// Best effort: fill street into street, leave structured parts null if not parseable
				data.hotel.location.address.street = addr;
			}
		}

		// Amenities and rooms from DOM
		const amenities = extractAmenities();
		if (amenities) data.hotel.amenities = amenities;
		const roomsDom = extractRooms();
		if (roomsDom && roomsDom.roomTypes) data.hotel.rooms = roomsDom;

		// Parking (transportation) via provided XPath
		const parkingXPath = '/html/body/div[11]/div/div[5]/div/div[2]/div/div[4]/div[4]/div/div/div[2]/div/div[3]/div[10]';
		const parkingText = extractTextByXPath(parkingXPath);
		if (parkingText) {
			data.hotel.transportation = { parking: parkingText };
		}

		// Business facilities via provided XPath
		const facilitiesXPath = '/html/body/div[11]/div/div[5]/div/div[2]/div/div[4]/div[4]/div/div/div[2]/div/div[3]/div[12]';
		const facilitiesText = extractTextByXPath(facilitiesXPath);
		if (facilitiesText) {
			data.hotel.businessFacilities = facilitiesText;
		}

		// Languages via provided XPath
		const languagesXPath = '/html/body/div[11]/div/div[5]/div/div[2]/div/div[4]/div[4]/div/div/div[2]/div/div[3]/div[1]';
		const languagesText = extractTextByXPath(languagesXPath);
		if (languagesText) {
			const items = splitToList(languagesText);
			if (items && items.length) data.hotel.languages = items;
		}

		// Reviews from DOM if still missing
		if (data.hotel.reviews.overallRating == null) {
			const r = extractDomText('[data-selenium="review-score"]');
			const rv = numberFromText(r);
			if (rv != null) data.hotel.reviews.overallRating = rv;
		}
		if (data.hotel.reviews.totalReviews == null) {
			const c = extractDomText('[data-selenium="review-count"]');
			const cv = numberFromText(c);
			if (cv != null) data.hotel.reviews.totalReviews = cv;
		}

		// Policies and contacts from DOM text
		parsePoliciesFromText(data.hotel);
		const tms = extractTelMailSocial();
		if (tms.phonePrimary) data.hotel.contact.phone.primary = tms.phonePrimary;
		if (tms.phoneSecondary) data.hotel.contact.phone.secondary = tms.phoneSecondary;
		if (tms.emailGeneral) data.hotel.contact.email.general = tms.emailGeneral;
		if (tms.facebook) data.hotel.contact.socialMedia.facebook = tms.facebook;
		if (tms.instagram) data.hotel.contact.socialMedia.instagram = tms.instagram;
		if (tms.twitter) data.hotel.contact.socialMedia.twitter = tms.twitter;
		if (tms.linkedin) data.hotel.contact.socialMedia.linkedin = tms.linkedin;

		// Hotel ID fallback
		if (!data.hotel.id) {
			const idFallback = extractHotelIdFallback(nextData);
			if (idFallback) data.hotel.id = idFallback;
		}

		return data;
	}

	function sendScrapedData() {
		const data = build();
		return data;
	}

	// Expose for console/debug and allow messaging
	window.__AGODA_SCRAPE__ = sendScrapedData;

	chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		if (msg && msg.type === 'AGODA_SCRAPE_REQUEST') {
			try {
				const data = sendScrapedData();
				sendResponse({ ok: true, data });
			} catch (e) {
				sendResponse({ ok: false, error: String(e && e.message || e) });
			}
			return true;
		}
	});
})();


