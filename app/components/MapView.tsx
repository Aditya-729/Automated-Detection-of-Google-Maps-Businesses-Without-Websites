"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  Rectangle,
  TileLayer,
} from "react-leaflet";

interface MapBusiness {
  name: string;
  address: string;
  place_id: string;
  lat: number | null;
  lon: number | null;
}

interface MapTile {
  id: string;
  bounds: {
    west: number;
    east: number;
    north: number;
    south: number;
  };
}

interface MapCenter {
  lat: number;
  lon: number;
}

interface MapViewProps {
  center: MapCenter;
  radiusKm: number;
  tiles: MapTile[];
  businesses: MapBusiness[];
}

export default function MapView({
  center,
  radiusKm,
  tiles,
  businesses,
}: MapViewProps) {
  useEffect(() => {
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });
  }, []);

  const mapCenter = useMemo(
    () => [center.lat, center.lon] as [number, number],
    [center]
  );

  const mapZoom = useMemo(() => {
    if (radiusKm <= 20) {
      return 12;
    }
    if (radiusKm <= 40) {
      return 11;
    }
    if (radiusKm <= 120) {
      return 9;
    }
    if (radiusKm <= 300) {
      return 7;
    }
    if (radiusKm <= 600) {
      return 6;
    }
    return 5;
  }, [radiusKm]);

  const mapBusinesses = useMemo(
    () =>
      businesses.filter(
        (business) =>
          Number.isFinite(business.lat) && Number.isFinite(business.lon)
      ),
    [businesses]
  );

  const visibleBusinesses = useMemo(
    () => mapBusinesses.slice(0, 2000),
    [mapBusinesses]
  );

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      className="map-container"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Circle
        center={mapCenter}
        radius={radiusKm * 1000}
        pathOptions={{ color: "#2563eb", weight: 1 }}
      />
      {tiles.map((tile) => (
        <Rectangle
          key={tile.id}
          bounds={[
            [tile.bounds.south, tile.bounds.west],
            [tile.bounds.north, tile.bounds.east],
          ]}
          pathOptions={{ color: "#10b981", weight: 1, opacity: 0.6 }}
        />
      ))}
      {visibleBusinesses.map((business) => (
        <Marker
          key={business.place_id}
          position={[business.lat as number, business.lon as number]}
        >
          <Popup>
            <strong>{business.name}</strong>
            <br />
            {business.address}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
