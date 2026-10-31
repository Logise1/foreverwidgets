const SANTA_GIFTS_TOTAL = 8000000000;

function santaPad(n) {
    return n < 10 ? '0' + n : String(n);
}

function santaLocName(stop) {
    if (!stop) return '';
    return stop.region ? `${stop.city}, ${stop.region}` : stop.city;
}

function santaFormatDuration(ms) {
    if (!ms || ms < 0) ms = 0;
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (d > 0) return `${d}d ${santaPad(h)}:${santaPad(m)}:${santaPad(s)}`;
    if (h > 0) return `${santaPad(h)}:${santaPad(m)}:${santaPad(s)}`;
    return `${santaPad(m)}:${santaPad(s)}`;
}

function santaFormatNumber(n) {
    return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

function santaHaversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 0;
    const R = 6371;
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function santaMapRoute(raw, takeoffUtc) {
    const base = raw[0]?.arrival || 1577181600000;
    return raw.map((stop, idx) => {
        const elapsed = stop.arrival ? (stop.arrival - base) : (idx * 300000);
        return { ...stop, arrival: takeoffUtc + elapsed, index: idx };
    });
}

function santaTakeoffUtc(raw, now = getNow()) {
    const base = raw[0]?.arrival || 1577181600000;
    const last = raw[raw.length - 1]?.arrival || base;
    const journeyMs = last - base;
    const year = new Date(now).getUTCFullYear();
    let takeoff = Date.UTC(year, 11, 24, 10, 0, 0);
    if (now > takeoff + journeyMs) takeoff = Date.UTC(year + 1, 11, 24, 10, 0, 0);
    return takeoff;
}

async function loadSantaRoute(now = getNow()) {
    const response = await fetch('../route.json');
    const raw = await response.json();
    const takeoff = santaTakeoffUtc(raw, now);
    return santaMapRoute(raw, takeoff);
}

function santaFindStop(route, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    return route.find((stop) => stop.id === q)
        || route.find((stop) => stop.city.toLowerCase() === q)
        || route.find((stop) => stop.city.toLowerCase().startsWith(q))
        || route.find((stop) => santaLocName(stop).toLowerCase().includes(q))
        || route.find((stop) => (stop.region || '').toLowerCase().includes(q));
}

function santaDistanceKm(route, uptoIndex, fraction = 0) {
    let km = 0;
    const last = Math.min(uptoIndex, route.length - 1);
    for (let i = 1; i <= last; i++) {
        km += santaHaversineKm(route[i - 1].location_coords, route[i].location_coords);
    }
    if (fraction > 0 && last + 1 < route.length) {
        km += santaHaversineKm(route[last].location_coords, route[last + 1].location_coords) * fraction;
    }
    return km;
}

function santaState(route, now = getNow()) {
    const takeoff = route[0].arrival;
    const landing = route[route.length - 1].arrival;
    let currentIndex = -1;
    if (now >= takeoff) {
        for (let i = 0; i < route.length; i++) {
            if (now >= route[i].arrival) currentIndex = i;
            else break;
        }
    }

    let phase = 'pre';
    if (now >= landing) phase = 'done';
    else if (now >= takeoff) phase = 'flying';

    const current = currentIndex >= 0 ? route[currentIndex] : null;
    const next = currentIndex < route.length - 1 ? route[currentIndex + 1] : null;
    const upcomingStart = currentIndex === -1 ? 0 : currentIndex + 1;
    const upcoming = route.slice(Math.max(0, upcomingStart));

    let progress = 0;
    if (now >= landing) progress = 1;
    else if (now > takeoff) progress = (now - takeoff) / (landing - takeoff);

    let hopFraction = 0;
    if (phase === 'flying' && current && next) {
        const span = next.arrival - current.arrival;
        hopFraction = span > 0 ? Math.min(1, Math.max(0, (now - current.arrival) / span)) : 0;
    }

    const visited = currentIndex < 0 ? 0 : currentIndex + 1;
    const kmFlown = currentIndex < 0 ? 0 : santaDistanceKm(route, currentIndex, hopFraction);
    const kmTotal = santaDistanceKm(route, route.length - 1);

    return {
        phase,
        currentIndex,
        current,
        next,
        upcoming,
        progress,
        gifts: Math.floor(SANTA_GIFTS_TOTAL * progress),
        takeoff,
        landing,
        total: route.length,
        visited,
        remaining: Math.max(0, route.length - visited),
        kmFlown,
        kmTotal,
        hopFraction
    };
}

function santaClipFact(text, max = 220) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const slice = clean.slice(0, max);
    const end = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
    return (end > 80 ? slice.slice(0, end + 1) : slice.trim()) + (end > 80 ? '' : '…');
}
