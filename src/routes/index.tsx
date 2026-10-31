import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  Crosshair,
  Globe2,
  LocateFixed,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

type Coordinates = { lat: number; lon: number };
type Business = {
  id: number;
  name: string;
  category: string;
  lat: number;
  lon: number;
  address: string;
  phone?: string;
  website?: string;
  distance: number;
};

const categoryNames: Record<string, string> = {
  bakery: "Padaria",
  beauty_salon: "Salão de beleza",
  cafe: "Cafeteria",
  car_repair: "Oficina mecânica",
  clothes: "Loja de roupas",
  convenience: "Loja de conveniência",
  dentist: "Dentista",
  florist: "Floricultura",
  hairdresser: "Cabeleireiro",
  pharmacy: "Farmácia",
  restaurant: "Restaurante",
  supermarket: "Mercado",
  bank: "Banco",
  bar: "Bar",
  clinic: "Clínica",
  doctors: "Consultório médico",
  fast_food: "Lanchonete",
  pub: "Pub",
};

function distanceInKm(from: Coordinates, to: Coordinates) {
  const radians = Math.PI / 180;
  const dLat = (to.lat - from.lat) * radians;
  const dLon = (to.lon - from.lon) * radians;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * radians) *
      Math.cos(to.lat * radians) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(value));
}

function businessAddress(tags: Record<string, string>) {
  const street = [tags["addr:street"], tags["addr:housenumber"]]
    .filter(Boolean)
    .join(", ");
  return [street, tags["addr:suburb"] ?? tags["addr:city"]]
    .filter(Boolean)
    .join(" · ");
}

function mapBounds(center: Coordinates, radiusKm: number) {
  const latDelta = (radiusKm / 111) * 1.25;
  const lonDelta = latDelta / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLon: center.lon - lonDelta,
    maxLon: center.lon + lonDelta,
  };
}

function Index() {
  const [center, setCenter] = useState<Coordinates | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [radius, setRadius] = useState(3);
  const [searchedRadius, setSearchedRadius] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<"all" | "opportunity" | "website">("all");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const filteredBusinesses = useMemo(() => {
    return businesses.filter((business) => {
      const matchesRadius = business.distance <= radius;
      const matchesFilter =
        filter === "all" ||
        (filter === "opportunity" && !business.website) ||
        (filter === "website" && business.website);
      return matchesRadius && matchesFilter;
    });
  }, [businesses, filter, radius]);

  const opportunities = businesses.filter((business) => business.distance <= radius && !business.website);
  const selectedBusiness = businesses.find((business) => business.id === selectedId);
  const bounds = center ? mapBounds(center, radius / zoom) : null;
  const mapUrl = bounds
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}&layer=mapnik&marker=${center.lat},${center.lon}`
    : null;

  async function searchNearby(location?: Coordinates) {
    setLoading(true);
    setNotice("");
    try {
      let point = location;
      if (!point) {
        if (!navigator.geolocation) {
          throw new Error("Este navegador não oferece acesso à localização.");
        }
        point = await new Promise<Coordinates>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (position) =>
              resolve({
                lat: position.coords.latitude,
                lon: position.coords.longitude,
              }),
            () => reject(new Error("Não foi possível acessar sua localização.")),
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
          );
        });
      }

      const query = `[out:json][timeout:25];(nwr["shop"]["name"](around:${radius * 1000},${point.lat},${point.lon});nwr["craft"]["name"](around:${radius * 1000},${point.lat},${point.lon});nwr["office"]["name"](around:${radius * 1000},${point.lat},${point.lon});nwr["amenity"~"cafe|restaurant|fast_food|clinic|dentist|doctors|beauty_salon|hairdresser|pharmacy|bank|bar|pub"]["name"](around:${radius * 1000},${point.lat},${point.lon}););out center tags;`;
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: query,
      });
      if (!response.ok) throw new Error("O serviço de mapa está indisponível agora.");
      const data: { elements?: Array<Record<string, unknown>> } =
        await response.json();
      const results = (data.elements ?? [])
        .flatMap((element) => {
          const tags = element.tags as Record<string, string> | undefined;
          if (!tags?.name) return [];
          const position =
            typeof element.lat === "number" && typeof element.lon === "number"
              ? { lat: element.lat, lon: element.lon }
              : (element.center as Coordinates | undefined);
          if (!position) return [];
          const categoryKey =
            tags.shop ?? tags.craft ?? tags.office ?? tags.amenity ?? "local_business";
          return [
            {
              id: Number(element.id),
              name: tags.name,
              category:
                categoryNames[categoryKey] ??
                categoryKey.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
              lat: position.lat,
              lon: position.lon,
              address: businessAddress(tags) || "Endereço não informado",
              phone: tags.phone ?? tags["contact:phone"],
              website: tags.website ?? tags["contact:website"],
              distance: distanceInKm(point!, position),
            },
          ];
        })
        .sort((a, b) => a.distance - b.distance);

      setCenter(point);
      setBusinesses(results);
      setSearchedRadius(radius);
      setFilter("all");
      setSelectedId(results[0]?.id ?? null);
      if (!results.length) {
        setNotice("Não encontramos estabelecimentos nessa área. Tente aumentar o raio.");
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Não foi possível buscar empresas agora. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function searchAddress() {
    const address = searchText.trim();
    if (!address) {
      setNotice("Digite uma cidade ou endereço para buscar.");
      return;
    }
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
      );
      if (!response.ok) throw new Error("A busca de endereço está indisponível agora.");
      const results: Array<{ lat: string; lon: string; display_name: string }> =
        await response.json();
      if (!results.length) throw new Error("Não encontramos esse endereço. Tente outro.");
      const point = { lat: Number(results[0].lat), lon: Number(results[0].lon) };
      setSearchText(results[0].display_name.split(",").slice(0, 2).join(","));
      await searchNearby(point);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao localizar o endereço.");
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#inicio" aria-label="SemSite início">
          <span className="brand-mark"><MapPin size={19} strokeWidth={2.6} /></span>
          <span className="brand-name">sem<span>site</span></span>
          <span className="beta-tag">BETA</span>
        </a>

        <section className="intro" id="inicio">
          <p className="eyebrow"><span /> PROSPECÇÃO LOCAL</p>
          <h1>Encontre seu<br />próximo cliente.</h1>
          <p className="intro-copy">Descubra negócios por perto que podem crescer com uma presença digital.</p>
        </section>

        <form
          className="location-search"
          onSubmit={(event) => {
            event.preventDefault();
            void searchAddress();
          }}
        >
          <label htmlFor="location-search">LOCALIZAÇÃO</label>
          <div className="search-input-wrap">
            <Search size={17} />
            <input
              id="location-search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Endereço, bairro ou cidade"
            />
            {searchText && (
              <button
                type="button"
                className="clear-search"
                aria-label="Limpar busca"
                onClick={() => setSearchText("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button className="text-search" type="submit" disabled={loading}>
            Buscar este lugar <ArrowRight size={14} />
          </button>
        </form>

        <div className="radius-control">
          <div className="radius-heading"><span>Raio de busca</span><strong>{radius} km</strong></div>
          <input
            aria-label="Raio da busca em quilômetros"
            type="range"
            min="1"
            max="10"
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
          <div className="range-labels"><span>1 km</span><span>10 km</span></div>
        </div>

        <button className="primary-button" onClick={() => void searchNearby(center ?? undefined)} disabled={loading}>
          {loading ? <span className="spinner" /> : <Crosshair size={17} />}
          <span>
            {loading
              ? "Buscando negócios…"
              : center
                ? searchedRadius !== radius
                  ? "Atualizar resultados"
                  : "Buscar nesta área"
                : "Buscar perto de mim"}
          </span>
          {!loading && <ArrowUpRight className="button-trailing" size={16} />}
        </button>

        <div className="list-heading">
          <span>EMPRESAS NA REGIÃO</span>
        </div>
        <div className="filter-tabs" role="group" aria-label="Filtrar empresas">
          <button className={filter === "all" ? "filter-tab active" : "filter-tab"} onClick={() => setFilter("all")}>Todas <span>{businesses.filter((business) => business.distance <= radius).length}</span></button>
          <button className={filter === "opportunity" ? "filter-tab active" : "filter-tab"} onClick={() => setFilter("opportunity")}>Sem site <span>{opportunities.length}</span></button>
          <button className={filter === "website" ? "filter-tab active" : "filter-tab"} onClick={() => setFilter("website")}>Com site</button>
        </div>

        <div className="results-toolbar">
          <span>{filteredBusinesses.length} {filteredBusinesses.length === 1 ? "empresa encontrada" : "empresas encontradas"}</span>
          <button onClick={() => setBusinesses((items) => [...items].sort((a, b) => a.distance - b.distance))}><ArrowDownUp size={13} /> Mais próximas</button>
        </div>

        <div className="business-list">
          {filteredBusinesses.map((business) => (
            <button
              key={business.id}
              className={selectedId === business.id ? "business-card selected" : "business-card"}
              onClick={() => setSelectedId(business.id)}
            >
              <span className={business.website ? "business-icon has-website" : "business-icon"}>
                <Building2 size={17} />
              </span>
              <span className="business-details">
                <span className="business-name">{business.name}</span>
                <span className="business-category">{business.category}</span>
                <span className={business.website ? "website-status known" : "website-status"}>
                  <i />{business.website ? "Site listado" : "Nenhum site listado"}
                </span>
              </span>
              <span className="business-distance">{business.distance < 1 ? `${Math.round(business.distance * 1000)} m` : `${business.distance.toFixed(1).replace(".", ",")} km`}</span>
            </button>
          ))}
          {!filteredBusinesses.length && (
            <div className="empty-state">
              <span className="empty-icon"><MapPin size={19} /></span>
              <b>{businesses.length ? "Nenhuma empresa neste filtro" : "Sua próxima oportunidade pode estar perto"}</b>
              <p>{businesses.length ? "Escolha outro filtro ou faça uma nova busca." : "Busque sua localização para encontrar empresas e verificar os sites listados no mapa."}</p>
              {!businesses.length && <button onClick={() => void searchNearby()} disabled={loading}>Começar busca <ArrowRight size={14} /></button>}
            </div>
          )}
        </div>

        <div className="sidebar-footnote"><Globe2 size={14} /><span>Dados abertos do OpenStreetMap</span><ChevronDown size={14} /></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">Explorar <span>/</span> <strong>Mapa de oportunidades</strong></div>
          <div className="topbar-actions"><span className="data-status"><i /> DADOS DO OPENSTREETMAP</span></div>
        </header>

        <div className="map-workspace">
          {mapUrl ? (
            <iframe className="osm-map" src={mapUrl} title="Mapa OpenStreetMap da área pesquisada" loading="lazy" />
          ) : (
            <div className="map-placeholder" aria-label="Mapa aguardando localização">
              <div className="placeholder-grid" />
              <svg className="placeholder-roads" viewBox="0 0 1200 850" preserveAspectRatio="none" aria-hidden="true">
                <path d="M-40 150 C200 210 330 90 520 180 S900 260 1250 120 M-20 340 C220 280 370 410 590 330 S920 300 1230 420 M-50 560 C200 500 370 650 620 550 S970 600 1250 510 M-10 740 C200 690 390 800 640 720 S930 760 1240 710 M180 -20 C260 170 140 330 260 480 S330 700 230 880 M500 -30 C570 160 450 330 560 500 S610 720 560 880 M840 -40 C750 170 860 340 780 510 S880 720 820 890 M1100 -30 C990 170 1110 380 1000 570 S1090 760 1040 900" />
              </svg>
              <span className="placeholder-label district-label">BUSCANDO NA SUA REGIÃO</span>
              <span className="placeholder-label street-label street-a">COMÉRCIO LOCAL</span>
              <div className="placeholder-center"><span /></div>
              <div className="welcome-card"><span className="welcome-icon"><MapPin size={18} /></span><b>Comece pelo seu entorno</b><p>Ative sua localização ou pesquise um endereço para ver empresas no mapa.</p><button onClick={() => void searchNearby()} disabled={loading}>{loading ? "Buscando…" : "Usar minha localização"}<ArrowRight size={14} /></button></div>
              <span className="map-credit placeholder-credit">Mapa ilustrativo · OpenStreetMap</span>
            </div>
          )}

          {center && bounds && filteredBusinesses.map((business) => {
            const left = ((business.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100;
            const top = (1 - (business.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
            if (left < 1 || left > 99 || top < 1 || top > 99) return null;
            return (
              <button
                key={business.id}
                className={`${business.website ? "map-marker has-website" : "map-marker"}${selectedId === business.id ? " selected" : ""}`}
                style={{ left: `${left}%`, top: `${top}%` }}
                onClick={() => setSelectedId(business.id)}
                aria-label={`${business.name}, ${business.website ? "site listado" : "nenhum site listado"}`}
                title={business.name}
              >
                <span>{business.website ? <Check size={13} /> : <Building2 size={14} />}</span>
              </button>
            );
          })}

          {center && (
            <>
              <div className="map-tools" aria-label="Controles do mapa">
                <button title="Centralizar na minha localização" onClick={() => void searchNearby()}><LocateFixed size={17} /></button>
                <button title="Aproximar" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}><span>+</span></button>
                <button title="Afastar" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}><span>−</span></button>
              </div>
              <div className="map-legend"><span><i className="legend-opportunity" />Sem site listado</span><span><i className="legend-website" />Site listado</span></div>
              <span className="map-credit">© OpenStreetMap contributors</span>
            </>
          )}

          {selectedBusiness && (
            <article className="business-popup">
              <button className="popup-close" aria-label="Fechar detalhes" onClick={() => setSelectedId(null)}><X size={15} /></button>
              <div className="popup-heading"><span className="business-icon"><Building2 size={17} /></span><div><h2>{selectedBusiness.name}</h2><span>{selectedBusiness.category}</span></div></div>
              <p className="popup-address"><MapPin size={14} />{selectedBusiness.address}</p>
              {selectedBusiness.phone && <p className="popup-phone">{selectedBusiness.phone}</p>}
              <div className="popup-bottom"><span className={selectedBusiness.website ? "website-status known" : "website-status"}><i />{selectedBusiness.website ? "Site listado" : "Nenhum site listado"}</span><a href={`https://www.google.com/maps/search/?api=1&query=${selectedBusiness.lat},${selectedBusiness.lon}`} target="_blank" rel="noreferrer">Abrir rota <ArrowUpRight size={14} /></a></div>
            </article>
          )}

          {notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={15} /></button></div>}
        </div>

        <footer className="workspace-footer"><span className="footer-mark"><Globe2 size={16} /></span><span>Oportunidades locais, <b>bem mais perto.</b></span><span className="footer-disclaimer">“Sem site” significa que nenhum site foi encontrado nos dados do OpenStreetMap.</span></footer>
      </section>
    </main>
  );
}
