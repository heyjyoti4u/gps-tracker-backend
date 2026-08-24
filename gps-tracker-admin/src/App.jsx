import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet/dist/leaflet.css';

import markerIconPng from 'leaflet/dist/images/marker-icon.png';
import markerShadowPng from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIconPng,
    shadowUrl: markerShadowPng,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// =================================================================
// Turn-by-turn maneuver icons
// =================================================================
const MANEUVER_ROTATION = {
    Straight: 0,
    SlightRight: 30,
    Right: 90,
    SharpRight: 135,
    TurnAround: 180,
    SharpLeft: -135,
    Left: -90,
    SlightLeft: -30
};

const ManeuverIcon = ({ type, size = 22, color = '#1a1a1a' }) => {
    if (type === 'Roundabout') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="7" stroke={color} strokeWidth="2" />
                <path d="M12 5 L15 8 L12 8" fill={color} />
            </svg>
        );
    }
    if (type === 'WaypointReached' || type === 'DestinationReached') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <path d="M6 3v18M6 4h11l-2.5 3.5L17 11H6" stroke={color} strokeWidth="2" strokeLinejoin="round" />
            </svg>
        );
    }
    if (type === 'StartAt') {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="6" fill="#22c55e" />
            </svg>
        );
    }
    const rotation = MANEUVER_ROTATION[type] ?? 0;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s' }}>
            <path d="M12 3v16M12 3l-5 5M12 3l5 5" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
};

// =================================================================
// Helpers
// =================================================================
const formatDistance = (meters) => (meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`);

const formatDuration = (seconds) => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} hr ${m} min`;
};

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

const haversine = (a, b) => {
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

const bearing = (a, b) => {
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const nearestCoordIndex = (coords, point) => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < coords.length; i++) {
        const d = haversine({ lat: coords[i].lat, lng: coords[i].lng }, point);
        if (d < bestDist) {
            bestDist = d;
            best = i;
        }
    }
    return { index: best, distance: bestDist };
};

// =================================================================
// Place autocomplete input (search-as-you-type, Nominatim powered)
// =================================================================
const SURAT_VIEWBOX = '72.70,21.30,73.00,21.05';

const PlaceAutocomplete = ({ placeholder, value, onChange, onSelect, extraButton }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const [loadingSuggest, setLoadingSuggest] = useState(false);
    const debounceRef = useRef(null);
    const wrapRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const handleInput = (text) => {
        onChange(text);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (text.trim().length < 2) {
            setSuggestions([]);
            setOpen(false);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setLoadingSuggest(true);
            try {
                const url =
                    `https://nominatim.openstreetmap.org/search?format=json` +
                    `&q=${encodeURIComponent(text)}&countrycodes=in` +
                    `&viewbox=${SURAT_VIEWBOX}&bounded=0&limit=6&addressdetails=1`;
                const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
                const data = await res.json();
                setSuggestions(data || []);
                setOpen(true);
            } catch (err) {
                console.error('Autocomplete error:', err);
            } finally {
                setLoadingSuggest(false);
            }
        }, 350);
    };

    const pick = (item) => {
        const label = item.display_name.split(',').slice(0, 2).join(',');
        onChange(label);
        onSelect({ lat: parseFloat(item.lat), lng: parseFloat(item.lon), label: item.display_name });
        setOpen(false);
        setSuggestions([]);
    };

    return (
        <div ref={wrapRef} style={{ position: 'relative', marginBottom: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => handleInput(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setOpen(true)}
                    style={inputStyle}
                    autoComplete="off"
                />
                {extraButton}
            </div>
            {open && (suggestions.length > 0 || loadingSuggest) && (
                <div style={dropdownStyle}>
                    {loadingSuggest && <div style={{ padding: '10px 14px', fontSize: '13px', color: '#888' }}>Searching...</div>}
                    {suggestions.map((s) => (
                        <div
                            key={s.place_id}
                            onClick={() => pick(s)}
                            style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #f1f3f4', color: '#202124' }}
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <div style={{ fontWeight: 600 }}>{s.display_name.split(',')[0]}</div>
                            <div style={{ fontSize: '11.5px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.display_name}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// =================================================================
// POI (recommendations) config + Overpass fetch
// =================================================================
const POI_TYPES = [
    { key: 'restaurant', label: 'Restaurants', emoji: '🍽️', query: 'node["amenity"="restaurant"]' },
    { key: 'fuel', label: 'Petrol Pump', emoji: '⛽', query: 'node["amenity"="fuel"]' },
    { key: 'atm', label: 'ATM', emoji: '🏧', query: 'node["amenity"="atm"]' },
    { key: 'hotel', label: 'Hotels', emoji: '🏨', query: 'node["tourism"="hotel"]' }
];

const fetchPOIs = async (typeKey, bounds) => {
    const type = POI_TYPES.find((t) => t.key === typeKey);
    if (!type || !bounds) return [];
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    const query = `[out:json][timeout:15];${type.query}(${bbox});out center 25;`;
    try {
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await res.json();
        return (data.elements || [])
            .filter((el) => el.lat && el.lon)
            .map((el) => ({
                id: el.id,
                lat: el.lat,
                lng: el.lon,
                name: el.tags?.name || type.label,
                type: typeKey
            }));
    } catch (err) {
        console.error('POI fetch error:', err);
        return [];
    }
};

// =================================================================
// POI markers layer on the map
// =================================================================
const PoiLayer = ({ pois, onSelect }) => {
    const map = useMap();
    const markersRef = useRef([]);

    useEffect(() => {
        markersRef.current.forEach((m) => map.removeLayer(m));
        markersRef.current = [];

        pois.forEach((poi) => {
            const type = POI_TYPES.find((t) => t.key === poi.type);
            const icon = L.divIcon({
                className: '',
                html: `<div style="background:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);font-size:15px;border:2px solid #fff;">${type?.emoji || '📍'}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            const marker = L.marker([poi.lat, poi.lng], { icon }).addTo(map);
            marker.bindPopup(`<b>${poi.name}</b>`);
            marker.on('click', () => onSelect(poi));
            markersRef.current.push(marker);
        });

        return () => {
            markersRef.current.forEach((m) => map.removeLayer(m));
            markersRef.current = [];
        };
    }, [map, pois, onSelect]);

    return null;
};

// =================================================================
// Routing layer
// =================================================================
const MapRouting = ({ start, end, onRouteFound }) => {
    const map = useMap();
    const controlRef = useRef(null);

    useEffect(() => {
        if (!start || !end) return;

        if (controlRef.current) {
            map.removeControl(controlRef.current);
            controlRef.current = null;
        }

        const routingControl = L.Routing.control({
            waypoints: [L.latLng(start.lat, start.lng), L.latLng(end.lat, end.lng)],
            router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1', profile: 'driving' }),
            routeWhileDragging: false,
            addWaypoints: false,
            fitSelectedRoutes: false,
            showAlternatives: false,
            show: false,
            createMarker: () => null,
            lineOptions: { styles: [{ color: '#4285F4', weight: 7, opacity: 0.9 }] }
        }).addTo(map);

        const startIcon = L.divIcon({
            className: '',
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        const endIcon = L.divIcon({
            className: '',
            html: `<div style="width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:22px solid #ea4335;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));"></div>`,
            iconSize: [18, 22],
            iconAnchor: [9, 22]
        });
        const startMarker = L.marker([start.lat, start.lng], { icon: startIcon }).addTo(map);
        const endMarker = L.marker([end.lat, end.lng], { icon: endIcon }).addTo(map);

        routingControl.on('routesfound', (e) => {
            const route = e.routes[0];
            const bounds = L.latLngBounds(route.coordinates);
            const isMobile = window.innerWidth < 640;
            map.flyToBounds(bounds, {
                paddingTopLeft: isMobile ? [40, 40] : [380, 40],
                paddingBottomRight: isMobile ? [40, 260] : [40, 40],
                maxZoom: 17,
                duration: 1.2
            });

            onRouteFound({
                distance: route.summary.totalDistance,
                time: route.summary.totalTime,
                coordinates: route.coordinates.map((c) => ({ lat: c.lat, lng: c.lng })),
                bounds,
                road: route.instructions?.[1]?.road || '',
                steps: route.instructions.map((ins) => ({
                    text: ins.text,
                    type: ins.type,
                    distance: ins.distance,
                    time: ins.time,
                    index: ins.index
                }))
            });
        });

        routingControl.on('routingerror', () => {
            alert('Route nahi mil paya. Locations check karke dobara try karo.');
        });

        controlRef.current = routingControl;

        return () => {
            map.removeControl(routingControl);
            map.removeLayer(startMarker);
            map.removeLayer(endMarker);
        };
    }, [map, start, end, onRouteFound]);

    return null;
};

// =================================================================
// Live navigation follower
// =================================================================
const NavFollower = ({ position, heading }) => {
    const map = useMap();
    const markerRef = useRef(null);

    useEffect(() => {
        if (!position) return;
        if (!markerRef.current) {
            const navIcon = L.divIcon({
                className: '',
                html: `<div id="nav-arrow" style="width:26px;height:26px;transform:rotate(${heading || 0}deg);transition:transform 0.3s;">
                         <svg viewBox="0 0 24 24" width="26" height="26">
                           <path d="M12 2 L20 20 L12 16 L4 20 Z" fill="#4285F4" stroke="white" stroke-width="1.5"/>
                         </svg>
                       </div>`,
                iconSize: [26, 26],
                iconAnchor: [13, 13]
            });
            markerRef.current = L.marker([position.lat, position.lng], { icon: navIcon, zIndexOffset: 1000 }).addTo(map);
        } else {
            markerRef.current.setLatLng([position.lat, position.lng]);
            const el = markerRef.current.getElement()?.querySelector('#nav-arrow');
            if (el) el.style.transform = `rotate(${heading || 0}deg)`;
        }
        map.flyTo([position.lat, position.lng], 18, { duration: 0.6 });
    }, [map, position, heading]);

    useEffect(() => {
        return () => {
            if (markerRef.current) map.removeLayer(markerRef.current);
        };
    }, [map]);

    return null;
};

// =================================================================
// Bounds capture helper (so POI search can use current route bounds)
// =================================================================
const BoundsCapture = ({ onCapture }) => {
    const map = useMap();
    useEffect(() => {
        onCapture(map);
    }, [map, onCapture]);
    return null;
};

// =================================================================
// Main app
// =================================================================
function App() {
    const [startCoords, setStartCoords] = useState(null);
    const [endCoords, setEndCoords] = useState(null);
    const [startText, setStartText] = useState('');
    const [endText, setEndText] = useState('');
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(true);

    const [routeInfo, setRouteInfo] = useState(null);
    const [showSteps, setShowSteps] = useState(false);
    const [panelExpanded, setPanelExpanded] = useState(true); // mobile bottom-sheet toggle

    const [navigating, setNavigating] = useState(false);
    const [userPos, setUserPos] = useState(null);
    const [heading, setHeading] = useState(0);
    const [currentStepIdx, setCurrentStepIdx] = useState(0);
    const watchIdRef = useRef(null);
    const lastPosRef = useRef(null);

    // POI / recommendations
    const [activePoiType, setActivePoiType] = useState(null);
    const [pois, setPois] = useState([]);
    const [poiLoading, setPoiLoading] = useState(false);
    const [selectedPoi, setSelectedPoi] = useState(null);
    const mapRef = useRef(null);

    const handleCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setStartCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
                    setStartText('My Current Location');
                },
                () => alert('Location access denied.')
            );
        }
    };

    const geocode = async (address) => {
        try {
            const url =
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}` +
                `&countrycodes=in&viewbox=${SURAT_VIEWBOX}&bounded=0&limit=1&addressdetails=1`;
            const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
            const data = await res.json();
            if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
        } catch (err) {
            console.error('Geocoding error:', err);
        }
        return null;
    };

    const handleFindRoute = async () => {
        if (!startText || !endText) {
            alert('Please enter both locations.');
            return;
        }
        setLoading(true);
        setRouteInfo(null);
        setPois([]);
        setActivePoiType(null);

        let startTemp = startCoords;
        if (startText !== 'My Current Location' && !startTemp) startTemp = await geocode(startText);
        let endTemp = endCoords || (await geocode(endText));

        if (startTemp && endTemp) {
            setStartCoords(startTemp);
            setEndCoords(endTemp);
            setEditing(false);
            setPanelExpanded(false);
        } else {
            alert("Could not find accurate location. Try being more specific (e.g., 'VR Mall, Surat').");
        }
        setLoading(false);
    };

    const handleBack = () => {
        if (navigating) return;
        setEditing(true);
        setRouteInfo(null);
        setEndCoords(null);
        setPois([]);
        setActivePoiType(null);
    };

    const togglePoi = async (typeKey) => {
        if (activePoiType === typeKey) {
            setActivePoiType(null);
            setPois([]);
            return;
        }
        setActivePoiType(typeKey);
        setPoiLoading(true);
        const bounds = routeInfo?.bounds || (mapRef.current && mapRef.current.getBounds());
        const results = await fetchPOIs(typeKey, bounds);
        setPois(results);
        setPoiLoading(false);
    };

    const flyToPoi = (poi) => {
        setSelectedPoi(poi);
        if (mapRef.current) mapRef.current.flyTo([poi.lat, poi.lng], 17, { duration: 0.8 });
    };

    // ---------------- Start driving ----------------
    const startNavigation = () => {
        if (!navigator.geolocation || !routeInfo) return;
        setNavigating(true);
        setCurrentStepIdx(0);
        setPois([]);
        setActivePoiType(null);

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const point = { lat: position.coords.latitude, lng: position.coords.longitude };
                let hd = position.coords.heading;
                if (hd == null || Number.isNaN(hd)) {
                    hd = lastPosRef.current ? bearing(lastPosRef.current, point) : 0;
                }
                lastPosRef.current = point;
                setUserPos(point);
                setHeading(hd);

                const { index } = nearestCoordIndex(routeInfo.coordinates, point);
                let stepIdx = 0;
                for (let i = 0; i < routeInfo.steps.length; i++) {
                    if (routeInfo.steps[i].index <= index) stepIdx = i;
                }
                setCurrentStepIdx(stepIdx);
            },
            (err) => {
                console.error(err);
                alert('Live location track nahi ho paayi. GPS/location permission check karo.');
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
        );
    };

    const stopNavigation = () => {
        if (watchIdRef.current != null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        lastPosRef.current = null;
        setNavigating(false);
        setUserPos(null);
    };

    useEffect(() => {
        return () => {
            if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, []);

    const currentStep = routeInfo?.steps?.[currentStepIdx];
    const nextStep = routeInfo?.steps?.[currentStepIdx + 1];

    return (
        <div className="app-root">
            <style>{RESPONSIVE_CSS}</style>

            {/* ============== Live navigation banner ============== */}
            {navigating && currentStep && (
                <div className="nav-banner">
                    <div className="nav-banner-icon">
                        <ManeuverIcon type={currentStep.type} size={30} color="#1a73e8" />
                    </div>
                    <div className="nav-banner-text">
                        <div className="nav-banner-distance">{formatDistance(currentStep.distance)}</div>
                        <div className="nav-banner-instruction">{currentStep.text}</div>
                        {nextStep && <div className="nav-banner-next">Then: {nextStep.text}</div>}
                    </div>
                    <button onClick={stopNavigation} className="nav-banner-close" title="Exit navigation">✕</button>
                </div>
            )}

            {/* ============== Control panel ============== */}
            {!navigating && (
                <div className={`panel ${panelExpanded ? 'panel-expanded' : 'panel-collapsed'}`}>
                    <div className="panel-drag-handle" onClick={() => setPanelExpanded((v) => !v)} />

                    {editing ? (
                        <div className="panel-inner">
                            <h3 className="panel-title">Plan Delivery</h3>
                            <PlaceAutocomplete
                                placeholder="Start (e.g., Udhana)"
                                value={startText}
                                onChange={setStartText}
                                onSelect={(place) => { setStartCoords(place); setStartText(place.label.split(',').slice(0, 2).join(',')); }}
                            />
                            <button onClick={handleCurrentLocation} className="ghost-btn" style={{ marginBottom: '10px' }}>
                                📍 Use My Location
                            </button>
                            <PlaceAutocomplete
                                placeholder="Destination (e.g., VR Mall)"
                                value={endText}
                                onChange={setEndText}
                                onSelect={(place) => { setEndCoords(place); setEndText(place.label.split(',').slice(0, 2).join(',')); }}
                            />
                            <button onClick={handleFindRoute} disabled={loading} className="primary-btn">
                                {loading ? 'Calculating...' : 'Get Route'}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="panel-header">
                                <button onClick={handleBack} className="icon-btn" title="Back">←</button>
                                <div className="panel-header-text">
                                    <div className="ellipsis">from <b>{startText}</b></div>
                                    <div className="ellipsis">to <b>{endText}</b></div>
                                </div>
                            </div>

                            {routeInfo && (
                                <div className="panel-scroll">
                                    <div className="summary-block">
                                        <div className="summary-time">
                                            {formatDuration(routeInfo.time)}{' '}
                                            <span className="summary-dist">({formatDistance(routeInfo.distance)})</span>
                                        </div>
                                        {routeInfo.road && <div className="summary-road">via {routeInfo.road}</div>}
                                        <div className="summary-note">Fastest route, based on live map data</div>
                                        <button onClick={startNavigation} className="primary-btn" style={{ marginTop: '12px' }}>
                                            🚗 Start driving
                                        </button>
                                    </div>

                                    {/* POI recommendation buttons */}
                                    <div className="poi-buttons">
                                        {POI_TYPES.map((t) => (
                                            <button
                                                key={t.key}
                                                onClick={() => togglePoi(t.key)}
                                                className={`poi-chip ${activePoiType === t.key ? 'poi-chip-active' : ''}`}
                                            >
                                                <span>{t.emoji}</span> {t.label}
                                            </button>
                                        ))}
                                    </div>

                                    {activePoiType && (
                                        <div className="poi-results">
                                            {poiLoading && <div className="poi-loading">Dhoondh raha hu...</div>}
                                            {!poiLoading && pois.length === 0 && <div className="poi-loading">Kuch nahi mila is area mein.</div>}
                                            {!poiLoading &&
                                                pois.map((poi) => (
                                                    <div key={poi.id} className="poi-row" onClick={() => flyToPoi(poi)}>
                                                        <span className="poi-emoji">{POI_TYPES.find((t) => t.key === poi.type)?.emoji}</span>
                                                        <span className="poi-name ellipsis">{poi.name}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    )}

                                    <button onClick={() => setShowSteps((s) => !s)} className="ghost-btn" style={{ margin: '10px 14px', width: 'calc(100% - 28px)' }}>
                                        {showSteps ? 'Hide turn-by-turn steps' : 'Show turn-by-turn steps'}
                                    </button>
                                    {showSteps && (
                                        <div>
                                            {routeInfo.steps.map((step, i) => (
                                                <div key={i} className="step-row">
                                                    <div className="step-icon"><ManeuverIcon type={step.type} /></div>
                                                    <div className="step-text">
                                                        <div>{step.text}</div>
                                                        <div className="step-meta">
                                                            {formatDistance(step.distance)}{step.time ? ` · ${formatDuration(step.time)}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            <MapContainer center={[21.1702, 72.8311]} zoom={12} zoomControl={false} className="map-container">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <BoundsCapture onCapture={(map) => { mapRef.current = map; }} />
                {startCoords && endCoords && <MapRouting start={startCoords} end={endCoords} onRouteFound={setRouteInfo} />}
                {navigating && userPos && <NavFollower position={userPos} heading={heading} />}
                {pois.length > 0 && <PoiLayer pois={pois} onSelect={setSelectedPoi} />}
            </MapContainer>

            <div className="fab-column">
                <button onClick={handleCurrentLocation} className="fab" title="My location">🎯</button>
            </div>

            {selectedPoi && !navigating && (
                <div className="poi-card">
                    <div className="poi-card-title">{POI_TYPES.find((t) => t.key === selectedPoi.type)?.emoji} {selectedPoi.name}</div>
                    <button className="poi-card-close" onClick={() => setSelectedPoi(null)}>✕</button>
                </div>
            )}
        </div>
    );
}

const inputStyle = {
    flex: 1,
    padding: '12px 14px',
    boxSizing: 'border-box',
    border: '1px solid #dadce0',
    borderRadius: '8px',
    fontSize: '16px', // 16px prevents iOS auto-zoom on focus
    outline: 'none'
};

const dropdownStyle = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: 'white',
    borderRadius: '10px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    zIndex: 2000,
    maxHeight: '220px',
    overflowY: 'auto'
};

const RESPONSIVE_CSS = `
  * { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; }
  .app-root {
    position: relative;
    width: 100vw;
    height: 100dvh; /* real mobile viewport height, avoids browser-bar jump */
    font-family: 'Google Sans', Roboto, system-ui, sans-serif;
    overflow: hidden;
  }
  .map-container { height: 100%; width: 100%; }

  .panel {
    position: absolute;
    z-index: 1000;
    background: white;
    box-shadow: 0 4px 20px rgba(0,0,0,0.22);
    top: 16px;
    left: 16px;
    width: 340px;
    max-height: calc(100dvh - 32px);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .panel-drag-handle { display: none; }
  .panel-inner { padding: 18px; }
  .panel-title { margin: 0 0 15px 0; color: #202124; }
  .panel-header { display: flex; align-items: flex-start; padding: 14px 14px 10px 14px; gap: 10px; }
  .panel-header-text { flex: 1; min-width: 0; font-size: 13px; color: #3c4043; line-height: 1.6; }
  .panel-scroll { overflow-y: auto; }
  .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .summary-block { padding: 4px 18px 14px 18px; border-bottom: 1px solid #eee; }
  .summary-time { font-size: 26px; font-weight: 700; color: #1a73e8; }
  .summary-dist { font-size: 15px; font-weight: 400; color: #5f6368; }
  .summary-road { font-size: 13px; color: #5f6368; margin-top: 2px; }
  .summary-note { font-size: 12px; color: #188038; margin-top: 2px; }

  .poi-buttons { display: flex; gap: 8px; padding: 12px 14px; overflow-x: auto; }
  .poi-chip {
    flex-shrink: 0; display: flex; align-items: center; gap: 6px;
    background: #f1f3f4; border: 1px solid transparent; border-radius: 20px;
    padding: 9px 14px; font-size: 13px; cursor: pointer; color: #3c4043; white-space: nowrap;
    min-height: 40px;
  }
  .poi-chip-active { background: #e8f0fe; border-color: #1a73e8; color: #1a73e8; font-weight: 600; }

  .poi-results { max-height: 160px; overflow-y: auto; padding: 0 8px 8px 8px; }
  .poi-loading { padding: 10px 14px; font-size: 13px; color: #888; }
  .poi-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; cursor: pointer; border-radius: 8px; }
  .poi-row:hover { background: #f8f9fa; }
  .poi-emoji { font-size: 16px; flex-shrink: 0; }
  .poi-name { font-size: 13.5px; color: #202124; }

  .step-row { display: flex; gap: 12px; padding: 10px 14px; border-bottom: 1px solid #f1f3f4; align-items: flex-start; }
  .step-icon { flex-shrink: 0; margin-top: 2px; }
  .step-text { flex: 1; min-width: 0; font-size: 13.5px; color: #202124; line-height: 1.4; }
  .step-meta { font-size: 11.5px; color: #888; margin-top: 2px; }

  .primary-btn {
    width: 100%; padding: 13px; background: #1a73e8; color: white; border: none;
    border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 15px; min-height: 46px;
  }
  .ghost-btn {
    font-size: 13px; cursor: pointer; background: #f1f3f4; border: none;
    padding: 10px 12px; border-radius: 8px; color: #3c4043; min-height: 40px;
  }
  .icon-btn {
    background: #f1f3f4; border: none; width: 38px; height: 38px; border-radius: 50%;
    cursor: pointer; font-size: 16px; flex-shrink: 0;
  }

  .fab-column {
    position: absolute; z-index: 1000; display: flex; flex-direction: column; gap: 10px;
    bottom: calc(24px + env(safe-area-inset-bottom, 0px)); right: 16px;
  }
  .fab {
    width: 46px; height: 46px; border-radius: 50%; background: white; border: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; font-size: 19px;
  }

  .nav-banner {
    position: absolute; z-index: 1100; background: #1a73e8; color: white; border-radius: 14px;
    padding: 16px 18px; box-shadow: 0 4px 20px rgba(0,0,0,0.35); display: flex; align-items: center; gap: 14px;
    top: calc(16px + env(safe-area-inset-top, 0px)); left: 16px; right: 16px;
  }
  .nav-banner-icon { background: white; border-radius: 10px; padding: 8px; flex-shrink: 0; }
  .nav-banner-text { flex: 1; min-width: 0; }
  .nav-banner-distance { font-size: 22px; font-weight: 700; line-height: 1.15; }
  .nav-banner-instruction { font-size: 14px; opacity: 0.95; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-banner-next { font-size: 12px; opacity: 0.75; margin-top: 2px; }
  .nav-banner-close {
    background: rgba(255,255,255,0.2); border: none; color: white; width: 34px; height: 34px;
    border-radius: 50%; cursor: pointer; font-size: 16px; flex-shrink: 0;
  }

  .poi-card {
    position: absolute; z-index: 1050; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); left: 16px; right: 78px;
    background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;
  }
  .poi-card-title { font-size: 14px; font-weight: 600; color: #202124; }
  .poi-card-close { background: none; border: none; font-size: 14px; cursor: pointer; color: #888; }

  /* ================= MOBILE ================= */
  @media (max-width: 640px) {
    .panel {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      border-radius: 18px 18px 0 0;
      max-height: 70dvh;
      transition: max-height 0.25s ease;
    }
    .panel-collapsed { max-height: 128px; }
    .panel-expanded { max-height: 70dvh; }
    .panel-drag-handle {
      display: block; width: 40px; height: 5px; background: #dadce0; border-radius: 3px;
      margin: 10px auto 4px auto; cursor: pointer;
    }
    .summary-time { font-size: 22px; }
    .poi-buttons { padding: 10px; }
    .nav-banner { border-radius: 0; left: 0; right: 0; top: env(safe-area-inset-top, 0px); }
    .fab-column { bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }
    .poi-card { left: 10px; right: 10px; bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
  }
`;

export default App;